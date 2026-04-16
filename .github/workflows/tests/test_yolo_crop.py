"""CI quality gate for YOLO11-OBB card detector.

Generates a synthetic card scene, runs YOLO crop, and asserts:
  - Detection confidence >= 0.55
  - Crop dimensions are smaller than source (card was found)
  - Aspect ratio is reasonable (roughly card-shaped)
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Ensure extension root on path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.card_detector import detect_and_crop_detailed, is_available

# Skip entire module when YOLO is not available
pytestmark = pytest.mark.skipif(
    not is_available(),
    reason="ultralytics not installed or weights missing — skipping YOLO CI gate",
)


def _generate_scene(tmp_path: Path) -> Path:
    from tests.generate_test_card import generate_test_card
    return generate_test_card(tmp_path / "card_scene.png")


# ── Tests ────────────────────────────────────────────────────────────────────


def test_yolo_confidence_threshold(tmp_path: Path):
    """YOLO must detect the card with confidence >= 0.55."""
    from PIL import Image

    scene_path = _generate_scene(tmp_path)
    img = Image.open(scene_path)
    result = detect_and_crop_detailed(img, conf=0.25)

    assert result["detected"], "YOLO did not detect any card in the test scene"
    assert result["confidence"] >= 0.55, (
        f"Confidence too low: {result['confidence']:.3f} < 0.55"
    )


def test_yolo_crop_reduces_dimensions(tmp_path: Path):
    """Cropped output should be strictly smaller than the source scene."""
    from PIL import Image

    scene_path = _generate_scene(tmp_path)
    img = Image.open(scene_path)
    result = detect_and_crop_detailed(img, conf=0.25)

    assert result["detected"], "YOLO did not detect any card"

    pre_area = result["pre_width"] * result["pre_height"]
    post_area = result["post_width"] * result["post_height"]
    assert post_area < pre_area, (
        f"Crop area ({post_area}) not smaller than source ({pre_area})"
    )


def test_yolo_crop_aspect_ratio(tmp_path: Path):
    """Cropped card aspect ratio should be roughly portrait (0.45–1.05)."""
    from PIL import Image

    scene_path = _generate_scene(tmp_path)
    img = Image.open(scene_path)
    result = detect_and_crop_detailed(img, conf=0.25)

    assert result["detected"], "YOLO did not detect any card"

    aspect = result["post_width"] / result["post_height"]
    assert 0.45 <= aspect <= 1.05, (
        f"Crop aspect ratio {aspect:.3f} outside expected range [0.45, 1.05]"
    )


def test_yolo_no_detection_returns_original():
    """A plain colored image (no card) should return original unchanged."""
    from PIL import Image

    blank = Image.new("RGB", (400, 300), (128, 128, 128))
    result = detect_and_crop_detailed(blank, conf=0.50)

    assert not result["detected"], "False positive on blank image"
    assert result["confidence"] == 0.0
    assert result["cropped"].size == blank.size
