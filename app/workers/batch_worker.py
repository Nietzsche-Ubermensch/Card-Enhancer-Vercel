from __future__ import annotations

import asyncio
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from app.core.config import settings
from app.db.database import AsyncSessionLocal
from app.models.enums import JobStatus
from app.services.enhancement_service import EnhancementService
from app.services.job_service import (
    add_result, get_job, get_pending_jobs, update_job,
)
from app.services.upscalers import get_backend_name
from app.utils.file_utils import cleanup_directory, format_bytes, safe_zip_extract
from app.utils.logger import log

enhancer      = EnhancementService()
_executor:    Optional[ThreadPoolExecutor] = None
_poll_thread: Optional[threading.Thread]  = None
_stop_event   = threading.Event()
_ws_registry: Dict[str, Callable]        = {}
_ws_lock      = threading.Lock()


# ------------------------------------------------------------------ #
#  WebSocket registry                                                  #
# ------------------------------------------------------------------ #

def register_ws(job_id: str, cb: Callable) -> None:
    with _ws_lock:
        _ws_registry[job_id] = cb


def unregister_ws(job_id: str) -> None:
    with _ws_lock:
        _ws_registry.pop(job_id, None)


def _notify(job_id: str, payload: Dict[str, Any]) -> None:
    with _ws_lock:
        cb = _ws_registry.get(job_id)
    if not cb:
        return
    try:
        loop = asyncio.get_running_loop()
        asyncio.run_coroutine_threadsafe(cb(payload), loop)
    except RuntimeError:
        log.warning(f"No running event loop for WebSocket notification on job {job_id}")


# ------------------------------------------------------------------ #
#  Job processing                                                      #
# ------------------------------------------------------------------ #

def _process_job(job_id: str) -> None:
    work_dir = Path(settings.TEMP_DIR) / job_id

    async def _run() -> None:
        async with AsyncSessionLocal() as session:
            job = await get_job(session, job_id)
            if not job:
                return

            zip_path = Path(job.zip_path)
            if not zip_path.exists():
                await update_job(session, job, status=JobStatus.FAILED,
                                 message="ZIP file not found")
                return

            opts    = dict(job.settings or {})
            t_start = time.time()
            backend  = get_backend_name()

            await update_job(session, job, status=JobStatus.ANALYZING,
                             message="Extracting archive...", backend_used=backend)
            _notify(job_id, {"status": "analyzing", "progress": 0,
                              "message": "Extracting archive..."})

            try:
                zip_bytes = zip_path.read_bytes()
            except OSError as exc:
                await update_job(session, job, status=JobStatus.FAILED,
                                 message=str(exc))
                return

            extracted = safe_zip_extract(
                zip_bytes, work_dir, max_files=settings.MAX_BATCH_SIZE
            )
            if not extracted:
                await update_job(session, job, status=JobStatus.FAILED,
                                 message="No supported images found in ZIP")
                return

            total = len(extracted)
            await update_job(session, job, status=JobStatus.PROCESSING,
                             message=f"Processing {total} images...",
                             total_images=total, progress=0)

            completed = 0
            failed    = 0

            for idx, img_path in enumerate(extracted, 1):
                if _stop_event.is_set():
                    await update_job(session, job, status=JobStatus.CANCELLED,
                                     message="Cancelled by shutdown")
                    return

                output_dir = Path(settings.OUTPUT_DIR) / job_id
                output_dir.mkdir(parents=True, exist_ok=True)
                out_name = f"{img_path.stem}_enhanced.{opts.get('format', 'png')}"
                out_path = output_dir / out_name

                img_start = time.time()
                try:
                    result_path = enhancer.enhance_image(
                        str(img_path), opts,
                        quality=int(opts.get("quality", settings.DEFAULT_OUTPUT_QUALITY)),
                    )
                    if result_path != str(out_path):
                        shutil.move(result_path, str(out_path))

                    elapsed_ms = int((time.time() - img_start) * 1000)
                    orig_size  = format_bytes(img_path.stat().st_size)
                    enh_size   = format_bytes(out_path.stat().st_size) if out_path.exists() else "?"

                    await add_result(session, job, {
                        "filename":           out_name,
                        "original_path":      str(img_path),
                        "enhanced_path":      str(out_path),
                        "original_size":      orig_size,
                        "enhanced_size":      enh_size,
                        "status":             "completed",
                        "processing_time_ms": elapsed_ms,
                    })
                    completed += 1

                except Exception as exc:
                    log.error(f"Failed {img_path.name}: {exc}")
                    await add_result(session, job, {
                        "filename": img_path.name,
                        "status":   "failed",
                        "error":    str(exc),
                    })
                    failed += 1

                pct = int((idx / total) * 100)
                msg = f"{idx}/{total} — {img_path.name}"
                await update_job(session, job, status=JobStatus.PROCESSING,
                                 message=msg, progress=pct,
                                 completed_images=completed, failed_images=failed)
                _notify(job_id, {
                    "status":           "processing",
                    "progress":         pct,
                    "completed_images": completed,
                    "failed_images":    failed,
                    "total_images":     total,
                    "current_file":     img_path.name,
                    "message":          msg,
                    "backend":          backend,
                })

            # Final status
            if failed == 0:
                final = JobStatus.COMPLETED
            elif completed > 0:
                final = JobStatus.PARTIALLY_COMPLETED
            else:
                final = JobStatus.FAILED

            elapsed = round(time.time() - t_start, 1)
            done_msg = f"Done in {elapsed}s — {completed} ok, {failed} failed"
            await update_job(session, job, status=final, message=done_msg,
                             progress=100, completed_images=completed,
                             failed_images=failed)
            _notify(job_id, {
                "status":           final.label,
                "progress":         100,
                "completed_images": completed,
                "failed_images":    failed,
                "total_images":     total,
                "message":          done_msg,
                "backend":          backend,
            })
            log.info(f"Job {job_id}: {done_msg}")

    try:
        asyncio.run(_run())
    except Exception as exc:
        log.error(f"Job {job_id} crashed: {exc}")
    finally:
        cleanup_directory(work_dir)


# ------------------------------------------------------------------ #
#  Poller                                                              #
# ------------------------------------------------------------------ #

def _poll_loop() -> None:
    log.info(f"Worker started — {settings.MAX_CONCURRENT_WORKERS} threads")
    while not _stop_event.is_set():
        try:
            async def _fetch():
                async with AsyncSessionLocal() as session:
                    jobs = await get_pending_jobs(
                        session, limit=settings.MAX_CONCURRENT_WORKERS
                    )
                    for j in jobs:
                        if not _stop_event.is_set():
                            log.info(f"Dequeued job {j.id}")
                            _executor.submit(_process_job, j.id)
            asyncio.run(_fetch())
        except Exception as exc:
            log.error(f"Poller error: {exc}")

        for _ in range(int(settings.WORKER_POLL_INTERVAL * 10)):
            if _stop_event.is_set():
                break
            time.sleep(0.1)


# ------------------------------------------------------------------ #
#  Lifecycle                                                           #
# ------------------------------------------------------------------ #

def start_worker() -> None:
    global _executor, _poll_thread
    _stop_event.clear()
    _executor = ThreadPoolExecutor(
        max_workers=settings.MAX_CONCURRENT_WORKERS,
        thread_name_prefix="enhancer",
    )
    _poll_thread = threading.Thread(
        target=_poll_loop, daemon=True, name="job-poller"
    )
    _poll_thread.start()
    log.info("Worker started")


def stop_worker() -> None:
    global _executor, _poll_thread
    _stop_event.set()
    if _executor:
        _executor.shutdown(wait=True)
        _executor = None
    if _poll_thread:
        _poll_thread.join(timeout=10)
        _poll_thread = None
    log.info("Worker stopped")
