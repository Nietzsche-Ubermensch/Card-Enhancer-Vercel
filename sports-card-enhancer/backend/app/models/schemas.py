"""Typed API and persistence schemas for CardEnhance."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class BatchStatus(str, Enum):
    QUEUED = "QUEUED"
    UPLOADING = "UPLOADING"
    PROCESSING = "PROCESSING"
    PARTIAL_SUCCESS = "PARTIAL_SUCCESS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class SourceStatus(str, Enum):
    UPLOADING = "UPLOADING"
    VALIDATING = "VALIDATING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class CardStatus(str, Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    READY = "READY"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class CardStage(str, Enum):
    VALIDATING = "VALIDATING"
    DETECTING = "DETECTING"
    GEOMETRY = "GEOMETRY"
    RECTIFYING = "RECTIFYING"
    ORIENTING = "ORIENTING"
    READY = "READY"
    UPSCALING = "UPSCALING"
    DESCRATCHING = "DESCRATCHING"
    DESCRATCHING_UPSCALING = "DESCRATCHING_UPSCALING"
    EXPORTING = "EXPORTING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    RETRYING = "RETRYING"


class ArtifactType(str, Enum):
    ORIGINAL_SOURCE = "ORIGINAL_SOURCE"
    RECTIFIED = "RECTIFIED"
    UPSCALED = "UPSCALED"
    DESCRATCHED = "DESCRATCHED"
    DESCRATCHED_UPSCALED = "DESCRATCHED_UPSCALED"
    OPTIMIZED = "OPTIMIZED"


class GeometryMethod(str, Enum):
    POLYGON_QUAD = "POLYGON_QUAD"
    MIN_AREA_RECT_FALLBACK = "MIN_AREA_RECT_FALLBACK"
    IMAGE_BOUNDS_FALLBACK = "IMAGE_BOUNDS_FALLBACK"


class OrientationMethod(str, Enum):
    EXIF = "EXIF"
    OCR = "OCR"
    LAYOUT = "LAYOUT"
    GEOMETRY = "GEOMETRY"
    MANUAL = "MANUAL"


class DescratchStrength(str, Enum):
    OFF = "off"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class BulkOperation(str, Enum):
    UPSCALE = "upscale"
    DESCRATCH = "descratch"
    DESCRATCH_UPSCALE = "descratch_upscale"
    RETRY = "retry"


class ExportScope(str, Enum):
    CURRENT_CARD = "current_card"
    SELECTED_CARDS = "selected_cards"
    ALL_COMPLETED = "all_completed"


class ApiModel(BaseModel):
    model_config = ConfigDict(use_enum_values=True)


class Point(ApiModel):
    x: float
    y: float


class ArtifactRecord(ApiModel):
    artifact_id: str
    card_id: str
    source_id: str
    artifact_type: ArtifactType
    parent_artifact_id: str | None = None
    width: int
    height: int
    format: str
    created_at: datetime
    processing_version: str
    processing_parameters: dict[str, Any] = Field(default_factory=dict)
    relative_path: str
    download_url: str
    preview_path: str | None = None
    preview_url: str | None = None
    thumbnail_path: str | None = None
    thumbnail_url: str | None = None
    warnings: list[str] = Field(default_factory=list)


class SourceRecord(ApiModel):
    source_id: str
    batch_id: str
    original_filename: str
    safe_filename: str
    content_hash: str
    mime_type: str
    width: int
    height: int
    byte_size: int
    status: SourceStatus
    detected_card_count: int = 0
    created_at: datetime
    error_code: str | None = None
    error_message: str | None = None
    original_relative_path: str
    exif_orientation: int | None = None
    warnings: list[str] = Field(default_factory=list)


class CardRecord(ApiModel):
    card_id: str
    batch_id: str
    source_id: str
    source_index: int
    display_index: int
    detector_method: str
    detection_confidence: float
    polygon: list[Point]
    corners: list[Point]
    centroid: Point
    geometry_method: str
    geometry_confidence: float
    orientation_degrees: int = 0
    orientation_confidence: float = 0.0
    orientation_method: str = OrientationMethod.GEOMETRY.value
    manual_orientation_override: int | None = None
    status: CardStatus
    current_stage: CardStage
    progress: float = 0.0
    rectified_artifact_id: str | None = None
    upscaled_artifact_id: str | None = None
    descratched_artifact_id: str | None = None
    descratched_upscaled_artifact_id: str | None = None
    original_source_artifact_id: str | None = None
    warnings: list[str] = Field(default_factory=list)
    error_code: str | None = None
    error_message: str | None = None
    retryable: bool = True
    attempt_count: int = 0
    created_at: datetime
    updated_at: datetime
    quality: dict[str, float] = Field(default_factory=dict)
    artifact_ids: list[str] = Field(default_factory=list)


class BatchRecord(ApiModel):
    batch_id: str
    status: BatchStatus
    source_count: int = 0
    detected_card_count: int = 0
    queued_count: int = 0
    processing_count: int = 0
    completed_count: int = 0
    failed_count: int = 0
    cancelled_count: int = 0
    progress: float = 0.0
    created_at: datetime
    updated_at: datetime
    source_ids: list[str] = Field(default_factory=list)
    card_ids: list[str] = Field(default_factory=list)


class ExportCardEntry(ApiModel):
    card_id: str
    source_id: str
    source_filename: str
    source_index: int
    output_filename: str
    artifact_type: str
    width: int
    height: int
    orientation: int
    detection_confidence: float
    geometry_confidence: float
    upscale: dict[str, Any] | None = None
    descratch: dict[str, Any] | None = None
    warnings: list[str] = Field(default_factory=list)


class ExportManifest(ApiModel):
    export_id: str
    created_at: datetime
    artifact_selection: str
    format: str
    card_count: int
    cards: list[ExportCardEntry]


class ExportRecord(ApiModel):
    export_id: str
    batch_id: str
    status: str
    created_at: datetime
    updated_at: datetime
    scope: ExportScope
    artifact_type: ArtifactType
    format: str
    quality: int | None = None
    card_ids: list[str] = Field(default_factory=list)
    manifest: ExportManifest
    relative_path: str
    download_url: str
    error_message: str | None = None


class BatchCreateResponse(ApiModel):
    batch: BatchRecord


class BatchStateResponse(ApiModel):
    batch: BatchRecord
    sources: list[SourceRecord]
    cards: list[CardRecord]


class BatchCardsResponse(ApiModel):
    batch_id: str
    cards: list[CardRecord]


class CardDetailResponse(ApiModel):
    card: CardRecord
    source: SourceRecord
    artifacts: dict[str, ArtifactRecord | None]


class OrientationRequest(ApiModel):
    degrees: Literal[0, 90, 180, 270]


class UpscaleRequest(ApiModel):
    scale: int = Field(..., ge=2, le=4)


class DescratchRequest(ApiModel):
    strength: DescratchStrength


class DescratchUpscaleRequest(ApiModel):
    strength: DescratchStrength
    scale: int = Field(..., ge=2, le=4)


class ProcessSelectedRequest(ApiModel):
    card_ids: list[str]
    operation: BulkOperation
    parameters: dict[str, Any] = Field(default_factory=dict)


class ExportRequest(ApiModel):
    batch_id: str
    scope: ExportScope
    artifact_type: ArtifactType
    format: str = Field(..., pattern="^(png|jpg|webp)$")
    quality: int | None = Field(default=None, ge=50, le=100)
    card_ids: list[str] = Field(default_factory=list)
    current_card_id: str | None = None


class OperationAcceptedResponse(ApiModel):
    accepted: bool
    message: str
    batch_id: str | None = None
    card_id: str | None = None
    source_ids: list[str] = Field(default_factory=list)


class ExportResponse(ApiModel):
    export: ExportRecord
