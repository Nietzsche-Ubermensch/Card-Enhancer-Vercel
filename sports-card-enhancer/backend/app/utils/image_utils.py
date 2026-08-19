"""Image ingestion, validation, and utility helpers."""
from __future__ import annotations

import hashlib
import mimetypes
import os
import re
from io import BytesIO
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageOps

from app.core.config import settings

PILLOW_FORMAT_TO_MIME = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
    "BMP": "image/bmp",
    "TIFF": "image/tiff",
}

SAFE_FILENAME_PATTERN = re.compile(r"[^A-Za-z0-9._-]+")


class ValidationError(ValueError):
    """Raised when an uploaded image fails validation."""


class ImageProcessor:
    """Utility class for image processing operations."""

    @staticmethod
    def load_image(path: str | Path) -> np.ndarray:
        with Image.open(path) as image:
            normalized = normalize_exif_orientation(image)
            return np.array(normalized.convert("RGB"))

    @staticmethod
    def save_image(
        image: np.ndarray,
        path: str | Path,
        quality: int = 95,
        dpi: int = 300,
    ) -> None:
        output_path = Path(path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        pil_image = Image.fromarray(np.clip(image, 0, 255).astype(np.uint8))
        ext = output_path.suffix.lower()
        save_kwargs: dict[str, Any] = {}
        if ext in {".jpg", ".jpeg"}:
            save_kwargs = {"format": "JPEG", "quality": quality, "subsampling": 0, "dpi": (dpi, dpi)}
        elif ext == ".png":
            save_kwargs = {"format": "PNG", "compress_level": 4, "dpi": (dpi, dpi)}
        elif ext == ".webp":
            save_kwargs = {"format": "WEBP", "quality": quality, "method": 6}
        else:
            save_kwargs = {"format": "TIFF", "compression": "tiff_lzw", "dpi": (dpi, dpi)}
        pil_image.save(output_path, **save_kwargs)

    @staticmethod
    def resize_image(image: np.ndarray, max_dimension: int) -> np.ndarray:
        height, width = image.shape[:2]
        if max(height, width) <= max_dimension:
            return image
        scale = max_dimension / max(height, width)
        return cv2.resize(
            image,
            (max(1, int(width * scale)), max(1, int(height * scale))),
            interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LANCZOS4,
        )

    @staticmethod
    def generate_thumbnail(image: np.ndarray, max_dimension: int | None = None) -> np.ndarray:
        return ImageProcessor.resize_image(image, max_dimension or settings.THUMBNAIL_MAX_DIMENSION)

    @staticmethod
    def generate_preview(image: np.ndarray, max_dimension: int | None = None) -> np.ndarray:
        return ImageProcessor.resize_image(image, max_dimension or settings.PREVIEW_MAX_DIMENSION)


class ImageEnhancer:
    """Image enhancement operations."""

    @staticmethod
    def sharpen(image: np.ndarray, amount: float = 0.35) -> np.ndarray:
        blurred = cv2.GaussianBlur(image, (0, 0), sigmaX=1.2)
        return cv2.addWeighted(image, 1.0 + amount, blurred, -amount, 0)

    @staticmethod
    def adjust_contrast(image: np.ndarray, amount: float = 0.2) -> np.ndarray:
        alpha = 1.0 + amount
        beta = 8.0 * amount
        return cv2.convertScaleAbs(image, alpha=alpha, beta=beta)

    @staticmethod
    def adjust_saturation(image: np.ndarray, factor: float = 1.0) -> np.ndarray:
        hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV).astype(np.float32)
        hsv[:, :, 1] = np.clip(hsv[:, :, 1] * factor, 0, 255)
        return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)

    @staticmethod
    def adjust_color_temperature(image: np.ndarray, temperature: float = 0.0) -> np.ndarray:
        if temperature == 0:
            return image
        result = image.astype(np.float32)
        result[:, :, 0] *= 1.0 + (temperature * 0.08)
        result[:, :, 2] *= 1.0 - (temperature * 0.08)
        return np.clip(result, 0, 255).astype(np.uint8)

    @staticmethod
    def reduce_noise(image: np.ndarray, strength: float = 0.35) -> np.ndarray:
        h_value = max(2, int(3 + (strength * 10)))
        return cv2.fastNlMeansDenoisingColored(image, None, h_value, h_value, 7, 21)

    @staticmethod
    def enhance_details(image: np.ndarray, amount: float = 0.2) -> np.ndarray:
        detail = cv2.detailEnhance(image, sigma_s=10, sigma_r=min(0.8, 0.15 + amount * 0.35))
        return cv2.addWeighted(image, 1.0 - amount * 0.25, detail, amount * 0.25, 0)


def calculate_source_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def sanitize_filename(filename: str) -> str:
    name = os.path.basename(filename or "upload")
    stem, ext = os.path.splitext(name)
    clean_stem = SAFE_FILENAME_PATTERN.sub("_", stem).strip("._") or "source"
    clean_ext = SAFE_FILENAME_PATTERN.sub("", ext.lower())
    if clean_ext not in settings.ALLOWED_EXTENSIONS:
        guessed = mimetypes.guess_extension(mimetypes.guess_type(name)[0] or "") or ".png"
        clean_ext = guessed if guessed in settings.ALLOWED_EXTENSIONS else ".png"
    return f"{clean_stem}{clean_ext}"


def normalize_exif_orientation(image: Image.Image) -> Image.Image:
    return ImageOps.exif_transpose(image)


def decode_image(content: bytes) -> tuple[np.ndarray, dict[str, Any]]:
    with Image.open(BytesIO(content)) as image:
        verified_format = (image.format or "").upper()
        exif = image.getexif()
        exif_orientation = int(exif.get(274)) if exif.get(274) else None
        normalized = normalize_exif_orientation(image)
        rgb_image = normalized.convert("RGB")
        width, height = rgb_image.size
        if width <= 0 or height <= 0:
            raise ValidationError("Could not decode this image.")
        if width > settings.MAX_IMAGE_DIMENSION or height > settings.MAX_IMAGE_DIMENSION:
            raise ValidationError("Image dimensions exceed the supported maximum.")
        if width * height > settings.MAX_IMAGE_PIXELS:
            raise ValidationError("Image pixel count exceeds the supported maximum.")
        metadata = {
            "width": width,
            "height": height,
            "format": verified_format.lower(),
            "mime_type": PILLOW_FORMAT_TO_MIME.get(verified_format, "application/octet-stream"),
            "exif_orientation": exif_orientation,
        }
        return np.array(rgb_image), metadata


def validate_upload(
    content: bytes,
    filename: str,
    declared_content_type: str | None,
) -> dict[str, Any]:
    if not content:
        raise ValidationError("The uploaded file is empty.")
    if len(content) > settings.MAX_FILE_SIZE:
        raise ValidationError("The uploaded file exceeds the maximum file size.")

    safe_filename = sanitize_filename(filename)
    ext = Path(safe_filename).suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise ValidationError("Unsupported image format.")

    try:
        with Image.open(BytesIO(content)) as image:
            image.verify()
    except Exception as exc:  # pragma: no cover - Pillow error variants depend on decoder
        raise ValidationError("Could not decode this image.") from exc

    image_array, decoded = decode_image(content)
    actual_mime = decoded["mime_type"]
    if actual_mime not in settings.ALLOWED_MIME_TYPES:
        raise ValidationError("Unsupported image format.")

    return {
        "safe_filename": safe_filename,
        "content_hash": calculate_source_hash(content),
        "byte_size": len(content),
        "mime_type": actual_mime,
        "declared_content_type": declared_content_type,
        "width": decoded["width"],
        "height": decoded["height"],
        "format": decoded["format"],
        "image": image_array,
        "exif_orientation": decoded["exif_orientation"],
    }


def store_original(directory: Path, filename: str, content: bytes) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    original_path = directory / filename
    original_path.write_bytes(content)
    return original_path


class QualityAnalyzer:
    """Deterministic image-quality metrics."""

    @staticmethod
    def measure_sharpness(image: np.ndarray) -> float:
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        return float(cv2.Laplacian(gray, cv2.CV_64F).var())

    @staticmethod
    def measure_exposure(image: np.ndarray) -> float:
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        return float(np.mean(gray) / 255.0)

    @staticmethod
    def measure_contrast(image: np.ndarray) -> float:
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        return float(np.std(gray) / 128.0)

    @staticmethod
    def measure_white_balance(image: np.ndarray) -> float:
        channel_means = np.mean(image, axis=(0, 1))
        return float(np.std(channel_means) / max(np.mean(channel_means), 1.0))

    @staticmethod
    def measure_highlight_clipping(image: np.ndarray) -> float:
        return float(np.mean(np.all(image >= 250, axis=2)) * 100.0)

    @staticmethod
    def measure_shadow_clipping(image: np.ndarray) -> float:
        return float(np.mean(np.all(image <= 5, axis=2)) * 100.0)

    @staticmethod
    def estimate_noise(image: np.ndarray) -> float:
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        blurred = cv2.GaussianBlur(gray, (3, 3), 0)
        return float(np.std(gray.astype(np.float32) - blurred.astype(np.float32)))

    @classmethod
    def summarize(cls, image: np.ndarray) -> dict[str, float]:
        return {
            "sharpness": cls.measure_sharpness(image),
            "exposure": cls.measure_exposure(image),
            "contrast": cls.measure_contrast(image),
            "white_balance": cls.measure_white_balance(image),
            "highlight_clipping": cls.measure_highlight_clipping(image),
            "shadow_clipping": cls.measure_shadow_clipping(image),
            "noise": cls.estimate_noise(image),
        }
