"""
YOLO11-OBB card detector — optional Stage 0 replacement.

Falls back gracefully:
  - ultralytics not installed  → returns image unchanged
  - weights not found          → returns image unchanged
  - no card detected           → returns image unchanged
  - low confidence             → returns image unchanged
"""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple

import cv2
import numpy as np
from PIL import Image

log = logging.getLogger("card_enhancer")

_WEIGHTS = Path("models/card_detector_obb.pt")
_CONFIDENCE = 0.55
_model = None
_load_lock = threading.Lock()


@dataclass
class DetectionResult:
    detected: bool
    confidence: float
    original_size: Tuple[int, int]   # (w, h)
    cropped_size: Tuple[int, int]    # (w, h) — same as original if not detected
    image: Image.Image


def _load() -> None:
    global _model
    if _model is not None:
        return
    with _load_lock:
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
    _load()
    return _model is not None


def detect_and_crop_detailed(img: Image.Image) -> DetectionResult:
    """
    Full detection with metadata.  Used by CI quality gate and
    any caller that needs confidence score + dimension comparison.
    """
    orig_w, orig_h = img.size
    no_detect = DetectionResult(
        detected=False,
        confidence=0.0,
        original_size=(orig_w, orig_h),
        cropped_size=(orig_w, orig_h),
        image=img,
    )

    _load()
    if _model is None:
        return no_detect

    bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    results = _model(bgr, verbose=False)

    if not results or results[0].obb is None or len(results[0].obb) == 0:
        log.debug("YOLO: no card detected")
        return no_detect

    best = results[0].obb[0]
    conf = float(best.conf[0])
    if conf < _CONFIDENCE:
        log.debug(f"YOLO: low confidence {conf:.2f}")
        return no_detect

    pts = best.xyxyxyxy[0].cpu().numpy().reshape(4, 2).astype(np.float32)
    pts = _order_points(pts)

    width_top  = float(np.linalg.norm(pts[1] - pts[0]))
    width_bot  = float(np.linalg.norm(pts[2] - pts[3]))
    height_lft = float(np.linalg.norm(pts[3] - pts[0]))
    height_rgt = float(np.linalg.norm(pts[2] - pts[1]))
    out_w = max(int(max(width_top, width_bot)), 100)
    out_h = max(int(max(height_lft, height_rgt)), 140)

    dst = np.array(
        [[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]],
        dtype=np.float32,
    )
    M = cv2.getPerspectiveTransform(pts, dst)
    warped = cv2.warpPerspective(bgr, M, (out_w, out_h))
    cropped = Image.fromarray(cv2.cvtColor(warped, cv2.COLOR_BGR2RGB))

    log.info(f"YOLO: card cropped conf={conf:.2f} {orig_w}x{orig_h} → {out_w}x{out_h}")
    return DetectionResult(
        detected=True,
        confidence=conf,
        original_size=(orig_w, orig_h),
        cropped_size=(out_w, out_h),
        image=cropped,
    )


def detect_and_crop(img: Image.Image) -> Image.Image:
    """Simple wrapper — returns cropped image or original unchanged."""
    return detect_and_crop_detailed(img).image


def _order_points(pts: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype=np.float32)
    s    = pts.sum(axis=1)
    diff = np.diff(pts, axis=1)
    rect[0] = pts[np.argmin(s)]     # TL
    rect[1] = pts[np.argmin(diff)]  # TR
    rect[2] = pts[np.argmax(s)]     # BR
    rect[3] = pts[np.argmax(diff)]  # BL
    return rect
