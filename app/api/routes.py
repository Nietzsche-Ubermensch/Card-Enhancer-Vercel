from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Optional

from fastapi import (
    APIRouter, File, Form, HTTPException,
    UploadFile, WebSocket, WebSocketDisconnect,
)
from fastapi.responses import FileResponse, HTMLResponse

from app.core.config import settings
from app.db.database import AsyncSessionLocal
from app.models.enums import JobStatus
from app.models.schemas import (
    ImageResult, JobStatusEnum, JobStatusResponse,
    PresetInfo, PresetsResponse, SystemStatus, UploadResponse,
)
from app.services.job_service import (
    create_job, get_job, get_stats, update_job,
)
from app.services.upscalers import get_backend_name
from app.utils.file_utils import cleanup_directory
from app.utils.logger import log
from app.workers.batch_worker import register_ws, unregister_ws

router = APIRouter()


# ------------------------------------------------------------------ #
#  UI                                                                  #
# ------------------------------------------------------------------ #

@router.get("/", response_class=HTMLResponse)
async def serve_ui():
    p = Path(__file__).parent.parent / "static" / "index.html"
    if p.exists():
        return HTMLResponse(p.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>index.html not found in app/static/</h1>", status_code=404)


# ------------------------------------------------------------------ #
#  Presets & System                                                    #
# ------------------------------------------------------------------ #

@router.get("/v1/presets", response_model=PresetsResponse)
async def list_presets():
    return PresetsResponse(presets=[
        PresetInfo(name=k, description=v.get("description", ""), settings=v)
        for k, v in settings.PRESETS.items()
    ])


@router.get("/v1/system", response_model=SystemStatus)
async def system_status():
    import shutil as _sh
    _, used, _ = _sh.disk_usage(".")
    async with AsyncSessionLocal() as session:
        stats = await get_stats(session)
    return SystemStatus(
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        active_backend=get_backend_name(),
        active_jobs=stats["active"],
        completed_jobs=stats["completed"],
        storage_used_gb=round(used / (1024 ** 3), 2),
    )


# ------------------------------------------------------------------ #
#  Batch upload                                                        #
# ------------------------------------------------------------------ #

@router.post("/v1/batch/upload", response_model=UploadResponse)
async def batch_upload(
    zip_file: UploadFile = File(...),
    settings_json: Optional[str] = Form(None),
    preset: Optional[str] = Form(None),
):
    content = await zip_file.read()
    if len(content) > settings.MAX_ZIP_SIZE:
        raise HTTPException(413, "ZIP too large")

    opts: dict = {}
    if preset and preset in settings.PRESETS:
        opts = dict(settings.PRESETS[preset])
    if settings_json:
        try:
            user_opts = json.loads(settings_json)
            if not isinstance(user_opts, dict):
                raise HTTPException(400, "settings_json must be a JSON object")
            # Strip internal keys (prefixed with _) that callers must not override
            opts.update({k: v for k, v in user_opts.items() if not k.startswith("_")})
        except json.JSONDecodeError:
            raise HTTPException(400, "Invalid settings_json")

    job_id    = uuid.uuid4().hex
    work_dir  = Path(settings.TEMP_DIR) / job_id
    work_dir.mkdir(parents=True, exist_ok=True)
    zip_path  = work_dir / f"{job_id}.zip"
    zip_path.write_bytes(content)

    async with AsyncSessionLocal() as session:
        await create_job(
            session, job_id, str(zip_path),
            settings_dict=opts, preset=preset or "custom",
        )

    return UploadResponse(
        job_id=job_id,
        status=JobStatusEnum.pending,
        message="Queued for processing",
    )


# ------------------------------------------------------------------ #
#  Job queries                                                         #
# ------------------------------------------------------------------ #

@router.get("/v1/batch/status/{job_id}", response_model=JobStatusResponse)
async def batch_status(job_id: str):
    async with AsyncSessionLocal() as session:
        job = await get_job(session, job_id)
        if not job:
            raise HTTPException(404, "Job not found")
        results = [
            ImageResult(**r)
            for r in (job.data or {}).get("results", [])
        ]
        return JobStatusResponse(
            job_id=job.id,
            status=JobStatusEnum(JobStatus(job.status).label),
            progress=job.progress,
            total_images=job.total_images,
            completed_images=job.completed_images,
            failed_images=job.failed_images,
            results=results,
            message=job.message,
            backend_used=job.backend_used,
            created_at=job.created_at.isoformat() if job.created_at else "",
            updated_at=job.updated_at.isoformat() if job.updated_at else "",
            elapsed_seconds=job.elapsed_seconds,
        )


@router.get("/v1/batch/results/{job_id}")
async def list_results(job_id: str):
    async with AsyncSessionLocal() as session:
        job = await get_job(session, job_id)
        if not job:
            raise HTTPException(404, "Job not found")
        all_results = (job.data or {}).get("results", [])
        done = [r for r in all_results if r.get("status") == "completed"]
        return {"job_id": job_id, "total": len(all_results),
                "completed": len(done), "results": done}


# ------------------------------------------------------------------ #
#  Image serving                                                       #
# ------------------------------------------------------------------ #

@router.get("/v1/image/{job_id}/{filename}")
async def serve_enhanced(job_id: str, filename: str):
    output_root = Path(settings.OUTPUT_DIR).resolve()
    p = (output_root / job_id / filename).resolve()
    if not str(p).startswith(str(output_root) + "/"):
        raise HTTPException(400, "Invalid path")
    if not p.exists():
        raise HTTPException(404, "Image not found")
    return FileResponse(str(p))


@router.get("/v1/original/{job_id}/{filename}")
async def serve_original(job_id: str, filename: str):
    temp_root = Path(settings.TEMP_DIR).resolve()
    async with AsyncSessionLocal() as session:
        job = await get_job(session, job_id)
        if not job:
            raise HTTPException(404, "Job not found")
        for r in (job.data or {}).get("results", []):
            if r.get("filename") == filename:
                orig = Path(r.get("original_path", "")).resolve()
                if not str(orig).startswith(str(temp_root) + "/"):
                    raise HTTPException(400, "Invalid path")
                if orig.exists():
                    return FileResponse(str(orig))
    raise HTTPException(404, "Original not found")


# ------------------------------------------------------------------ #
#  Cancel                                                              #
# ------------------------------------------------------------------ #

@router.delete("/v1/batch/{job_id}")
async def cancel_job(job_id: str):
    async with AsyncSessionLocal() as session:
        job = await get_job(session, job_id)
        if not job:
            raise HTTPException(404, "Job not found")
        if job.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
            raise HTTPException(400, "Job already finished")
        await update_job(session, job, status=JobStatus.CANCELLED,
                         message="Cancelled by user")
        cleanup_directory(Path(settings.TEMP_DIR) / job_id)
        return {"ok": True, "job_id": job_id}


# ------------------------------------------------------------------ #
#  WebSocket progress                                                  #
# ------------------------------------------------------------------ #

@router.websocket("/v1/ws/{job_id}")
async def ws_progress(websocket: WebSocket, job_id: str):
    await websocket.accept()

    async def push(payload: dict):
        try:
            await websocket.send_json(payload)
        except WebSocketDisconnect:
            unregister_ws(job_id)
        except Exception as exc:
            log.warning(f"WebSocket send failed for job {job_id}: {exc}")

    register_ws(job_id, push)

    try:
        # Send current state immediately on connect
        async with AsyncSessionLocal() as session:
            job = await get_job(session, job_id)
            if job:
                await websocket.send_json({
                    "status":           JobStatus(job.status).label,
                    "progress":         job.progress,
                    "message":          job.message,
                    "completed_images": job.completed_images,
                    "failed_images":    job.failed_images,
                    "total_images":     job.total_images,
                    "backend":          job.backend_used,
                })

        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid JSON"})
                continue
            if not isinstance(data, dict):
                await websocket.send_json({"error": "Expected JSON object"})
                continue
            if data.get("action") == "cancel":
                async with AsyncSessionLocal() as session:
                    job = await get_job(session, job_id)
                    if job and job.status not in (
                        JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED
                    ):
                        await update_job(session, job, status=JobStatus.CANCELLED,
                                         message="Cancelled via WebSocket")
                        await websocket.send_json({"action": "cancel", "success": True})

    except WebSocketDisconnect:
        pass
    finally:
        unregister_ws(job_id)
