"""Conservative scanner-scratch detection and inpainting pipeline."""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from app.core.config import settings
from app.models.schemas import DescratchStrength


@dataclass
class ScratchCandidate:
    contour: np.ndarray
    bbox: tuple[int, int, int, int]
    length: float
    width: float
    aspect_ratio: float
    directionality: float
    intensity_difference: float


@dataclass
class DescratchResult:
    image: np.ndarray | None
    metadata: dict[str, object]
    warnings: list[str]
    success: bool


class DescratchService:
    """Detects likely scanner artifacts and removes them with bounded inpainting."""

    STRENGTH_CONFIG = {
        DescratchStrength.LOW.value: {"threshold": 22, "min_aspect": 9.0, "dilate": 1, "radius": 2},
        DescratchStrength.MEDIUM.value: {"threshold": 18, "min_aspect": 7.0, "dilate": 2, "radius": 3},
        DescratchStrength.HIGH.value: {"threshold": 14, "min_aspect": 5.5, "dilate": 3, "radius": 4},
    }

    def detect_scratch_candidates(self, image: np.ndarray, strength: str) -> list[ScratchCandidate]:
        config = self.STRENGTH_CONFIG[strength]
        lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB)
        luminance = lab[:, :, 0]
        gray = cv2.GaussianBlur(luminance, (3, 3), 0)
        sobel_x = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        sobel_y = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        grad_x = cv2.convertScaleAbs(np.abs(sobel_x))
        grad_y = cv2.convertScaleAbs(np.abs(sobel_y))

        kernel_vertical = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 19))
        kernel_horizontal = cv2.getStructuringElement(cv2.MORPH_RECT, (19, 3))
        tophat_v = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, kernel_vertical)
        blackhat_v = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, kernel_vertical)
        tophat_h = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, kernel_horizontal)
        blackhat_h = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, kernel_horizontal)

        combined = np.maximum.reduce([grad_x, grad_y, tophat_v, blackhat_v, tophat_h, blackhat_h])
        _, mask = cv2.threshold(combined, config["threshold"], 255, cv2.THRESH_BINARY)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8), iterations=1)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        candidates: list[ScratchCandidate] = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 12:
                continue
            x, y, w, h = cv2.boundingRect(contour)
            length = float(max(w, h))
            width = float(max(1, min(w, h)))
            aspect_ratio = length / width
            if aspect_ratio < config["min_aspect"] or width > max(10, image.shape[1] * 0.03):
                continue
            roi = gray[y : y + h, x : x + w]
            surround = gray[max(0, y - 4) : min(gray.shape[0], y + h + 4), max(0, x - 4) : min(gray.shape[1], x + w + 4)]
            if roi.size == 0 or surround.size == 0:
                continue
            intensity_difference = float(abs(float(np.mean(roi)) - float(np.mean(surround))))
            if intensity_difference < 5:
                continue
            line = cv2.fitLine(contour, cv2.DIST_L2, 0, 0.01, 0.01)
            directionality = float(abs(line[0][0]) + abs(line[1][0]))
            if directionality < 1.0:
                continue
            if self._looks_like_structural_edge(gray, contour):
                continue
            candidates.append(
                ScratchCandidate(
                    contour=contour,
                    bbox=(x, y, w, h),
                    length=length,
                    width=width,
                    aspect_ratio=aspect_ratio,
                    directionality=directionality,
                    intensity_difference=intensity_difference,
                )
            )
        return candidates

    def build_scratch_mask(self, image: np.ndarray, candidates: list[ScratchCandidate], strength: str) -> np.ndarray:
        config = self.STRENGTH_CONFIG[strength]
        mask = np.zeros(image.shape[:2], dtype=np.uint8)
        for candidate in candidates:
            cv2.drawContours(mask, [candidate.contour], -1, 255, -1)
        if config["dilate"] > 0:
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            mask = cv2.dilate(mask, kernel, iterations=config["dilate"])
        return mask

    def validate_scratch_mask(self, image: np.ndarray, mask: np.ndarray) -> tuple[bool, float]:
        coverage_percent = float(np.mean(mask > 0) * 100.0)
        if coverage_percent == 0.0:
            return False, coverage_percent
        if coverage_percent > settings.DESCRATCH_MAX_MASK_PERCENT:
            return False, coverage_percent
        return True, coverage_percent

    def apply_descratch(self, image: np.ndarray, mask: np.ndarray, strength: str) -> np.ndarray:
        radius = self.STRENGTH_CONFIG[strength]["radius"]
        base = cv2.inpaint(image, mask, radius, cv2.INPAINT_TELEA)
        if strength == DescratchStrength.HIGH.value:
            ns = cv2.inpaint(image, mask, radius + 1, cv2.INPAINT_NS)
            return cv2.addWeighted(base, 0.75, ns, 0.25, 0)
        return base

    def process(self, image: np.ndarray, strength: str) -> DescratchResult:
        if strength == DescratchStrength.OFF.value:
            return DescratchResult(
                image=None,
                metadata={"descratch_enabled": False},
                warnings=[],
                success=False,
            )
        candidates = self.detect_scratch_candidates(image, strength)
        mask = self.build_scratch_mask(image, candidates, strength)
        accepted = [candidate for candidate in candidates if candidate.length >= 20]
        valid, coverage_percent = self.validate_scratch_mask(image, mask)
        metadata = {
            "descratch_enabled": True,
            "descratch_strength": strength,
            "algorithm": "morph-gradient-inpaint",
            "candidate_count": len(candidates),
            "accepted_candidate_count": len(accepted),
            "mask_coverage_percent": coverage_percent,
            "inpaint_radius": self.STRENGTH_CONFIG[strength]["radius"],
            "processing_version": settings.PROCESSING_VERSION,
        }
        if len(accepted) == 0:
            return DescratchResult(None, metadata, ["DESCRATCH_SKIPPED_LOW_CONFIDENCE"], False)
        if not valid:
            return DescratchResult(None, metadata, ["SCRATCH_MASK_REJECTED"], False)
        return DescratchResult(
            image=self.apply_descratch(image, mask, strength),
            metadata=metadata,
            warnings=[],
            success=True,
        )

    def _looks_like_structural_edge(self, gray: np.ndarray, contour: np.ndarray) -> bool:
        x, y, w, h = cv2.boundingRect(contour)
        region = gray[max(0, y - 2) : min(gray.shape[0], y + h + 2), max(0, x - 2) : min(gray.shape[1], x + w + 2)]
        if region.size == 0:
            return True
        edges = cv2.Canny(region, 80, 160)
        edge_density = float(np.mean(edges > 0))
        return edge_density > 0.32


descratch_service = DescratchService()
