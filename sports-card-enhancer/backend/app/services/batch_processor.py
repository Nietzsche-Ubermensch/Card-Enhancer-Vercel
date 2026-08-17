"""Batch processing service with per-card state and bounded concurrency.

Design guarantees (per product directive):
- Each card has an INDEPENDENT state (QUEUED/VALIDATING/PROCESSING/
  COMPLETED/FAILED/RETRYING/CANCELLED).
- One bad file must NOT fail the batch — failures are isolated per card.
- Concurrency is BOUNDED (a per-card semaphore); heavy jobs do not all start
  at once.
- Failed cards can be RETRIED individually or in bulk.
- The ORIGINAL file is preserved; processing writes distinct artifacts.
- The core pipeline never requires an AI provider.
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List, Optional

from app.core.config import settings
from app.models.schemas import (
    BatchJob, CardImage, CardState, EnhancementSettings, JobStatus,
    WebSocketProgressMessage,
)
from app.services.card_pipeline import CardPipeline
from app.services.export_service import export_service
from app.utils.image_utils import ImageProcessor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class CardRecord:
    """Internal per-card state."""
    id: str
    source_path: str
    state: CardState = CardState.QUEUED
    output_path: Optional[str] = None
    artifacts: Dict = field(default_factory=dict)
    orientation: Optional[Dict] = None
    crop_confidence: Optional[float] = None
    metrics: Optional[Dict] = None
    warnings: List[str] = field(default_factory=list)
    error: Optional[str] = None
    retry_count: int = 0
    processing_time_ms: Optional[int] = None

    @property
    def filename(self) -> str:
        return os.path.basename(self.source_path)


@dataclass
class Job:
    """Internal job representation (a batch of cards)."""
    id: str
    status: JobStatus
    created_at: datetime
    updated_at: datetime
    settings: EnhancementSettings
    output_dir: str
    cards: List[CardRecord] = field(default_factory=list)
    progress: float = 0.0
    error_message: Optional[str] = None
    total_processing_time_ms: int = 0
    process_options: Dict = field(default_factory=dict)

    @property
    def image_paths(self) -> List[str]:
        return [c.source_path for c in self.cards]

    @property
    def results(self) -> Dict[str, Dict]:
        """Legacy view: map source_path -> result dict (for old endpoints)."""
        return {
            c.source_path: {
                "success": c.state == CardState.COMPLETED,
                "output_path": c.output_path,
                "error": c.error,
                "blemishes": [],
            }
            for c in self.cards
        }

    def card_by_id(self, card_id: str) -> Optional[CardRecord]:
        for c in self.cards:
            if c.id == card_id:
                return c
        return None

    def counts(self) -> Dict[str, float]:
        """Aggregate per-card state counts for progress reporting."""
        total = len(self.cards)
        queued = sum(1 for x in self.cards if x.state in (CardState.QUEUED, CardState.RETRYING))
        running = sum(1 for x in self.cards if x.state in (CardState.VALIDATING, CardState.PROCESSING))
        completed = sum(1 for x in self.cards if x.state == CardState.COMPLETED)
        failed = sum(1 for x in self.cards if x.state == CardState.FAILED)
        done = completed + failed
        return {
            "total": total,
            "queued": queued,
            "running": running,
            "completed": completed,
            "failed": failed,
            "progress": round((done / total) * 100, 1) if total else 0.0,
        }


class BatchProcessor:
    """Manages batch card-processing jobs with bounded per-card concurrency."""

    def __init__(self, max_concurrent: int = 4, max_concurrent_cards: int = 4):
        self.max_concurrent = max_concurrent
        self.jobs: Dict[str, Job] = {}
        self.queue: asyncio.Queue = asyncio.Queue()
        self.semaphore = asyncio.Semaphore(max_concurrent)             # job-level
        self.card_semaphore = asyncio.Semaphore(max_concurrent_cards)  # card-level
        self.card_pipeline = CardPipeline()
        self.image_processor = ImageProcessor()
        self.progress_callbacks: Dict[str, List[Callable]] = {}
        self.worker_task: Optional[asyncio.Task] = None

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #
    async def start(self):
        if self.worker_task is None:
            self.worker_task = asyncio.create_task(self._worker())
            logger.info("Batch processor started")

    async def stop(self):
        if self.worker_task:
            self.worker_task.cancel()
            try:
                await self.worker_task
            except asyncio.CancelledError:
                pass
            self.worker_task = None
            logger.info("Batch processor stopped")

    # ------------------------------------------------------------------ #
    # Submission
    # ------------------------------------------------------------------ #
    async def submit_job(self, image_paths: List[str],
                         enhancement_settings: EnhancementSettings,
                         process_options: Optional[Dict] = None) -> str:
        """Submit a new batch job of card images."""
        job_id = str(uuid.uuid4())
        output_dir = settings.OUTPUT_DIR / job_id
        output_dir.mkdir(parents=True, exist_ok=True)

        cards = [CardRecord(id=str(uuid.uuid4()), source_path=p) for p in image_paths]

        job = Job(
            id=job_id,
            status=JobStatus.PENDING,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            settings=enhancement_settings,
            output_dir=str(output_dir),
            cards=cards,
            process_options=process_options or {},
        )

        self.jobs[job_id] = job
        await self.queue.put(job_id)
        logger.info("Job %s submitted with %d cards", job_id, len(cards))
        return job_id

    async def get_job(self, job_id: str) -> Optional[Job]:
        return self.jobs.get(job_id)

    async def cancel_job(self, job_id: str) -> bool:
        job = self.jobs.get(job_id)
        if job and job.status in [JobStatus.PENDING, JobStatus.PROCESSING]:
            job.status = JobStatus.CANCELLED
            for card in job.cards:
                if card.state in (CardState.QUEUED, CardState.RETRYING,
                                  CardState.VALIDATING, CardState.PROCESSING):
                    card.state = CardState.CANCELLED
            job.updated_at = datetime.now()
            return True
        return False

    # ------------------------------------------------------------------ #
    # Retry
    # ------------------------------------------------------------------ #
    async def retry_failed(self, job_id: str,
                           card_id: Optional[str] = None) -> int:
        """Requeue failed cards for a job.

        Args:
            job_id: The job to retry within.
            card_id: Retry only this card; when None, retry ALL failed cards.

        Returns:
            Number of cards requeued.
        """
        job = self.jobs.get(job_id)
        if job is None:
            return 0

        targets = [
            c for c in job.cards
            if c.state == CardState.FAILED and (card_id is None or c.id == card_id)
        ]
        for card in targets:
            card.state = CardState.RETRYING
            card.error = None
            card.retry_count += 1
            await self.queue.put((job_id, card.id))
        if targets:
            job.status = JobStatus.PROCESSING
            job.updated_at = datetime.now()
        return len(targets)

    # ------------------------------------------------------------------ #
    # Progress callbacks
    # ------------------------------------------------------------------ #
    def register_progress_callback(self, job_id: str, callback: Callable):
        self.progress_callbacks.setdefault(job_id, []).append(callback)

    def unregister_progress_callback(self, job_id: str, callback: Callable):
        if job_id in self.progress_callbacks:
            self.progress_callbacks[job_id] = [
                cb for cb in self.progress_callbacks[job_id] if cb != callback
            ]

    # ------------------------------------------------------------------ #
    # Worker
    # ------------------------------------------------------------------ #
    async def _worker(self):
        """Process jobs and individual card retries from the queue."""
        while True:
            try:
                item = await self.queue.get()

                # Item may be a job_id (whole job) or (job_id, card_id) retry.
                if isinstance(item, tuple):
                    job_id, card_id = item
                    job = self.jobs.get(job_id)
                    if job is not None:
                        card = job.card_by_id(card_id)
                        if card is not None and card.state in (
                            CardState.RETRYING, CardState.QUEUED
                        ):
                            async with self.card_semaphore:
                                await self._process_card(job, card)
                            await self._finalize_if_done(job)
                    self.queue.task_done()
                    continue

                job = self.jobs.get(item)
                if job is None or job.status == JobStatus.CANCELLED:
                    self.queue.task_done()
                    continue

                async with self.semaphore:
                    await self._process_job(job)

                self.queue.task_done()

            except asyncio.CancelledError:
                break
            except Exception as e:  # pragma: no cover - defensive
                logger.error("Worker error: %s", e)

    async def _process_job(self, job: Job):
        """Process all cards in a job with bounded per-card concurrency."""
        start_time = datetime.now()
        job.status = JobStatus.PROCESSING
        job.updated_at = datetime.now()
        logger.info("Processing job %s (%d cards)", job.id, len(job.cards))

        try:
            async def run_card(card: CardRecord):
                if job.status == JobStatus.CANCELLED:
                    card.state = CardState.CANCELLED
                    return
                async with self.card_semaphore:
                    await self._process_card(job, card)
                await self._notify_progress(job, f"Processed {card.filename}")

            # Bounded concurrency: card_semaphore caps simultaneous heavy work.
            await asyncio.gather(*(run_card(c) for c in job.cards))

            await self._finalize_if_done(job)

            end_time = datetime.now()
            job.total_processing_time_ms = int(
                (end_time - start_time).total_seconds() * 1000
            )
            job.updated_at = datetime.now()
        except Exception as e:
            job.status = JobStatus.FAILED
            job.error_message = str(e)
            job.updated_at = datetime.now()
            logger.error("Job %s failed: %s", job.id, e)

    async def _process_card(self, job: Job, card: CardRecord):
        """Process a single card through the pipeline. Failure is isolated."""
        start = datetime.now()
        card.state = CardState.VALIDATING
        try:
            # VALIDATING: confirm the file exists and is loadable.
            if not os.path.exists(card.source_path):
                raise FileNotFoundError(f"source file missing: {card.source_path}")

            card.state = CardState.PROCESSING
            opts = job.process_options
            outcome = self.card_pipeline.process(
                card.source_path,
                output_dir=os.path.join(job.output_dir, card.id),
                manual_orientation=opts.get("manual_orientation"),
                output_format=opts.get("output_format", job.settings.output_format),
                output_quality=opts.get("output_quality", job.settings.output_quality),
                output_dpi=opts.get("output_dpi", job.settings.output_dpi),
                aggressive=opts.get("aggressive", False),
            )

            card.output_path = outcome.artifacts.optimized
            card.artifacts = outcome.artifacts.as_dict()
            card.orientation = outcome.orientation
            card.crop_confidence = outcome.crop_confidence
            card.metrics = outcome.metrics.as_dict()
            card.warnings = outcome.warnings
            card.state = CardState.COMPLETED
            card.error = None
        except Exception as e:  # failure isolated to this card
            card.state = CardState.FAILED
            card.error = str(e)
            logger.warning("Card %s failed: %s", card.filename, e)
        finally:
            card.processing_time_ms = int(
                (datetime.now() - start).total_seconds() * 1000
            )

    async def _finalize_if_done(self, job: Job):
        """Set the job status once all cards have reached a terminal state."""
        terminal = {CardState.COMPLETED, CardState.FAILED, CardState.CANCELLED}
        if not job.cards or not all(c.state in terminal for c in job.cards):
            return

        counts = job.counts()
        job.progress = 100.0
        if counts["completed"] == 0 and counts["failed"] > 0:
            job.status = JobStatus.FAILED
            job.error_message = "All cards failed to process"
        elif job.status != JobStatus.CANCELLED:
            job.status = JobStatus.COMPLETED
        job.updated_at = datetime.now()

        # Pre-build a ZIP of completed cards for convenience.
        completed = [c for c in job.cards if c.state == CardState.COMPLETED]
        if len(completed) > 1:
            await self._create_zip_archive(job)
        await self._notify_progress(job, "Complete")

    # ------------------------------------------------------------------ #
    # Export
    # ------------------------------------------------------------------ #
    async def export(self, job_id: str,
                     image_ids: Optional[List[str]] = None,
                     fmt: str = "zip") -> Optional[Dict]:
        """Export selected (or all completed) cards.

        Returns a dict with download path/url info, or None if nothing to export.
        """
        job = self.jobs.get(job_id)
        if job is None:
            return None

        cards = [c for c in job.cards if c.state == CardState.COMPLETED]
        if image_ids:
            wanted = set(image_ids)
            cards = [c for c in cards if c.id in wanted]
        if not cards:
            return None

        items = []
        for c in cards:
            dims = None
            if c.output_path and os.path.exists(c.output_path):
                try:
                    from PIL import Image
                    with Image.open(c.output_path) as im:
                        dims = {"width": im.width, "height": im.height}
                except Exception:
                    dims = None
            items.append({
                "output_path": c.output_path,
                "source_filename": c.filename,
                "orientation": c.orientation,
                "crop_confidence": c.crop_confidence,
                "dimensions": dims,
                "processing_status": c.state.value,
                "warnings": c.warnings,
            })

        suffix = "selected" if image_ids else "all"
        zip_path = settings.OUTPUT_DIR / f"{job_id}_export_{suffix}.zip"
        result = export_service.create_export_zip(items, str(zip_path), job_id=job_id)
        result["download_url"] = f"/outputs/{zip_path.name}"
        return result

    async def _create_zip_archive(self, job: Job):
        """Convenience ZIP of all completed cards."""
        return await self.export(job.id, image_ids=None, fmt="zip")

    # ------------------------------------------------------------------ #
    # Progress notification
    # ------------------------------------------------------------------ #
    async def _notify_progress(self, job: Job, message: str):
        counts = job.counts()
        message_obj = WebSocketProgressMessage(
            job_id=job.id,
            image_id=None,
            status=job.status,
            progress=counts["progress"],
            message=message,
            timestamp=datetime.now(),
        )
        for callback in self.progress_callbacks.get(job.id, []):
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(message_obj)
                else:
                    callback(message_obj)
            except Exception as e:  # pragma: no cover
                logger.error("Progress callback error: %s", e)

    # ------------------------------------------------------------------ #
    # Conversion to API schema
    # ------------------------------------------------------------------ #
    def to_batch_job(self, job: Job) -> BatchJob:
        images = []
        for card in job.cards:
            fmt = os.path.splitext(card.source_path)[1].lower().replace(".", "")
            images.append(CardImage(
                id=card.id,
                filename=card.filename,
                original_path=card.source_path,
                processed_path=card.output_path,
                width=0,
                height=0,
                format=fmt,
                size_bytes=os.path.getsize(card.source_path)
                           if os.path.exists(card.source_path) else 0,
                status=self._card_to_job_status(card.state),
                progress=100.0 if card.state == CardState.COMPLETED else 0.0,
                card_state=card.state,
                orientation=card.orientation,
                crop_confidence=card.crop_confidence,
                metrics=card.metrics,
                artifacts=card.artifacts,
                warnings=card.warnings,
                retry_count=card.retry_count,
                error_message=card.error,
                processing_time_ms=card.processing_time_ms,
            ))

        counts = job.counts()
        zip_path = None
        potential = settings.OUTPUT_DIR / f"{job.id}_export_all.zip"
        if potential.exists():
            zip_path = str(potential)

        return BatchJob(
            id=job.id,
            status=job.status,
            created_at=job.created_at,
            updated_at=job.updated_at,
            total_images=counts["total"],
            completed_images=counts["completed"],
            failed_images=counts["failed"],
            settings=job.settings,
            images=images,
            output_zip_path=zip_path,
            total_processing_time_ms=job.total_processing_time_ms,
            error_message=job.error_message,
        )

    @staticmethod
    def _card_to_job_status(state: CardState) -> JobStatus:
        """Map a per-card state to the legacy job status enum for compatibility."""
        return {
            CardState.QUEUED: JobStatus.PENDING,
            CardState.VALIDATING: JobStatus.PROCESSING,
            CardState.PROCESSING: JobStatus.PROCESSING,
            CardState.COMPLETED: JobStatus.COMPLETED,
            CardState.FAILED: JobStatus.FAILED,
            CardState.RETRYING: JobStatus.PROCESSING,
            CardState.CANCELLED: JobStatus.CANCELLED,
        }[state]


# Global batch processor instance.
batch_processor = BatchProcessor(max_concurrent=settings.MAX_CONCURRENT_JOBS)
