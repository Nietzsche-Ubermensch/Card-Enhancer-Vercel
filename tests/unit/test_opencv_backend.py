"""Unit tests for the OpenCV CPU upscaler backend."""
from __future__ import annotations

import io
import os
import tempfile
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

os.environ.setdefault("UPSCALE_BACKEND", "opencv")


@pytest.fixture()
def tmp_image(tmp_path: Path) -> Path:
    """Create a 64×64 test JPEG."""
    img = Image.fromarray(
        np.random.randint(0, 255, (64, 64, 3), dtype=np.uint8)
    )
    p = tmp_path / "card.jpg"
    img.save(str(p), quality=85)
    return p


def test_opencv_backend_is_available():
    from app.services.upscalers.opencv_backend import OpenCVBackend
    b = OpenCVBackend()
    assert b.is_available() is True


def test_opencv_backend_info():
    from app.services.upscalers.opencv_backend import OpenCVBackend
    info = OpenCVBackend().info()
    assert info.name == "OpenCV (CPU)"
    assert info.min_vram_gb == 0


def test_opencv_enhance_produces_output(tmp_image: Path, tmp_path: Path):
    from app.services.upscalers.opencv_backend import OpenCVBackend
    out = tmp_path / "card_enhanced.png"
    b = OpenCVBackend()
    result = b.enhance(
        str(tmp_image),
        str(out),
        {"upscale_factor": 2, "denoise": False, "sharpen": False, "auto_contrast": False, "format": "png"},
    )
    assert Path(result).exists()
    enhanced = Image.open(result)
    assert enhanced.size == (128, 128)


def test_opencv_enhance_with_all_opts(tmp_image: Path, tmp_path: Path):
    from app.services.upscalers.opencv_backend import OpenCVBackend
    out = tmp_path / "card_enhanced_full.png"
    b = OpenCVBackend()
    result = b.enhance(
        str(tmp_image),
        str(out),
        {
            "upscale_factor": 2,
            "denoise": True,
            "denoise_strength": "medium",
            "sharpen": True,
            "sharpen_strength": 0.5,
            "auto_contrast": True,
            "format": "png",
            "quality": 95,
        },
    )
    assert Path(result).exists()


def test_opencv_enhance_invalid_path():
    from app.services.upscalers.opencv_backend import OpenCVBackend
    b = OpenCVBackend()
    with pytest.raises(ValueError, match="Cannot read"):
        b.enhance("/nonexistent/path/card.jpg", "/tmp/out.png", {})
