"""YOLOv11 unit-level smoke tests — CPU only, uses nano model."""
from __future__ import annotations

import io
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw


@pytest.fixture(scope="module")
def synthetic_card_path(tmp_path_factory) -> Path:
    tmp = tmp_path_factory.mktemp("cards")
    img = Image.new("RGB", (480, 680), color=(240, 240, 240))
    draw = ImageDraw.Draw(img)
    draw.rectangle([20, 20, 460, 660], fill=(30, 100, 200), outline=(10, 10, 10), width=4)
    draw.rectangle([40, 40, 440, 420], fill=(200, 220, 255))
    draw.text((60, 430), "Test Card", fill=(255, 255, 255))
    p = tmp / "card.jpg"
    img.save(str(p), quality=90)
    return p


def test_yolo_import():
    """ultralytics must be importable."""
    import ultralytics  # noqa: F401


def test_yolo_model_loads():
    """Nano model loads without error on CPU."""
    from ultralytics import YOLO
    model = YOLO("yolo11n.pt")
    assert model is not None


def test_yolo_predicts_on_synthetic_card(synthetic_card_path: Path):
    """Model runs inference; result shape matches input."""
    from ultralytics import YOLO
    model = YOLO("yolo11n.pt")
    results = model.predict(
        source=str(synthetic_card_path),
        conf=0.01,     # very low — synthetic image unlikely to have real objects
        iou=0.45,
        save=False,
        verbose=False,
    )
    assert len(results) == 1
    r = results[0]
    # orig_shape is (H, W)
    assert r.orig_shape == (680, 480)


def test_yolo_result_has_boxes_attribute(synthetic_card_path: Path):
    from ultralytics import YOLO
    model = YOLO("yolo11n.pt")
    results = model.predict(
        source=str(synthetic_card_path),
        conf=0.01,
        save=False,
        verbose=False,
    )
    r = results[0]
    # boxes attribute always exists (may be empty)
    assert hasattr(r, "boxes")


def test_yolo_obb_model_loads():
    """OBB nano model loads — for rotated bounding-box card detection."""
    try:
        from ultralytics import YOLO
        model = YOLO("yolo11n-obb.pt")
        assert model is not None
    except Exception as exc:
        pytest.skip(f"OBB model unavailable in CI: {exc}")
