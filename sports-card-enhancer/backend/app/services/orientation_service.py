"""Smart orientation detection for card images.

Detects orientation among {0, 90, 180, 270} degrees using *local* signals
first — EXIF metadata, image geometry, and edge/projection heuristics. An AI
provider is an optional fallback and is never required for this to work.

Returns orientation_degrees, orientation_confidence, orientation_method.
A manual override always wins over detection.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional, Tuple

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# Standard trading-card aspect ratio (width / height when portrait).
CARD_ASPECT = 2.5 / 3.5  # ~0.714


@dataclass
class OrientationResult:
    """Outcome of orientation detection."""
    orientation_degrees: int          # one of 0, 90, 180, 270
    orientation_confidence: float     # 0.0 - 1.0
    orientation_method: str           # exif | geometry | edge_heuristic | manual | default

    def as_dict(self) -> dict:
        return {
            "orientation_degrees": self.orientation_degrees,
            "orientation_confidence": round(float(self.orientation_confidence), 4),
            "orientation_method": self.orientation_method,
        }


def _rotate(image: np.ndarray, degrees: int) -> np.ndarray:
    """Rotate an image counter-clockwise by the given degrees to restore upright."""
    if degrees == 90:
        return cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
    if degrees == 180:
        return cv2.rotate(image, cv2.ROTATE_180)
    if degrees == 270:
        return cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return image


class OrientationService:
    """Detects and corrects card orientation using local signals."""

    # ------------------------------------------------------------------ #
    # Signal 1: EXIF orientation tag
    # ------------------------------------------------------------------ #
    def _from_exif(self, path: str) -> Optional[OrientationResult]:
        try:
            with Image.open(path) as img:
                exif = getattr(img, "_getexif", lambda: None)() or {}
        except Exception:
            return None
        orientation = exif.get(274)  # EXIF Orientation tag
        mapping = {3: 180, 6: 270, 8: 90}  # rotation needed to restore upright
        if orientation in mapping:
            return OrientationResult(mapping[orientation], 0.99, "exif")
        if orientation == 1:
            return OrientationResult(0, 0.99, "exif")
        return None

    # ------------------------------------------------------------------ #
    # Signal 2: geometry — cards are taller than wide when upright
    # ------------------------------------------------------------------ #
    def _from_geometry(self, image: np.ndarray) -> Optional[OrientationResult]:
        h, w = image.shape[:2]
        if h == w:
            return None
        ratio = w / h
        # Upright card should be portrait (taller than wide).
        if ratio < 0.95:
            return OrientationResult(0, 0.7, "geometry")
        if ratio > 1.05:
            # Landscape — likely needs a 90/270 rotation; direction resolved later.
            return OrientationResult(90, 0.55, "geometry")
        return None

    # ------------------------------------------------------------------ #
    # Signal 3: edge/projection heuristic to pick 90 vs 270 and 0 vs 180
    # ------------------------------------------------------------------ #
    def _edge_score(self, image: np.ndarray) -> float:
        """Heuristic 'uprightness' score based on top/bottom edge asymmetry.

        Card artwork typically concentrates strong horizontal structure (title
        bars, borders) toward the top. Returns a signed score; positive means
        the current orientation looks upright.
        """
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY) if image.ndim == 3 else image
        gray = cv2.resize(gray, (200, 200))
        edges = cv2.Canny(gray, 50, 150)
        top = float(edges[:100].sum())
        bottom = float(edges[100:].sum())
        denom = (top + bottom) or 1.0
        return (top - bottom) / denom

    def _resolve_direction(self, image: np.ndarray) -> Tuple[int, float]:
        """Choose among the 4 rotations by maximizing the edge-asymmetry score."""
        scores = {}
        for deg in (0, 90, 180, 270):
            rotated = _rotate(image, deg)
            scores[deg] = self._edge_score(rotated)
        best = max(scores, key=scores.get)
        # Confidence scaled by how much the winner beats the runner-up.
        ordered = sorted(scores.values(), reverse=True)
        margin = (ordered[0] - ordered[1]) if len(ordered) > 1 else 0.0
        confidence = min(0.9, 0.5 + abs(margin))
        return best, confidence

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #
    def detect(self, path: str, image: Optional[np.ndarray] = None) -> OrientationResult:
        """Detect the rotation needed to make the card upright.

        Args:
            path: Source image path (used for EXIF).
            image: Optional pre-loaded RGB array (loaded from path if absent).

        Returns:
            OrientationResult with degrees/confidence/method.
        """
        if image is None:
            from app.utils.image_utils import ImageProcessor
            image = ImageProcessor.load_image(path)

        # 1) EXIF is authoritative when present.
        exif = self._from_exif(path)
        if exif is not None:
            return exif

        # 2) Geometry gives a coarse answer (portrait vs landscape).
        geo = self._from_geometry(image)
        if geo is not None and geo.orientation_degrees == 0 and geo.orientation_confidence >= 0.7:
            # Already portrait — verify it isn't upside-down via edge heuristic.
            score = self._edge_score(image)
            if score < -0.15:
                return OrientationResult(180, min(0.85, 0.5 + abs(score)), "edge_heuristic")
            return OrientationResult(0, 0.7, "geometry")

        # 3) Resolve the exact rotation with the edge heuristic.
        deg, conf = self._resolve_direction(image)
        method = "edge_heuristic"
        if geo is not None:
            method = "geometry"
            conf = max(conf, geo.orientation_confidence)
        return OrientationResult(deg, conf, method)

    def correct(self, image: np.ndarray, result: OrientationResult) -> np.ndarray:
        """Return the image rotated to upright according to the result."""
        return _rotate(image, result.orientation_degrees)

    def apply_manual(self, image: np.ndarray, degrees: int) -> Tuple[np.ndarray, OrientationResult]:
        """Apply a manual orientation override (always wins)."""
        degrees = degrees % 360
        if degrees not in (0, 90, 180, 270):
            raise ValueError(f"degrees must be one of 0/90/180/270, got {degrees}")
        result = OrientationResult(degrees, 1.0, "manual")
        return _rotate(image, degrees), result
