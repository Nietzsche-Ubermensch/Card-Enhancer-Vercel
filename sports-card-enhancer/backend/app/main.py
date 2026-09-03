"""FastAPI application for CardEnhance."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.core.config import settings
from app.models.schemas import (
    ArtifactType,
    BatchCardsResponse,
    BatchCreateResponse,
    BatchStateResponse,
    CardDetailResponse,
    DescratchRequest,
    DescratchUpscaleRequest,
    ExportRequest,
    ExportResponse,
    ExportScope,
    OperationAcceptedResponse,
    OrientationRequest,
    ProcessSelectedRequest,
    UpscaleRequest,
)
from app.services.batch_processor import batch_processor
from app.services.export_service import export_service
from app.services.state_store import state_store
from app.utils.image_utils import ImageProcessor

app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _card_has_artifact(card, artifact_type: ArtifactType) -> bool:
    mapping = {
        ArtifactType.ORIGINAL_SOURCE: card.original_source_artifact_id,
        ArtifactType.RECTIFIED: card.rectified_artifact_id,
        ArtifactType.UPSCALED: card.upscaled_artifact_id,
        ArtifactType.DESCRATCHED: card.descratched_artifact_id,
        ArtifactType.DESCRATCHED_UPSCALED: card.descratched_upscaled_artifact_id,
        ArtifactType.OPTIMIZED: None,
    }
    return bool(mapping.get(artifact_type))


@app.on_event("startup")
async def startup_event() -> None:
    await batch_processor.start()


@app.on_event("shutdown")
async def shutdown_event() -> None:
    await batch_processor.stop()


@app.get("/")
async def root() -> dict[str, object]:
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "storage": str(settings.STORAGE_DIR),
    }


@app.post("/api/batches", response_model=BatchCreateResponse)
async def create_batch() -> BatchCreateResponse:
    batch = await batch_processor.create_batch()
    return BatchCreateResponse(batch=batch)


@app.post("/api/batches/{batch_id}/sources", response_model=OperationAcceptedResponse)
async def add_sources(batch_id: str, files: list[UploadFile] = File(...)) -> OperationAcceptedResponse:
    uploads: list[tuple[str, bytes, str | None]] = []
    for upload in files:
        uploads.append((upload.filename or "upload", await upload.read(), upload.content_type))
    source_ids = await batch_processor.add_sources_to_batch(batch_id, uploads)
    return OperationAcceptedResponse(
        accepted=True,
        message=f"Added {len(source_ids)} source files to batch.",
        batch_id=batch_id,
        source_ids=source_ids,
    )


@app.get("/api/batches/{batch_id}", response_model=BatchStateResponse)
async def get_batch(batch_id: str) -> BatchStateResponse:
    batch, sources, cards = await batch_processor.get_batch_state(batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    refreshed = await state_store.update_batch_state(batch_id)
    return BatchStateResponse(batch=refreshed or batch, sources=sources, cards=cards)


@app.get("/api/batches/{batch_id}/cards", response_model=BatchCardsResponse)
async def get_batch_cards(batch_id: str) -> BatchCardsResponse:
    cards = await state_store.get_cards_for_batch(batch_id)
    return BatchCardsResponse(batch_id=batch_id, cards=cards)


@app.post("/api/sources/{source_id}/retry", response_model=OperationAcceptedResponse)
async def retry_source(source_id: str) -> OperationAcceptedResponse:
    source = await state_store.get_source(source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")
    await batch_processor.retry_source(source_id)
    return OperationAcceptedResponse(accepted=True, message="Source retry queued.", batch_id=source.batch_id, source_ids=[source_id])


@app.post("/api/sources/{source_id}/cancel", response_model=OperationAcceptedResponse)
async def cancel_source(source_id: str) -> OperationAcceptedResponse:
    source = await state_store.get_source(source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")
    await batch_processor.cancel_source(source_id)
    return OperationAcceptedResponse(accepted=True, message="Source cancelled.", batch_id=source.batch_id, source_ids=[source_id])


@app.post("/api/batches/{batch_id}/process-selected", response_model=OperationAcceptedResponse)
async def process_selected(batch_id: str, request: ProcessSelectedRequest) -> OperationAcceptedResponse:
    await batch_processor.process_selected_cards(batch_id, request.card_ids, str(request.operation), request.parameters)
    return OperationAcceptedResponse(
        accepted=True,
        message=f"Queued {request.operation} for {len(request.card_ids)} cards.",
        batch_id=batch_id,
    )


@app.post("/api/batches/{batch_id}/retry-failed", response_model=OperationAcceptedResponse)
async def retry_failed_batch(batch_id: str) -> OperationAcceptedResponse:
    await batch_processor.retry_failed_batch(batch_id)
    return OperationAcceptedResponse(accepted=True, message="Queued retries for failed sources and cards.", batch_id=batch_id)


@app.get("/api/cards/{card_id}", response_model=CardDetailResponse)
async def get_card(card_id: str) -> CardDetailResponse:
    card = await state_store.get_card(card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    source = await state_store.get_source(card.source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")
    artifacts = {artifact.artifact_type: artifact for artifact in await state_store.get_artifacts_for_card(card_id)}
    return CardDetailResponse(card=card, source=source, artifacts={
        ArtifactType.ORIGINAL_SOURCE.value: artifacts.get(ArtifactType.ORIGINAL_SOURCE.value),
        ArtifactType.RECTIFIED.value: artifacts.get(ArtifactType.RECTIFIED.value),
        ArtifactType.UPSCALED.value: artifacts.get(ArtifactType.UPSCALED.value),
        ArtifactType.DESCRATCHED.value: artifacts.get(ArtifactType.DESCRATCHED.value),
        ArtifactType.DESCRATCHED_UPSCALED.value: artifacts.get(ArtifactType.DESCRATCHED_UPSCALED.value),
    })


@app.post("/api/cards/{card_id}/orientation", response_model=OperationAcceptedResponse)
async def rotate_card(card_id: str, request: OrientationRequest) -> OperationAcceptedResponse:
    card = await state_store.get_card(card_id)
    if card is None or card.rectified_artifact_id is None:
        raise HTTPException(status_code=404, detail="Card or rectified artifact not found")
    rectified_artifact = await state_store.get_artifact(card.rectified_artifact_id)
    source = await state_store.get_source(card.source_id)
    if rectified_artifact is None or source is None:
        raise HTTPException(status_code=404, detail="Card artifacts are unavailable")
    image = ImageProcessor.load_image(settings.STORAGE_DIR / rectified_artifact.relative_path)
    from app.services.card_detection import card_detector
    rotated = card_detector.apply_manual_orientation(image, request.degrees)
    updated_artifact = await batch_processor.save_artifact(
        card=card,
        source=source,
        image=rotated,
        artifact_type=ArtifactType.RECTIFIED,
        parent_artifact_id=card.original_source_artifact_id,
        processing_parameters={
            "orientation_degrees": request.degrees,
            "orientation_confidence": 1.0,
            "orientation_method": "MANUAL",
        },
        extension=settings.DEFAULT_OUTPUT_FORMAT,
    )
    card.rectified_artifact_id = updated_artifact.artifact_id
    card.manual_orientation_override = request.degrees
    card.orientation_degrees = request.degrees
    card.orientation_confidence = 1.0
    card.orientation_method = "MANUAL"
    card.updated_at = datetime.utcnow()
    await state_store.upsert_card(card)
    return OperationAcceptedResponse(accepted=True, message="Updated card orientation.", card_id=card_id, batch_id=card.batch_id)


@app.post("/api/cards/{card_id}/upscale", response_model=OperationAcceptedResponse)
async def upscale_card(card_id: str, request: UpscaleRequest) -> OperationAcceptedResponse:
    card = await state_store.get_card(card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    await batch_processor.process_selected_cards(card.batch_id, [card_id], "upscale", {"scale": request.scale})
    return OperationAcceptedResponse(accepted=True, message="Upscale queued.", card_id=card_id, batch_id=card.batch_id)


@app.post("/api/cards/{card_id}/descratch", response_model=OperationAcceptedResponse)
async def descratch_card(card_id: str, request: DescratchRequest) -> OperationAcceptedResponse:
    card = await state_store.get_card(card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    await batch_processor.process_selected_cards(card.batch_id, [card_id], "descratch", {"strength": str(request.strength)})
    return OperationAcceptedResponse(accepted=True, message="Descratch queued.", card_id=card_id, batch_id=card.batch_id)


@app.post("/api/cards/{card_id}/descratch-upscale", response_model=OperationAcceptedResponse)
async def descratch_upscale_card(card_id: str, request: DescratchUpscaleRequest) -> OperationAcceptedResponse:
    card = await state_store.get_card(card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    await batch_processor.process_selected_cards(
        card.batch_id,
        [card_id],
        "descratch_upscale",
        {"strength": str(request.strength), "scale": request.scale},
    )
    return OperationAcceptedResponse(accepted=True, message="Descratch + upscale queued.", card_id=card_id, batch_id=card.batch_id)


@app.post("/api/cards/{card_id}/retry", response_model=OperationAcceptedResponse)
async def retry_card(card_id: str) -> OperationAcceptedResponse:
    card = await state_store.get_card(card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    await batch_processor.process_selected_cards(card.batch_id, [card_id], "retry", {})
    return OperationAcceptedResponse(accepted=True, message="Retry queued.", card_id=card_id, batch_id=card.batch_id)


@app.post("/api/exports", response_model=ExportResponse)
async def create_export(request: ExportRequest) -> ExportResponse:
    scope = ExportScope(str(request.scope))
    artifact_type = ArtifactType(str(request.artifact_type))
    if scope == ExportScope.CURRENT_CARD:
        if not request.current_card_id:
            raise HTTPException(status_code=400, detail="Current card export requires current_card_id.")
        export_record = await export_service.export_single_card(
            request.batch_id,
            request.current_card_id,
            artifact_type,
            request.format,
            request.quality,
        )
    else:
        batch_cards = await state_store.get_cards_for_batch(request.batch_id)
        if scope == ExportScope.SELECTED_CARDS:
            card_ids = request.card_ids
        else:
            card_ids = [card.card_id for card in batch_cards if _card_has_artifact(card, artifact_type)]
        export_record = await export_service.create_bulk_export(
            batch_id=request.batch_id,
            scope=scope,
            artifact_type=artifact_type,
            fmt=request.format,
            quality=request.quality,
            card_ids=card_ids,
        )
    return ExportResponse(export=export_record)


@app.get("/api/exports/{export_id}", response_model=ExportResponse)
async def get_export(export_id: str) -> ExportResponse:
    export_record = await state_store.get_export(export_id)
    if export_record is None:
        raise HTTPException(status_code=404, detail="Export not found")
    return ExportResponse(export=export_record)


@app.get("/api/exports/{export_id}/download")
async def download_export(export_id: str) -> FileResponse:
    export_record = await state_store.get_export(export_id)
    if export_record is None:
        raise HTTPException(status_code=404, detail="Export not found")
    path = settings.STORAGE_DIR / export_record.relative_path
    media_type = "application/zip" if path.suffix == ".zip" else f"image/{path.suffix.lstrip('.')}"
    return FileResponse(path, media_type=media_type, filename=path.name)


@app.get("/api/artifacts/{artifact_id}/download")
async def download_artifact(artifact_id: str, variant: Literal["full", "preview", "thumbnail"] = "full") -> FileResponse:
    artifact = await state_store.get_artifact(artifact_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail="Artifact not found")
    path_value = artifact.relative_path
    if variant == "preview" and artifact.preview_path:
        path_value = artifact.preview_path
    elif variant == "thumbnail" and artifact.thumbnail_path:
        path_value = artifact.thumbnail_path
    path = settings.STORAGE_DIR / path_value
    media_type = "image/webp" if path.suffix == ".webp" else f"image/{path.suffix.lstrip('.')}"
    return FileResponse(path, media_type=media_type, filename=path.name)


@app.get("/health")
async def health_check() -> dict[str, object]:
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": settings.APP_VERSION,
    }
