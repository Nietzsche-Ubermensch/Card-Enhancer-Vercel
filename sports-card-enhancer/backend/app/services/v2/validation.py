"""Real upload validation: decode actual bytes, never trust extension/MIME."""
from __future__ import annotations

import hashlib
import io
import re
import unicodedata
from dataclasses import dataclass, field
from typing import List

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD_BYTES = 50 * 1024 * 1024       # 50 MB per file
MAX_DIMENSION = 12000                      # reject absurd dimensions
SUPPORTED_FORMATS = {"JPEG", "PNG", "TIFF", "BMP", "WEBP"}

_UNSAFE_CHARS = re.compile(r"[^A-Za-z0-9._\-]+")


@dataclass
class ValidatedImage:
    """A verified, decoded upload ready for immutable storage."""
    image: np.ndarray           # RGB array, EXIF orientation already applied
    width: int
    height: int
    format: str
    sha256: str
    safe_filename: str
    size_bytes: int
    warnings: List[str] = field(default_factory=list)


class UploadRejected(ValueError):
    """Raised with a human-readable reason when an upload is invalid."""


def sanitize_filename(filename: str, default: str = "upload") -> str:
    """Strip path traversal, control chars, and anything path-unsafe."""
    name = unicodedata.normalize("NFKC", filename or "")
    # Remove any directory components the client may have smuggled in.
    name = name.replace("\\", "/").split("/")[-1]
    name = "".join(c for c in name if c.isprintable())
    name = _UNSAFE_CHARS.sub("_", name).strip("._")
    if not name:
        name = default
    return name[:120]


def validate_uploaded_image(
    file_bytes: bytes,
    filename: str,
    mime_type: str = "",
    *,
    max_bytes: int = MAX_UPLOAD_BYTES,
    max_dimension: int = MAX_DIMENSION,
) -> ValidatedImage:
    """Decode and verify the real bytes of an uploaded image.

    Rejects corrupt images, zero-dimension images, oversize files and
    unsupported true formats. Applies EXIF orientation so every downstream
    stage sees the image the way the user photographed it. The filename
    extension and the declared MIME type are treated as hints only.
    """
    if not file_bytes:
        raise UploadRejected(f"{filename}: empty file")
    if len(file_bytes) > max_bytes:
        raise UploadRejected(
            f"{filename}: file too large ({len(file_bytes) // (1024 * 1024)}MB, "
            f"limit {max_bytes // (1024 * 1024)}MB)")

    try:
        pil = Image.open(io.BytesIO(file_bytes))
        pil.verify()  # cheap structural check
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise UploadRejected(f"{filename}: unsupported or corrupted image") from exc

    # verify() invalidates the image object; reopen for real decoding.
    pil = Image.open(io.BytesIO(file_bytes))
    true_format = (pil.format or "").upper()
    if true_format not in SUPPORTED_FORMATS:
        raise UploadRejected(f"{filename}: unsupported image format ({true_format or 'unknown'})")

    warnings: List[str] = []
    declared_ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    ext_for_format = {
        "JPEG": {"jpg", "jpeg"}, "PNG": {"png"}, "TIFF": {"tif", "tiff"},
        "BMP": {"bmp"}, "WEBP": {"webp"},
    }
    if declared_ext and declared_ext not in ext_for_format.get(true_format, set()):
        warnings.append(
            f"extension .{declared_ext} does not match actual format {true_format}")

    try:
        pil = ImageOps.exif_transpose(pil)  # honor EXIF orientation
    except (OSError, ValueError):
        pass

    if pil.mode in ("RGBA", "LA", "P", "CMYK", "I;16", "I"):
        pil = pil.convert("RGB")

    width, height = pil.size
    if width <= 0 or height <= 0:
        raise UploadRejected(f"{filename}: zero-dimension image")
    if max(width, height) > max_dimension:
        raise UploadRejected(
            f"{filename}: dimensions {width}x{height} exceed limit {max_dimension}")

    image = np.array(pil)
    if image.ndim == 2:  # grayscale -> RGB
        image = np.stack([image] * 3, axis=-1)

    sha256 = hashlib.sha256(file_bytes).hexdigest()
    return ValidatedImage(
        image=image,
        width=width,
        height=height,
        format=true_format,
        sha256=sha256,
        safe_filename=sanitize_filename(filename),
        size_bytes=len(file_bytes),
        warnings=warnings,
    )
