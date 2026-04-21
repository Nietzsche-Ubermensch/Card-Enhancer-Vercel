from __future__ import annotations

from pathlib import Path
from typing import Dict, List
from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    APP_NAME: str = "Card Enhancer AI"
    APP_VERSION: str = "5.0.0"
    DEBUG: bool = False
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    UPLOAD_DIR: str = "./uploads"
    TEMP_DIR: str = "./temp"
    OUTPUT_DIR: str = "./outputs"

    MAX_FILE_SIZE: int = 100 * 1024 * 1024
    MAX_ZIP_SIZE: int = 2 * 1024 * 1024 * 1024
    MAX_BATCH_SIZE: int = 3000

    DEFAULT_OUTPUT_QUALITY: int = 95
    MAX_CONCURRENT_WORKERS: int = 2
    WORKER_POLL_INTERVAL: float = 1.0
    CLEANUP_AFTER_HOURS: int = 48
    DATABASE_URL: str = "sqlite+aiosqlite:///./jobs.db"

    # --- API tokens ---
    HF_API_TOKEN: str = ""
    REPLICATE_API_TOKEN: str = ""
    UPSCALE_BACKEND: str = "realesrgan"

    # --- CORS ---
    CORS_ORIGINS: List[str] = Field(default_factory=lambda: ["*"])

    PRESETS: Dict[str, Dict] = Field(default_factory=lambda: {
        "mint_card": {
            "upscale_factor": 2, "denoise": False,
            "sharpen": True, "sharpen_strength": 0.3,
            "color_correct": False, "auto_contrast": True,
            "format": "png", "quality": 100,
            "description": "Near-mint cards — minimal processing",
        },
        "worn_card": {
            "upscale_factor": 4, "denoise": True, "denoise_strength": "medium",
            "sharpen": True, "sharpen_strength": 0.6,
            "color_correct": True, "auto_contrast": True,
            "format": "png", "quality": 95,
            "description": "Moderately worn — restore colors and edges",
        },
        "damaged_card": {
            "upscale_factor": 4, "denoise": True, "denoise_strength": "high",
            "sharpen": True, "sharpen_strength": 0.8,
            "color_correct": True, "auto_contrast": True,
            "format": "png", "quality": 95,
            "description": "Heavily damaged — aggressive restoration",
        },
        "web_ready": {
            "upscale_factor": 2, "denoise": True, "denoise_strength": "low",
            "sharpen": True, "sharpen_strength": 0.4,
            "color_correct": True, "auto_contrast": True,
            "format": "webp", "quality": 85,
            "description": "Optimised for web — smaller file size",
        },
        "print_ready": {
            "upscale_factor": 4, "denoise": True, "denoise_strength": "medium",
            "sharpen": True, "sharpen_strength": 0.5,
            "color_correct": True, "auto_contrast": False,
            "format": "tiff", "quality": 100,
            "description": "High-res for print or archival",
        },
    })

    @computed_field
    @property
    def root_dir(self) -> Path:
        return Path(__file__).resolve().parents[2]


settings = Settings()

for _d in (settings.UPLOAD_DIR, settings.TEMP_DIR, settings.OUTPUT_DIR):
    Path(_d).mkdir(parents=True, exist_ok=True)
