"""Bounded-concurrency batch and card processing workflow."""
from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np

from app.core.config import settings
from app.models.schemas import (
    ArtifactRecord,
    ArtifactType,
    BatchRecord,
    BatchStatus,
    CardRecord,
    CardStage,
    CardStatus,
    DescratchStrength,
    Point,
    SourceRecord,
    SourceStatus,
)
from app.services.card_detection import card_detector
from app.services.enhancement_service import enhancement_service
from app.services.state_store import state_store
from app.utils.image_utils import ImageProcessor, QualityAnalyzer, calculate_source_hash, decode_image, sanitize_filename, store_original, validate_upload


@dataclass
class WorkItem:
    kind: str
    payload: dict[str, Any]


class BatchProcessor:
    """Authoritative backend workflow controller."""

    def __init__(self) -> None:
        self.queue: asyncio.Queue[WorkItem] = asyncio.Queue()
        self.workers: list[asyncio.Task[None]] = []
        self.running = False
        self.sr_semaphore = asyncio.Semaphore(settings.REAL_ESRGAN_CONCURRENCY)
        self.detect_semaphore = asyncio.Semaphore(settings.YOLO_CONCURRENCY)

    async def start(self) -> None:
        if self.running:
            return
        self.running = True
        self.workers = [asyncio.create_task(self._worker()) for _ in range(settings.BATCH_CONCURRENCY)]

    async def stop(self) -> None:
        self.running = False
        for worker in self.workers:
            worker.cancel()
        for worker in self.workers:
            try:
                await worker
            except asyncio.CancelledError:
                continue
        self.workers = []

    async def _worker(self) -> None:
        while True:
            item = await self.queue.get()
            try:
                if item.kind == "process_source":
                    await self.process_source(item.payload["source_id"])
                elif item.kind == "process_card":
                    await self.process_card(
                        item.payload["card_id"],
                        item.payload["operation"],
                        item.payload["parameters"],
                    )
            finally:
                self.queue.task_done()

    async def create_batch(self) -> BatchRecord:
        now = datetime.utcnow()
        batch = BatchRecord(
            batch_id=str(uuid.uuid4()),
            status=BatchStatus.QUEUED,
            created_at=now,
            updated_at=now,
        )
        await state_store.create_batch(batch)
        return batch

    async def get_batch_state(self, batch_id: str) -> tuple[BatchRecord | None, list[SourceRecord], list[CardRecord]]:
        batch = await state_store.get_batch(batch_id)
        sources = await state_store.get_sources_for_batch(batch_id)
        cards = await state_store.get_cards_for_batch(batch_id)
        return batch, sources, cards

    async def add_sources_to_batch(self, batch_id: str, files: list[tuple[str, bytes, str | None]]) -> list[str]:
        batch = await state_store.get_batch(batch_id)
        if batch is None:
            raise ValueError("Batch not found")
        if batch.source_count + len(files) > settings.MAX_BATCH_SIZE:
            raise ValueError("Batch size exceeds the supported limit")
        source_ids: list[str] = []
        source_index_offset = batch.source_count
        for offset, (filename, content, content_type) in enumerate(files, start=1):
            metadata = validate_upload(content, filename, content_type)
            source_id = str(uuid.uuid4())
            safe_filename = metadata["safe_filename"]
            source_dir = settings.sources_root / source_id
            original_path = store_original(source_dir, safe_filename, content)
            source = SourceRecord(
                source_id=source_id,
                batch_id=batch_id,
                original_filename=filename,
                safe_filename=safe_filename,
                content_hash=metadata["content_hash"],
                mime_type=metadata["mime_type"],
                width=metadata["width"],
                height=metadata["height"],
                byte_size=metadata["byte_size"],
                status=SourceStatus.UPLOADING,
                created_at=datetime.utcnow(),
                original_relative_path=str(original_path.relative_to(settings.STORAGE_DIR)),
                exif_orientation=metadata["exif_orientation"],
                warnings=[],
            )
            await state_store.upsert_source(source)
            await state_store.attach_source_to_batch(batch_id, source_id)
            source_ids.append(source_id)
            await self.queue.put(WorkItem("process_source", {"source_id": source_id, "source_index": source_index_offset + offset}))
        await state_store.update_batch_state(batch_id)
        return source_ids

    async def process_source(self, source_id: str) -> None:
        source = await state_store.get_source(source_id)
        if source is None:
            return
        if source.status == SourceStatus.CANCELLED:
            return
        source.status = SourceStatus.VALIDATING
        await state_store.upsert_source(source)
        batch = await state_store.get_batch(source.batch_id)
        if batch is None:
            return
        original_path = settings.STORAGE_DIR / source.original_relative_path
        try:
            content = original_path.read_bytes()
            if calculate_source_hash(content) != source.content_hash:
                raise ValueError("Original source hash verification failed.")
            image, decoded = decode_image(content)
            source.width = decoded["width"]
            source.height = decoded["height"]
            source.status = SourceStatus.PROCESSING
            source.exif_orientation = decoded["exif_orientation"]
            await state_store.upsert_source(source)

            async with self.detect_semaphore:
                detections = card_detector.detect_cards(image)
            if not detections:
                raise ValueError("No card was detected in this source.")
            display_start = batch.detected_card_count + 1
            created_cards = 0
            for index, detection in enumerate(detections, start=1):
                card_id = str(uuid.uuid4())
                now = datetime.utcnow()
                card = CardRecord(
                    card_id=card_id,
                    batch_id=source.batch_id,
                    source_id=source.source_id,
                    source_index=batch.source_ids.index(source.source_id) + 1,
                    display_index=display_start + created_cards,
                    detector_method=detection.detector_method,
                    detection_confidence=round(detection.confidence, 4),
                    polygon=[Point(x=float(point[0]), y=float(point[1])) for point in detection.polygon],
                    corners=[],
                    centroid=Point(x=float(detection.centroid[0]), y=float(detection.centroid[1])),
                    geometry_method="",
                    geometry_confidence=0.0,
                    status=CardStatus.PROCESSING,
                    current_stage=CardStage.GEOMETRY,
                    progress=25.0,
                    created_at=now,
                    updated_at=now,
                )
                await state_store.upsert_card(card)
                await state_store.attach_card_to_batch(source.batch_id, card.card_id)
                try:
                    geometry = card_detector.extract_quad(detection.polygon, image.shape)
                    card.corners = [Point(x=float(point[0]), y=float(point[1])) for point in geometry.corners]
                    card.geometry_method = geometry.geometry_method
                    card.geometry_confidence = geometry.geometry_confidence
                    card.warnings.extend(geometry.warnings)
                    card.progress = 45.0
                    card.current_stage = CardStage.RECTIFYING

                    original_crop = card_detector.crop_original_source(image, geometry.corners)
                    original_source_artifact = await self.save_artifact(
                        card=card,
                        source=source,
                        image=original_crop,
                        artifact_type=ArtifactType.ORIGINAL_SOURCE,
                        parent_artifact_id=None,
                        processing_parameters={"detector_method": card.detector_method},
                        extension="png",
                    )
                    card.original_source_artifact_id = original_source_artifact.artifact_id

                    rectified = card_detector.rectify_card(image, geometry.corners)
                    prepared = enhancement_service.prepare_rectified(rectified)
                    orientation = card_detector.detect_orientation(prepared, source.exif_orientation)
                    oriented = card_detector.apply_orientation(prepared, orientation.degrees)
                    rectified_artifact = await self.save_artifact(
                        card=card,
                        source=source,
                        image=oriented,
                        artifact_type=ArtifactType.RECTIFIED,
                        parent_artifact_id=original_source_artifact.artifact_id,
                        processing_parameters={
                            "orientation_degrees": orientation.degrees,
                            "orientation_confidence": orientation.confidence,
                            "orientation_method": orientation.method,
                            "geometry_method": geometry.geometry_method,
                            "geometry_confidence": geometry.geometry_confidence,
                        },
                        extension=settings.DEFAULT_OUTPUT_FORMAT,
                    )
                    card.rectified_artifact_id = rectified_artifact.artifact_id
                    card.orientation_degrees = orientation.degrees
                    card.orientation_confidence = orientation.confidence
                    card.orientation_method = orientation.method
                    card.progress = 100.0
                    card.current_stage = CardStage.READY
                    card.status = CardStatus.READY
                    card.quality = QualityAnalyzer.summarize(oriented)
                except Exception as exc:
                    card.status = CardStatus.FAILED
                    card.current_stage = CardStage.FAILED
                    card.progress = 100.0
                    card.error_code = "GEOMETRY_FAILED"
                    card.error_message = str(exc)
                    card.retryable = True
                card.attempt_count += 1
                card.updated_at = datetime.utcnow()
                await state_store.upsert_card(card)
                created_cards += 1
            source.detected_card_count = created_cards
            source.status = SourceStatus.COMPLETED if created_cards else SourceStatus.FAILED
            if created_cards == 0:
                source.error_code = "NO_CARDS_DETECTED"
                source.error_message = "No card was detected in this source."
        except Exception as exc:
            source.status = SourceStatus.FAILED
            source.error_code = "SOURCE_PROCESSING_FAILED"
            source.error_message = str(exc)
        await state_store.upsert_source(source)
        await state_store.update_batch_state(source.batch_id)

    async def retry_source(self, source_id: str) -> None:
        source = await state_store.get_source(source_id)
        if source is None:
            return
        source.status = SourceStatus.UPLOADING
        source.error_code = None
        source.error_message = None
        await state_store.upsert_source(source)
        await self.queue.put(WorkItem("process_source", {"source_id": source_id}))

    async def cancel_source(self, source_id: str) -> None:
        source = await state_store.get_source(source_id)
        if source is None:
            return
        source.status = SourceStatus.CANCELLED
        await state_store.upsert_source(source)
        await state_store.update_batch_state(source.batch_id)

    async def process_card(self, card_id: str, operation: str, parameters: dict[str, Any]) -> None:
        card = await state_store.get_card(card_id)
        if card is None:
            return
        source = await state_store.get_source(card.source_id)
        if source is None or card.rectified_artifact_id is None:
            return
        rectified_artifact = await state_store.get_artifact(card.rectified_artifact_id)
        if rectified_artifact is None:
            return
        rectified_image = ImageProcessor.load_image(settings.STORAGE_DIR / rectified_artifact.relative_path)
        card.status = CardStatus.PROCESSING
        card.current_stage = {
            "upscale": CardStage.UPSCALING,
            "descratch": CardStage.DESCRATCHING,
            "descratch_upscale": CardStage.DESCRATCHING_UPSCALING,
            "retry": CardStage.RETRYING,
        }.get(operation, CardStage.READY)
        card.progress = 35.0
        card.updated_at = datetime.utcnow()
        await state_store.upsert_card(card)
        try:
            if operation == "upscale":
                scale = int(parameters.get("scale", 2))
                async with self.sr_semaphore:
                    upscaled, metadata = enhancement_service.upscale_card(rectified_image, scale)
                artifact = await self.save_artifact(
                    card,
                    source,
                    upscaled,
                    ArtifactType.UPSCALED,
                    card.rectified_artifact_id,
                    metadata,
                    extension=settings.DEFAULT_OUTPUT_FORMAT,
                )
                card.upscaled_artifact_id = artifact.artifact_id
            elif operation == "descratch":
                strength = str(parameters.get("strength", DescratchStrength.MEDIUM.value))
                descratched, metadata, warnings, success = enhancement_service.apply_descratch(rectified_image, strength)
                card.warnings = list(dict.fromkeys(card.warnings + warnings))
                output_image = descratched if success and descratched is not None else rectified_image.copy()
                metadata = dict(metadata)
                metadata["applied"] = bool(success and descratched is not None)
                artifact = await self.save_artifact(
                    card,
                    source,
                    output_image,
                    ArtifactType.DESCRATCHED,
                    card.rectified_artifact_id,
                    metadata,
                    extension=settings.DEFAULT_OUTPUT_FORMAT,
                )
                card.descratched_artifact_id = artifact.artifact_id
            elif operation == "descratch_upscale":
                strength = str(parameters.get("strength", DescratchStrength.MEDIUM.value))
                scale = int(parameters.get("scale", 2))
                async with self.sr_semaphore:
                    combined, metadata, warnings, success = enhancement_service.create_descratched_upscaled(rectified_image, strength, scale)
                card.warnings = list(dict.fromkeys(card.warnings + warnings))
                descratched_source, descratch_only_metadata, _, _ = enhancement_service.apply_descratch(rectified_image, strength)
                if descratched_source is not None:
                    descratched_artifact = await self.save_artifact(
                        card,
                        source,
                        descratched_source,
                        ArtifactType.DESCRATCHED,
                        card.rectified_artifact_id,
                        descratch_only_metadata,
                        extension=settings.DEFAULT_OUTPUT_FORMAT,
                    )
                    card.descratched_artifact_id = descratched_artifact.artifact_id
                    parent_id = descratched_artifact.artifact_id
                else:
                    descratch_only_metadata = dict(descratch_only_metadata)
                    descratch_only_metadata["applied"] = False
                    descratched_artifact = await self.save_artifact(
                        card,
                        source,
                        rectified_image.copy(),
                        ArtifactType.DESCRATCHED,
                        card.rectified_artifact_id,
                        descratch_only_metadata,
                        extension=settings.DEFAULT_OUTPUT_FORMAT,
                    )
                    card.descratched_artifact_id = descratched_artifact.artifact_id
                    parent_id = descratched_artifact.artifact_id
                if not success or combined is None:
                    async with self.sr_semaphore:
                        combined, upscale_metadata = enhancement_service.upscale_card(rectified_image, scale)
                    metadata = dict(descratch_only_metadata)
                    metadata["applied"] = False
                    metadata["upscale"] = upscale_metadata
                artifact = await self.save_artifact(
                    card,
                    source,
                    combined,
                    ArtifactType.DESCRATCHED_UPSCALED,
                    parent_id,
                    metadata,
                    extension=settings.DEFAULT_OUTPUT_FORMAT,
                )
                card.descratched_upscaled_artifact_id = artifact.artifact_id
            elif operation == "retry":
                await self._retry_card(card)
                return
            card.progress = 100.0
            card.status = CardStatus.COMPLETED
            card.current_stage = CardStage.COMPLETED
            card.error_code = None
            card.error_message = None
        except Exception as exc:
            card.status = CardStatus.FAILED
            card.current_stage = CardStage.FAILED
            card.error_code = f"{operation.upper()}_FAILED"
            card.error_message = str(exc)
        card.attempt_count += 1
        card.updated_at = datetime.utcnow()
        await state_store.upsert_card(card)
        await state_store.update_batch_state(card.batch_id)

    async def _retry_card(self, card: CardRecord) -> None:
        if card.current_stage == CardStage.FAILED and card.error_code == "GEOMETRY_FAILED":
            source = await state_store.get_source(card.source_id)
            if source is not None:
                await self.queue.put(WorkItem("process_source", {"source_id": source.source_id}))
            return
        if card.error_code == "UPSCALE_FAILED":
            await self.queue.put(WorkItem("process_card", {"card_id": card.card_id, "operation": "upscale", "parameters": {"scale": 2}}))
        elif card.error_code in {"DESCRATCH_FAILED", "DESCRATCH_UPSCALE_FAILED"}:
            await self.queue.put(WorkItem("process_card", {"card_id": card.card_id, "operation": "descratch_upscale", "parameters": {"strength": DescratchStrength.MEDIUM.value, "scale": 2}}))

    async def process_selected_cards(self, batch_id: str, card_ids: list[str], operation: str, parameters: dict[str, Any]) -> None:
        for card_id in card_ids:
            card = await state_store.get_card(card_id)
            if card is None or card.batch_id != batch_id:
                continue
            await self.queue.put(WorkItem("process_card", {"card_id": card_id, "operation": operation, "parameters": parameters}))
        await state_store.update_batch_state(batch_id)

    async def retry_failed_batch(self, batch_id: str) -> None:
        sources = await state_store.get_sources_for_batch(batch_id)
        for source in sources:
            if source.status == SourceStatus.FAILED:
                await self.queue.put(WorkItem("process_source", {"source_id": source.source_id}))
        cards = await state_store.get_cards_for_batch(batch_id)
        for card in cards:
            if card.status == CardStatus.FAILED:
                await self.queue.put(WorkItem("process_card", {"card_id": card.card_id, "operation": "retry", "parameters": {}}))

    async def save_artifact(
        self,
        card: CardRecord,
        source: SourceRecord,
        image: np.ndarray,
        artifact_type: ArtifactType,
        parent_artifact_id: str | None,
        processing_parameters: dict[str, Any],
        extension: str,
    ) -> ArtifactRecord:
        artifact_id = str(uuid.uuid4())
        card_dir = settings.cards_root / card.card_id
        base_name = f"card_{card.source_index:03d}_{card.display_index:03d}_{artifact_type.value.lower()}"
        image_path = card_dir / f"{base_name}.{extension}"
        preview_path = card_dir / f"{base_name}_preview.webp"
        thumbnail_path = card_dir / f"{base_name}_thumb.webp"
        ImageProcessor.save_image(image, image_path, quality=settings.DEFAULT_OUTPUT_QUALITY)
        ImageProcessor.save_image(ImageProcessor.generate_preview(image), preview_path, quality=90)
        ImageProcessor.save_image(ImageProcessor.generate_thumbnail(image), thumbnail_path, quality=84)
        artifact = ArtifactRecord(
            artifact_id=artifact_id,
            card_id=card.card_id,
            source_id=source.source_id,
            artifact_type=artifact_type,
            parent_artifact_id=parent_artifact_id,
            width=int(image.shape[1]),
            height=int(image.shape[0]),
            format=extension,
            created_at=datetime.utcnow(),
            processing_version=settings.PROCESSING_VERSION,
            processing_parameters=processing_parameters,
            relative_path=str(image_path.relative_to(settings.STORAGE_DIR)),
            download_url=f"/api/artifacts/{artifact_id}/download",
            preview_path=str(preview_path.relative_to(settings.STORAGE_DIR)),
            preview_url=f"/api/artifacts/{artifact_id}/download?variant=preview",
            thumbnail_path=str(thumbnail_path.relative_to(settings.STORAGE_DIR)),
            thumbnail_url=f"/api/artifacts/{artifact_id}/download?variant=thumbnail",
        )
        card.artifact_ids = list(dict.fromkeys(card.artifact_ids + [artifact_id]))
        await state_store.upsert_artifact(artifact)
        return artifact


batch_processor = BatchProcessor()
