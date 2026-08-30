"""Validated batch processing utilities for adaptive preprocessing."""
from __future__ import annotations

import concurrent.futures
from typing import Any, Dict, List

import cv2
import numpy as np

from .adaptive_preprocessor import AdaptivePreprocessor


def _validate_result(result: Any) -> tuple[bool, str | None]:
    """Validate the image-like output before it is reported as complete."""
    if not isinstance(result, dict):
        return False, "processor returned a non-dict result"
    image = result.get("image", result.get("output"))
    if image is None:
        return True, None  # Feature-only preprocessors have no image artifact.
    if not isinstance(image, np.ndarray) or image.ndim not in (2, 3):
        return False, "processor returned an invalid image array"
    if image.size == 0 or image.shape[0] < 1 or image.shape[1] < 1:
        return False, "processor returned an empty image"
    if not np.isfinite(image).all():
        return False, "processor returned non-finite pixels"
    return True, None


def _process_single(path: str, preprocessor: AdaptivePreprocessor) -> Dict:
    """Process one path in a picklable top-level worker."""
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        return {"path": path, "status": "load_failed", "error": "Could not read image"}
    try:
        result = preprocessor.process(img)
        valid, error = _validate_result(result)
        if not valid:
            return {"path": path, "status": "validation_failed", "error": error}
        return {**result, "path": path, "status": "verified"}
    except Exception as exc:
        return {"path": path, "status": "processing_failed", "error": str(exc)}


def batch_process_cards(
    image_paths: List[str], preprocessor: AdaptivePreprocessor, max_workers: int = 4
) -> List[Dict]:
    """Process a batch with deterministic result ordering and explicit statuses."""
    if max_workers < 1:
        raise ValueError("max_workers must be >= 1")
    if not image_paths:
        return []
    worker = lambda path: _process_single(path, preprocessor)
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        return list(executor.map(worker, image_paths))
