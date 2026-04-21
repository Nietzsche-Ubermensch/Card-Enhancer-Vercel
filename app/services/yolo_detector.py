"""
Reusable YOLO detector.

Wraps Ultralytics YOLOv8/YOLO11 for object detection with structured output.
Model is loaded once via load(), which is called at application startup.
Falls back gracefully when weights are missing or ultralytics is not installed.
Thread-safe for concurrent inference requests.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Union

import numpy as np
from PIL import Image

from app.utils.logger import log


# ── Domain types ────────────────────────────────────────────────────────────

@dataclass
class BBox:
    """Axis-aligned bounding box with coordinates normalized to [0, 1]."""
    x1: float
    y1: float
    x2: float
    y2: float


@dataclass
class Detection:
    label: str
    confidence: float
    bbox: BBox


@dataclass
class InferenceResult:
    detections: list[Detection]
    image_width: int
    image_height: int
    inference_time_ms: float
    model_name: str
    model_available: bool = True

    @property
    def count(self) -> int:
        return len(self.detections)


# ── Detector ────────────────────────────────────────────────────────────────

class YOLODetector:
    """
    Wraps an Ultralytics YOLO model for inference.

    Supports both OBB (oriented bounding box) and regular detection models.
    For OBB models the axis-aligned bounding box is returned so callers have
    a uniform interface regardless of model variant.

    Usage:
        detector = YOLODetector(model_path="...", confidence=0.4, device="cpu")
        detector.load()               # call once at startup
        result = detector.detect(pil_image)
    """

    def __init__(
        self,
        model_path: str,
        confidence: float = 0.4,
        device: str = "cpu",
        model_name: str = "yolo",
    ) -> None:
        self._model_path = Path(model_path)
        self._confidence = confidence
        self._device = device
        self._model_name = model_name
        self._model = None
        self._load_lock = threading.Lock()
        self._available: Optional[bool] = None

    # ── Lifecycle ────────────────────────────────────────────────────────

    def load(self) -> bool:
        """
        Load model weights. Should be called once during application startup,
        not per-request. Thread-safe (double-checked locking).

        Returns True if the model loaded successfully, False otherwise.
        """
        if self._available is not None:
            return self._available is True

        with self._load_lock:
            if self._available is not None:
                return self._available is True

            try:
                from ultralytics import YOLO  # type: ignore[import]

                if not self._model_path.exists():
                    log.warning(
                        f"YOLO weights not found at {self._model_path}. "
                        "Place model weights there or set YOLO_MODEL_PATH."
                    )
                    self._available = False
                    return False

                self._model = YOLO(str(self._model_path))
                self._available = True
                log.info(
                    f"YOLODetector ready — model={self._model_path.name} "
                    f"device={self._device} conf={self._confidence}"
                )
                return True

            except ImportError:
                log.warning("ultralytics not installed — YOLO detection disabled")
                self._available = False
                return False
            except Exception as exc:
                log.error(f"YOLO model load failed: {exc}")
                self._available = False
                return False

    @property
    def is_available(self) -> bool:
        if self._available is None:
            self.load()
        return self._available is True

    # ── Inference ────────────────────────────────────────────────────────

    def detect(
        self,
        image: Union[Image.Image, np.ndarray],
        confidence: Optional[float] = None,
    ) -> InferenceResult:
        """
        Run inference on a single image. Thread-safe.

        Args:
            image: PIL Image or BGR numpy array (as returned by cv2.imread).
            confidence: Override the instance-level confidence threshold.
        """
        w, h = _image_size(image)
        threshold = confidence if confidence is not None else self._confidence

        empty = InferenceResult(
            detections=[],
            image_width=w,
            image_height=h,
            inference_time_ms=0.0,
            model_name=self._model_name,
            model_available=False,
        )

        if not self.is_available:
            return empty

        arr = _to_numpy_bgr(image)
        t0 = time.perf_counter()
        try:
            results = self._model(arr, conf=threshold, device=self._device, verbose=False)
        except Exception as exc:
            log.error(f"YOLO inference error: {exc}")
            return empty

        elapsed_ms = (time.perf_counter() - t0) * 1000
        detections = _parse_results(results, w, h, threshold)

        return InferenceResult(
            detections=detections,
            image_width=w,
            image_height=h,
            inference_time_ms=round(elapsed_ms, 2),
            model_name=self._model_name,
            model_available=True,
        )

    def detect_batch(
        self,
        images: list[Union[Image.Image, np.ndarray]],
        confidence: Optional[float] = None,
    ) -> list[InferenceResult]:
        """Run detect() sequentially for each image. Thread-safe."""
        return [self.detect(img, confidence) for img in images]


# ── Helpers ─────────────────────────────────────────────────────────────────

def _image_size(image: Union[Image.Image, np.ndarray]) -> tuple[int, int]:
    if isinstance(image, Image.Image):
        return image.size  # (width, height)
    h, w = image.shape[:2]
    return w, h


def _to_numpy_bgr(image: Union[Image.Image, np.ndarray]) -> np.ndarray:
    import cv2  # type: ignore[import]
    if isinstance(image, Image.Image):
        arr = np.array(image.convert("RGB"))
        return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    return image


def _parse_results(
    results: list,
    img_w: int,
    img_h: int,
    threshold: float,
) -> list[Detection]:
    if not results:
        return []

    res = results[0]
    detections: list[Detection] = []

    # OBB model (e.g., YOLO11-OBB) — use axis-aligned bbox from OBB coords
    if hasattr(res, "obb") and res.obb is not None and len(res.obb) > 0:
        for box in res.obb:
            conf = float(box.conf[0])
            if conf < threshold:
                continue
            xyxy = box.xyxy[0].cpu().numpy()
            cls_id = int(box.cls[0]) if hasattr(box, "cls") else 0
            label = res.names.get(cls_id, str(cls_id)) if hasattr(res, "names") else str(cls_id)
            detections.append(_make_detection(label, conf, xyxy, img_w, img_h))
        return detections

    # Standard detection model
    if hasattr(res, "boxes") and res.boxes is not None and len(res.boxes) > 0:
        for box in res.boxes:
            conf = float(box.conf[0])
            if conf < threshold:
                continue
            xyxy = box.xyxy[0].cpu().numpy()
            cls_id = int(box.cls[0])
            label = res.names.get(cls_id, str(cls_id))
            detections.append(_make_detection(label, conf, xyxy, img_w, img_h))

    return detections


def _make_detection(
    label: str,
    conf: float,
    xyxy: np.ndarray,
    img_w: int,
    img_h: int,
) -> Detection:
    x1, y1, x2, y2 = xyxy
    return Detection(
        label=label,
        confidence=round(float(conf), 4),
        bbox=BBox(
            x1=max(0.0, float(x1) / img_w),
            y1=max(0.0, float(y1) / img_h),
            x2=min(1.0, float(x2) / img_w),
            y2=min(1.0, float(y2) / img_h),
        ),
    )


# ── Module-level singleton ───────────────────────────────────────────────────
# Instantiated at import time; load() is called during application lifespan.

def _make_detector() -> YOLODetector:
    from app.core.config import settings  # deferred to avoid circular import at module load
    return YOLODetector(
        model_path=settings.YOLO_MODEL_PATH,
        confidence=settings.YOLO_CONFIDENCE,
        device=settings.YOLO_DEVICE,
        model_name=settings.YOLO_MODEL_PATH.rsplit("/", 1)[-1].removesuffix(".pt") or "yolo",
    )


_detector_instance: Optional[YOLODetector] = None
_detector_lock = threading.Lock()


def get_detector() -> YOLODetector:
    """Return the module-level detector singleton, creating it if needed."""
    global _detector_instance
    if _detector_instance is None:
        with _detector_lock:
            if _detector_instance is None:
                _detector_instance = _make_detector()
    return _detector_instance
