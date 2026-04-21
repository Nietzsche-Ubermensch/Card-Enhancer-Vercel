"""Unit tests for YOLODetector.

These tests run without actual model weights; they verify the detector's
fallback behaviour, public interface, and result structure.
"""
from __future__ import annotations

import io
import os

import numpy as np
import pytest
from PIL import Image

# Force opencv backend so no API tokens are needed
os.environ.setdefault("UPSCALE_BACKEND", "opencv")
os.environ.setdefault("YOLO_MODEL_PATH", "models/nonexistent_for_test.pt")
os.environ.setdefault("YOLO_CONFIDENCE", "0.4")
os.environ.setdefault("YOLO_DEVICE", "cpu")


# ── Helpers ─────────────────────────────────────────────────────────────────

def _pil_image(w: int = 64, h: int = 64) -> Image.Image:
    arr = np.random.randint(0, 255, (h, w, 3), dtype=np.uint8)
    return Image.fromarray(arr, "RGB")


def _bgr_array(w: int = 64, h: int = 64) -> np.ndarray:
    return np.random.randint(0, 255, (h, w, 3), dtype=np.uint8)


# ── Instantiation ────────────────────────────────────────────────────────────

def test_detector_instantiation():
    from app.services.yolo_detector import YOLODetector
    d = YOLODetector(model_path="models/nonexistent.pt", confidence=0.5, device="cpu")
    assert d._confidence == 0.5
    assert d._device == "cpu"


# ── Graceful fallback when weights are absent ────────────────────────────────

def test_load_returns_false_when_weights_missing():
    from app.services.yolo_detector import YOLODetector
    d = YOLODetector(model_path="models/nonexistent_weights_abc.pt")
    result = d.load()
    assert result is False


def test_is_available_false_when_weights_missing():
    from app.services.yolo_detector import YOLODetector
    d = YOLODetector(model_path="models/no_such_file.pt")
    assert d.is_available is False


def test_detect_returns_empty_result_when_unavailable():
    from app.services.yolo_detector import YOLODetector
    d = YOLODetector(model_path="models/no_such_file.pt")
    result = d.detect(_pil_image())
    assert result.model_available is False
    assert result.detections == []
    assert result.count == 0


def test_detect_preserves_image_dimensions():
    from app.services.yolo_detector import YOLODetector
    d = YOLODetector(model_path="models/no_such_file.pt")
    img = _pil_image(w=320, h=240)
    result = d.detect(img)
    assert result.image_width == 320
    assert result.image_height == 240


def test_detect_with_numpy_bgr_array():
    from app.services.yolo_detector import YOLODetector
    d = YOLODetector(model_path="models/no_such_file.pt")
    arr = _bgr_array(w=128, h=96)
    result = d.detect(arr)
    assert result.image_width == 128
    assert result.image_height == 96


def test_batch_detect_returns_one_result_per_image():
    from app.services.yolo_detector import YOLODetector
    d = YOLODetector(model_path="models/no_such_file.pt")
    images = [_pil_image() for _ in range(3)]
    results = d.detect_batch(images)
    assert len(results) == 3


def test_inference_result_fields():
    from app.services.yolo_detector import YOLODetector
    d = YOLODetector(model_path="models/no_such_file.pt", model_name="test-model")
    result = d.detect(_pil_image())
    assert result.model_name == "test-model"
    assert isinstance(result.inference_time_ms, float)
    assert isinstance(result.image_width, int)
    assert isinstance(result.image_height, int)


def test_get_detector_returns_singleton():
    from app.services.yolo_detector import get_detector
    a = get_detector()
    b = get_detector()
    assert a is b


# ── Internal helpers ─────────────────────────────────────────────────────────

def test_image_size_from_pil():
    from app.services.yolo_detector import _image_size
    img = _pil_image(w=100, h=200)
    assert _image_size(img) == (100, 200)


def test_image_size_from_numpy():
    from app.services.yolo_detector import _image_size
    arr = _bgr_array(w=150, h=75)
    assert _image_size(arr) == (150, 75)


def test_to_numpy_bgr_from_pil_returns_3channel():
    from app.services.yolo_detector import _to_numpy_bgr
    img = _pil_image(w=32, h=32)
    arr = _to_numpy_bgr(img)
    assert arr.shape == (32, 32, 3)
    assert arr.dtype == np.uint8


def test_to_numpy_bgr_passthrough_for_ndarray():
    from app.services.yolo_detector import _to_numpy_bgr
    arr = _bgr_array(w=32, h=32)
    out = _to_numpy_bgr(arr)
    assert out is arr
