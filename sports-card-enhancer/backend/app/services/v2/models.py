"""V2 data model: batches, sources, cards, and typed artifacts with lineage."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

PROCESSING_VERSION = "2.0.0"


class ArtifactType(str, Enum):
    """Distinct image artifacts the system maintains per card."""
    ORIGINAL = "original"
    RECTIFIED = "rectified"
    UPSCALED = "upscaled"
    DESCRATCHED = "descratched"
    UPSCALED_DESCRATCHED = "upscaled_descratched"
    OPTIMIZED = "optimized"
    THUMBNAIL = "thumbnail"


class CardStage(str, Enum):
    """Per-card pipeline stages; progress is derived from these."""
    QUEUED = "queued"
    UPLOADING = "uploading"
    VALIDATING = "validating"
    DETECTING = "detecting"
    CROPPING = "cropping"
    ORIENTING = "orienting"
    UPSCALING = "upscaling"
    DESCRATCHING = "descratching"
    GENERATING_PREVIEWS = "generating_previews"
    COMPLETED = "completed"
    PARTIAL_SUCCESS = "partial_success"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETRYING = "retrying"


# Stage order used to derive real progress (0..1) for the base pipeline.
BASE_STAGE_ORDER = [
    CardStage.VALIDATING,
    CardStage.DETECTING,
    CardStage.CROPPING,
    CardStage.ORIENTING,
    CardStage.GENERATING_PREVIEWS,
    CardStage.COMPLETED,
]


class BatchStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    PARTIAL_SUCCESS = "partial_success"
    FAILED = "failed"
    CANCELLED = "cancelled"


class DescratchLevel(str, Enum):
    OFF = "off"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ArtifactRecord(BaseModel):
    """One stored derivative with full lineage."""
    artifact_type: ArtifactType
    path: str
    width: int
    height: int
    parent_artifact: Optional[ArtifactType] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    processing_version: str = PROCESSING_VERSION
    meta: Dict[str, Any] = Field(default_factory=dict)


class CardRecord(BaseModel):
    """One physical card extracted from one source image."""
    card_id: str
    batch_id: str
    source_id: str
    source_filename: str
    source_index: int
    card_index: int
    stage: CardStage = CardStage.QUEUED
    progress: float = 0.0
    detector_confidence: float = 0.0
    geometry_confidence: float = 0.0
    detector_method: str = ""
    polygon: Optional[List[List[float]]] = None
    centroid: Optional[List[float]] = None
    orientation_degrees: int = 0
    orientation_confidence: float = 0.0
    orientation_method: str = ""
    upscale_meta: Dict[str, Any] = Field(default_factory=dict)
    descratch_meta: Dict[str, Any] = Field(default_factory=dict)
    quality_metrics: Dict[str, Any] = Field(default_factory=dict)
    artifacts: Dict[str, ArtifactRecord] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)
    error: Optional[str] = None
    retry_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SourceRecord(BaseModel):
    """One uploaded file (may contain many physical cards)."""
    source_id: str
    batch_id: str
    filename: str
    sha256: str
    path: str
    width: int
    height: int
    format: str
    size_bytes: int
    detected_card_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)


class BatchRecord(BaseModel):
    """A batch: source files plus every card detected from them."""
    batch_id: str
    status: BatchStatus = BatchStatus.QUEUED
    source_count: int = 0
    detected_card_count: int = 0
    queued_count: int = 0
    processing_count: int = 0
    completed_count: int = 0
    failed_count: int = 0
    overall_progress: float = 0.0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ---- API request/response schemas ----

class CardActionRequest(BaseModel):
    action: str = Field(..., description=(
        "rotate_left | rotate_right | set_orientation | reprocess | retry | "
        "upscale | descratch | upscale_descratch"))
    degrees: Optional[int] = None
    scale: int = Field(2, description="Upscale factor: 2 or 4")
    descratch_level: DescratchLevel = DescratchLevel.MEDIUM


class BatchActionRequest(BaseModel):
    action: str = Field(..., description=(
        "upscale_selected | descratch_selected | upscale_descratch_selected | retry_failed"))
    card_ids: Optional[List[str]] = None
    scale: int = 2
    descratch_level: DescratchLevel = DescratchLevel.MEDIUM


class ExportRequestV2(BaseModel):
    card_ids: Optional[List[str]] = Field(
        None, description="Cards to export; omit to export all completed cards")
    artifact_type: ArtifactType = ArtifactType.UPSCALED_DESCRATCHED
    format: str = Field("png", pattern="^(png|jpg|jpeg|webp)$")
    quality: int = Field(95, ge=50, le=100)


class ExportResponseV2(BaseModel):
    export_id: str
    file_count: int
    artifact_type: str
    download_url: str
    manifest: Dict[str, Any]
