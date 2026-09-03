"""Application configuration settings for the CardEnhance backend."""
from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration with environment variable support."""

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    APP_NAME: str = "CardEnhance API"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False

    HOST: str = "0.0.0.0"
    PORT: int = 8000

    MAX_FILE_SIZE: int = 50 * 1024 * 1024
    MAX_BATCH_SIZE: int = 100
    MAX_IMAGE_PIXELS: int = 80_000_000
    MAX_IMAGE_DIMENSION: int = 10_000
    ALLOWED_EXTENSIONS: set[str] = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
    ALLOWED_MIME_TYPES: set[str] = {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/bmp",
        "image/tiff",
    }

    STORAGE_DIR: Path = Field(default_factory=lambda: Path("./storage"))
    SOURCE_DIR_NAME: str = "sources"
    CARD_DIR_NAME: str = "cards"
    EXPORT_DIR_NAME: str = "exports"
    STATE_FILENAME: str = "state.json"

    BATCH_CONCURRENCY: int = 3
    YOLO_CONCURRENCY: int = 2
    REAL_ESRGAN_CONCURRENCY: int = 1

    CARD_SEG_MODEL_PATH: str = ""
    CARD_SEG_DEVICE: str = "cpu"
    CARD_SEG_CONF: float = 0.35
    CARD_SEG_IOU: float = 0.45
    CARD_SEG_IMGSZ: int = 1024

    RECTIFY_MODE: Literal["PRESERVE_GEOMETRY", "STANDARD_5_7"] = "PRESERVE_GEOMETRY"
    CARD_BORDER_MARGIN_RATIO: float = 0.018
    DEFAULT_OUTPUT_FORMAT: str = "png"
    DEFAULT_OUTPUT_QUALITY: int = 95
    THUMBNAIL_MAX_DIMENSION: int = 360
    PREVIEW_MAX_DIMENSION: int = 1600

    DESCRATCH_MAX_MASK_PERCENT: float = 6.0
    PROCESSING_VERSION: str = "cardenhance-2.0"

    @property
    def sources_root(self) -> Path:
        return self.STORAGE_DIR / self.SOURCE_DIR_NAME

    @property
    def cards_root(self) -> Path:
        return self.STORAGE_DIR / self.CARD_DIR_NAME

    @property
    def exports_root(self) -> Path:
        return self.STORAGE_DIR / self.EXPORT_DIR_NAME

    @property
    def state_path(self) -> Path:
        return self.STORAGE_DIR / self.STATE_FILENAME

    def ensure_directories(self) -> None:
        for directory in (
            self.STORAGE_DIR,
            self.sources_root,
            self.cards_root,
            self.exports_root,
        ):
            directory.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_directories()
