"""End-to-end card processing pipeline.

Chains the product path for a single card:

    IMPORT -> ORIENTATION -> CROP -> PERSPECTIVE CORRECT -> OPTIMIZE

Each stage writes a distinct artifact and the ORIGINAL is preserved untouched.
This pipeline is pure image processing — it never requires an AI provider.
OCR/DCPT hooks are optional augmentation layered on top elsewhere.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional, Tuple

import cv2
import numpy as np

from app.services.orientation_service import OrientationService, OrientationResult
from app.services.optimization_service import (
    OptimizationService, CardArtifacts, OptimizationOutcome
)
from app.utils.image_utils import ImageProcessor

logger = logging.getLogger(__name__)

# Standard trading-card aspect ratio (width / height when portrait).
CARD_ASPECT = 2.5 / 3.5  # ~0.714


class CardPipeline:
    """Orchestrates orientation, crop, perspective correction and optimization."""

    def __init__(self):
        self.orientation_service = OrientationService()
        self.optimization_service = OptimizationService()
        self.image_processor = ImageProcessor()

    # ------------------------------------------------------------------ #
    # Crop / perspective
    # ------------------------------------------------------------------ #
    def _detect_card_quad(self, image: np.ndarray) -> Tuple[Optional[np.ndarray], float]:
        """Find the card's 4 corners for perspective rectification.

        Returns (quad, confidence). quad is a (4, 2) float array in
        order [top-left, top-right, bottom-right, bottom-left], or None.
        """
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY) if image.ndim == 3 else image
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 40, 120)
        # Close small gaps in the card border.
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None, 0.0

        largest = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(largest)
        img_area = image.shape[0] * image.shape[1]
        if area < img_area * 0.15:
            return None, 0.0

        peri = cv2.arcLength(largest, True)
        approx = cv2.approxPolyDP(largest, 0.02 * peri, True)

        if len(approx) == 4:
            quad = approx.reshape(4, 2).astype(np.float32)
            confidence = float(min(0.95, area / img_area + 0.3))
            return self._order_quad(quad), confidence

        # Fall back to the minimum-area rectangle.
        rect = cv2.minAreaRect(largest)
        box = cv2.boxPoints(rect).astype(np.float32)
        confidence = float(min(0.8, area / img_area + 0.2))
        return self._order_quad(box), confidence

    @staticmethod
    def _order_quad(pts: np.ndarray) -> np.ndarray:
        """Order 4 points as [top-left, top-right, bottom-right, bottom-left]."""
        rect = np.zeros((4, 2), dtype=np.float32)
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)]      # top-left has smallest sum
        rect[2] = pts[np.argmax(s)]      # bottom-right has largest sum
        diff = np.diff(pts, axis=1)
        rect[1] = pts[np.argmin(diff)]   # top-right has smallest diff
        rect[3] = pts[np.argmax(diff)]   # bottom-left has largest diff
        return rect

    def _rectify(self, image: np.ndarray) -> Tuple[np.ndarray, float]:
        """Perspective-correct and crop to the detected card.

        Returns (rectified_image, crop_confidence). When no confident card
        region is found, returns the input (aspect-cropped) with low confidence.
        """
        quad, confidence = self._detect_card_quad(image)
        if quad is None:
            # No clear card region — aspect-crop as a safe fallback.
            return self.image_processor.crop_to_aspect_ratio(image), 0.2

        # Compute output dimensions honoring the card aspect ratio.
        (tl, tr, br, bl) = quad
        width = int(max(np.linalg.norm(br - bl), np.linalg.norm(tr - tl)))
        height = int(max(np.linalg.norm(tr - br), np.linalg.norm(tl - bl)))
        width = max(width, 1)
        height = max(height, 1)

        # Keep the card portrait after rectification.
        if width > height:
            width, height = int(height), int(width)

        dst = np.array(
            [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]],
            dtype=np.float32,
        )
        matrix = cv2.getPerspectiveTransform(quad, dst)
        rectified = cv2.warpPerspective(image, matrix, (width, height))
        return rectified, confidence

    # ------------------------------------------------------------------ #
    # Public pipeline
    # ------------------------------------------------------------------ #
    def process(
        self,
        source_path: str,
        output_dir: str,
        manual_orientation: Optional[int] = None,
        output_format: str = "png",
        output_quality: int = 95,
        output_dpi: int = 300,
        aggressive: bool = False,
    ) -> OptimizationOutcome:
        """Run the full pipeline for one card.

        Args:
            source_path: Path to the imported original image.
            output_dir: Directory for the generated artifacts.
            manual_orientation: Optional 0/90/180/270 override (wins over detection).
            output_format: png | jpg | webp | tiff for the OPTIMIZED artifact.
            output_quality: Encoder quality for lossy formats.
            output_dpi: DPI metadata for the OPTIMIZED artifact.
            aggressive: Apply corrections even when metrics look acceptable.

        Returns:
            OptimizationOutcome with artifact paths, metrics, warnings, and
            orientation/crop metadata.
        """
        out_dir = Path(output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        stem = Path(source_path).stem

        artifacts = CardArtifacts(original=source_path)  # original preserved as-is
        warnings = []

        # 1) Load the ORIGINAL (never overwritten).
        image = self.image_processor.load_image(source_path)

        # 2) ORIENTATION -> NORMALIZED.
        if manual_orientation is not None:
            normalized, orient = self.orientation_service.apply_manual(image, manual_orientation)
        else:
            orient = self.orientation_service.detect(source_path, image)
            normalized = self.orientation_service.correct(image, orient)
        normalized_path = out_dir / f"{stem}_normalized.png"
        self.image_processor.save_image(normalized, str(normalized_path), dpi=output_dpi)
        artifacts.normalized = str(normalized_path)
        if orient.orientation_confidence < 0.6:
            warnings.append(f"low orientation confidence ({orient.orientation_confidence:.2f})")

        # 3) CROP + PERSPECTIVE -> RECTIFIED.
        rectified, crop_confidence = self._rectify(normalized)
        rectified_path = out_dir / f"{stem}_rectified.png"
        self.image_processor.save_image(rectified, str(rectified_path), dpi=output_dpi)
        artifacts.rectified = str(rectified_path)
        if crop_confidence < 0.5:
            warnings.append(f"low crop confidence ({crop_confidence:.2f})")

        # 4) OPTIMIZE -> OPTIMIZED.
        optimized, metrics = self.optimization_service.optimize(rectified, aggressive=aggressive)
        ext = output_format if output_format != "jpg" else "jpg"
        optimized_path = out_dir / f"{stem}_optimized.{ext}"
        self.image_processor.save_image(
            optimized, str(optimized_path), quality=output_quality, dpi=output_dpi
        )
        artifacts.optimized = str(optimized_path)

        # Surface notable quality warnings.
        if metrics.blur < 0.2:
            warnings.append("image appears blurry")
        if metrics.glare > 0.05:
            warnings.append("significant glare detected")
        if metrics.exposure < 0.3:
            warnings.append("image underexposed")
        elif metrics.exposure > 0.75:
            warnings.append("image overexposed")

        return OptimizationOutcome(
            artifacts=artifacts,
            metrics=metrics,
            warnings=warnings,
            orientation=orient.as_dict(),
            crop_confidence=round(float(crop_confidence), 4),
        )
