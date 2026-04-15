from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class JobStatusEnum(str, Enum):
    pending = "pending"
    analyzing = "analyzing"
    processing = "processing"
    quality_check = "quality_check"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"
    partially_completed = "partially_completed"


class UploadResponse(BaseModel):
    job_id: str
    status: JobStatusEnum = JobStatusEnum.pending
    message: str
    total_files: int = 0
    accepted_files: int = 0
    rejected_files: int = 0


class ImageResult(BaseModel):
    filename: str
    original_path: str = ""
    enhanced_path: str = ""
    original_size: str = ""
    enhanced_size: str = ""
    status: str = "pending"
    error: Optional[str] = None
    processing_time_ms: int = 0


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatusEnum
    progress: int = 0
    total_images: int = 0
    completed_images: int = 0
    failed_images: int = 0
    results: List[ImageResult] = []
    message: str = ""
    current_file: str = ""
    backend_used: str = ""
    created_at: str = ""
    updated_at: str = ""
    elapsed_seconds: float = 0


class PresetInfo(BaseModel):
    name: str
    description: str
    settings: Dict[str, Any]


class PresetsResponse(BaseModel):
    presets: List[PresetInfo]


class SystemStatus(BaseModel):
    app_name: str
    version: str
    active_backend: str
    active_jobs: int
    completed_jobs: int
    storage_used_gb: float
