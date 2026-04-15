"""
YOLO11-OBB card detector — optional Stage 0 replacement.

Replaces the OpenCV contour-based crop in realesrgan_backend._crop_card()
with a proper object-detection model that handles tilted, overlapping,
and partially occluded cards.

Falls back gracefully:
  - ultralytics not installed  → returns image unchanged
  - weights not found / download fails → returns image unchanged
  - no card detected / low confidence → returns image unchanged
"""
from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from PIL import Image

log = logging.getLogger("card_enhancer")

_WEIGHTS = Path("models/card_detector_obb.pt")
_CONFIDENCE = 0.55
_model = None
_load_lock = threading.Lock()


def _load() -> None:
    """Load YOLO model once (thread-safe via lock)."""
    global _model
    if _model is not None:
        return
    with _load_lock:
        # Double-check after acquiring lock
        if _model is not None:
            return
        try:
            from ultralytics import YOLO

            if not _WEIGHTS.exists():
                log.info(
                    f"YOLO weights not found at {_WEIGHTS} — "
                    "run train_detector.py or place card_detector_obb.pt in models/"
                )
                return
            _model = YOLO(str(_WEIGHTS))
            log.info(f"YOLO11-OBB loaded from {_WEIGHTS}")
        except ImportError:
            log.warning("ultralytics not installed — YOLO crop disabled")
        except Exception as exc:
            log.warning(f"YOLO load failed: {exc} — falling back to OpenCV contour")


def is_available() -> bool:
    """Check if YOLO detector can run (weights present + ultralytics installed)."""
    _load()
    return _model is not None


def detect_and_crop(img: Image.Image) -> Image.Image:
    """
    Run YOLO11-OBB on img.  If a card is found with confidence >= _CONFIDENCE,
    return the perspective-corrected crop.  Otherwise return img unchanged.
    """
    _load()
    if _model is None:
        return img  # ultralytics not installed or weights missing

    bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    results = _model(bgr, verbose=False)

    if not results or results[0].obb is None or len(results[0].obb) == 0:
        log.debug("YOLO: no card detected, using original")
        return img

    best = results[0].obb[0]
    conf = float(best.conf[0])
    if conf < _CONFIDENCE:
        log.debug(f"YOLO: low confidence {conf:.2f}, skipping crop")
        return img

    # xyxyxyxy → (4, 2) float32 corner points in pixel coords
    pts = best.xyxyxyxy[0].cpu().numpy().reshape(4, 2).astype(np.float32)

    # Order: top-left, top-right, bottom-right, bottom-left
    pts = _order_points(pts)

    # Compute output dimensions from the detected box (preserve aspect ratio)
    width_top = float(np.linalg.norm(pts[1] - pts[0]))
    width_bot = float(np.linalg.norm(pts[2] - pts[3]))
    height_left = float(np.linalg.norm(pts[3] - pts[0]))
    height_right = float(np.linalg.norm(pts[2] - pts[1]))
    out_w = int(max(width_top, width_bot))
    out_h = int(max(height_left, height_right))

    # Clamp to reasonable bounds (don't produce tiny or huge crops)
    out_w = max(out_w, 100)
    out_h = max(out_h, 140)

    dst = np.array(
        [[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]],
        dtype=np.float32,
    )
    M = cv2.getPerspectiveTransform(pts, dst)
    warped = cv2.warpPerspective(bgr, M, (out_w, out_h))
    log.info(f"YOLO: card cropped at conf={conf:.2f}, size={out_w}x{out_h}")
    return Image.fromarray(cv2.cvtColor(warped, cv2.COLOR_BGR2RGB))


def _order_points(pts: np.ndarray) -> np.ndarray:
    """Sort 4 corner points into TL, TR, BR, BL order."""
    rect = np.zeros((4, 2), dtype=np.float32)
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]   # TL: smallest x+y
    rect[2] = pts[np.argmax(s)]   # BR: largest x+y
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]  # TR: smallest y-x
    rect[3] = pts[np.argmax(diff)]  # BL: largest y-x
    return rect
