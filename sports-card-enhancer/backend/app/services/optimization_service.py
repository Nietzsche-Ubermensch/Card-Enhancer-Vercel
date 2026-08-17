"""Card optimization service with practical quality metrics.

Optimization is practical, not cosmetic: we measure real image-quality signals
and apply targeted corrections. Each stage produces a *distinct* artifact and
the original is never overwritten.

Artifacts:
    ORIGINAL   -> the untouched uploaded file (preserved as-is)
    NORMALIZED -> orientation-corrected, mode/color normalized
    RECTIFIED  -> perspective-corrected / cropped to the card
    OPTIMIZED  -> quality-corrected (exposure, contrast, white balance,
                  glare/shadow mitigation, noise) final output

Note: restored/generated detail is never used as proof of physical card
condition — optimization only adjusts the *digital representation*.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class QualityMetrics:
    """Measured image-quality signals (all 0..1 unless noted)."""
    blur: float = 0.0            # higher = sharper (Laplacian variance, normalized)
    exposure: float = 0.5        # 0 = under, 1 = over, ~0.5 ideal
    contrast: float = 0.0        # higher = more contrast
    white_balance: float = 0.0   # deviation from neutral (lower is better)
    glare: float = 0.0           # fraction of clipped highlights
    shadow: float = 0.0          # fraction of crushed shadows
    noise: float = 0.0           # estimated noise level (higher = noisier)
    perspective: float = 0.0     # estimated skew (higher = more skewed)
    resolution: int = 0          # pixel count

    def as_dict(self) -> Dict[str, float]:
        return {
            "blur": round(self.blur, 4),
            "exposure": round(self.exposure, 4),
            "contrast": round(self.contrast, 4),
            "white_balance": round(self.white_balance, 4),
            "glare": round(self.glare, 4),
            "shadow": round(self.shadow, 4),
            "noise": round(self.noise, 4),
            "perspective": round(self.perspective, 4),
            "resolution": int(self.resolution),
        }


@dataclass
class CardArtifacts:
    """Paths to the distinct artifacts produced for one card."""
    original: Optional[str] = None
    normalized: Optional[str] = None
    rectified: Optional[str] = None
    optimized: Optional[str] = None

    def as_dict(self) -> Dict[str, Optional[str]]:
        return {
            "original": self.original,
            "normalized": self.normalized,
            "rectified": self.rectified,
            "optimized": self.optimized,
        }


@dataclass
class OptimizationOutcome:
    """Result of the full optimization pipeline for one card."""
    artifacts: CardArtifacts
    metrics: QualityMetrics
    warnings: list = field(default_factory=list)
    orientation: Optional[dict] = None
    crop_confidence: float = 0.0


class OptimizationService:
    """Measures and corrects card image quality."""

    # ------------------------------------------------------------------ #
    # Metrics
    # ------------------------------------------------------------------ #
    def measure(self, image: np.ndarray) -> QualityMetrics:
        """Compute practical quality metrics for an image."""
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY) if image.ndim == 3 else image
        h, w = gray.shape[:2]

        # Blur: variance of Laplacian, normalized.
        lap = cv2.Laplacian(gray, cv2.CV_64F).var()
        blur = float(min(1.0, lap / 500.0))

        # Exposure: mean brightness mapped to 0..1.
        exposure = float(np.clip(gray.mean() / 255.0, 0.0, 1.0))

        # Contrast: standard deviation of intensity, normalized.
        contrast = float(min(1.0, gray.std() / 64.0))

        # White balance: mean channel divergence from gray.
        if image.ndim == 3:
            r, g, b = image[..., 0].mean(), image[..., 1].mean(), image[..., 2].mean()
            avg = (r + g + b) / 3.0 or 1.0
            wb = float(min(1.0, (abs(r - avg) + abs(g - avg) + abs(b - avg)) / (3.0 * avg)))
        else:
            wb = 0.0

        # Glare / shadow: clipped highlight & crushed shadow fractions.
        glare = float((gray >= 250).mean())
        shadow = float((gray <= 5).mean())

        # Noise: median absolute deviation of a high-pass filter.
        hp = gray.astype(np.float32) - cv2.GaussianBlur(gray, (3, 3), 0)
        noise = float(min(1.0, np.median(np.abs(hp)) / 10.0))

        # Perspective: crude skew estimate from dominant contour aspect vs card.
        perspective = self._estimate_perspective(gray)

        return QualityMetrics(
            blur=blur,
            exposure=exposure,
            contrast=contrast,
            white_balance=wb,
            glare=glare,
            shadow=shadow,
            noise=noise,
            perspective=perspective,
            resolution=int(h * w),
        )

    def _estimate_perspective(self, gray: np.ndarray) -> float:
        """Estimate perspective skew as deviation from a clean rectangle."""
        edges = cv2.Canny(gray, 50, 150)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return 0.0
        largest = max(contours, key=cv2.contourArea)
        if cv2.contourArea(largest) < gray.size * 0.1:
            return 0.0
        peri = cv2.arcLength(largest, True)
        approx = cv2.approxPolyDP(largest, 0.02 * peri, True)
        # A clean rectangle yields 4 corners; more/fewer implies skew/occlusion.
        deviation = abs(len(approx) - 4)
        return float(min(1.0, deviation / 4.0))

    # ------------------------------------------------------------------ #
    # Corrections
    # ------------------------------------------------------------------ #
    def _correct_white_balance(self, image: np.ndarray) -> np.ndarray:
        """Gray-world white balance."""
        if image.ndim != 3:
            return image
        result = image.astype(np.float32)
        for c in range(3):
            mean = result[..., c].mean()
            if mean > 0:
                result[..., c] *= (image.mean() / mean)
        return np.clip(result, 0, 255).astype(np.uint8)

    def _correct_exposure_contrast(self, image: np.ndarray, metrics: QualityMetrics) -> np.ndarray:
        """CLAHE on the L channel to balance exposure/contrast."""
        lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB)
        l, a, b = cv2.split(lab)
        clip = 2.0 if metrics.contrast < 0.3 else 1.5
        clahe = cv2.createCLAHE(clipLimit=clip, tileGridSize=(8, 8))
        l2 = clahe.apply(l)
        return cv2.cvtColor(cv2.merge((l2, a, b)), cv2.COLOR_LAB2RGB)

    def _reduce_noise(self, image: np.ndarray, metrics: QualityMetrics) -> np.ndarray:
        if metrics.noise < 0.05:
            return image
        return cv2.fastNlMeansDenoisingColored(image, None, 5, 5, 7, 21)

    def optimize(self, image: np.ndarray,
                 aggressive: bool = False) -> tuple[np.ndarray, QualityMetrics]:
        """Apply targeted corrections and return (optimized, metrics)."""
        metrics = self.measure(image)
        out = image

        # White balance first (color casts affect later steps).
        if metrics.white_balance > 0.03 or aggressive:
            out = self._correct_white_balance(out)

        # Exposure/contrast.
        if metrics.exposure < 0.35 or metrics.exposure > 0.7 or metrics.contrast < 0.3 or aggressive:
            out = self._correct_exposure_contrast(out, metrics)

        # Noise reduction last so it doesn't smear corrections.
        out = self._reduce_noise(out, metrics)

        return out, metrics
