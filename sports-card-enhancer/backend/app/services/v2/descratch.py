"""Conservative scanner-artifact descratching.

Targets SCANNER-INTRODUCED defects (thin streaks, dust lines, glass marks),
not physical card damage. Every stage is guarded: if the proposed scratch
mask covers too much of the card, restoration is refused and the input is
preserved with a warning.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

import cv2
import numpy as np

from app.services.v2.models import DescratchLevel

logger = logging.getLogger(__name__)

DESCRATCH_ALGORITHM = "directional_morphology+telea_inpaint"

# Explicit per-level parameters — the UI exposes only OFF/LOW/MEDIUM/HIGH.
LEVEL_PARAMS: Dict[DescratchLevel, Dict] = {
    DescratchLevel.OFF: {},
    DescratchLevel.LOW: {
        "line_len": 25, "grad_thresh": 60, "max_aspect": 0.08,
        "min_len_px": 30, "inpaint_radius": 2, "max_coverage": 0.03,
    },
    DescratchLevel.MEDIUM: {
        "line_len": 17, "grad_thresh": 45, "max_aspect": 0.12,
        "min_len_px": 20, "inpaint_radius": 3, "max_coverage": 0.06,
    },
    DescratchLevel.HIGH: {
        "line_len": 11, "grad_thresh": 32, "max_aspect": 0.18,
        "min_len_px": 12, "inpaint_radius": 4, "max_coverage": 0.10,
    },
}

# Absolute safety ceiling regardless of level.
HARD_MAX_COVERAGE = 0.15
BORDER_EXCLUDE_FRACTION = 0.04


@dataclass
class ScratchMaskResult:
    mask: np.ndarray
    coverage_percentage: float
    artifact_count: int
    confidence: float
    warnings: List[str] = field(default_factory=list)


def detect_scanner_artifacts(gray: np.ndarray, params: Dict) -> np.ndarray:
    """Candidate thin-line artifacts via directional top-hat morphology."""
    line_len = params["line_len"]
    vert_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, line_len))
    horiz_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (line_len, 1))

    # Black-hat catches dark lines; top-hat catches bright dust streaks.
    candidates = np.zeros_like(gray)
    for kernel in (vert_kernel, horiz_kernel):
        blackhat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, kernel)
        tophat = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, kernel)
        candidates = cv2.bitwise_or(candidates, blackhat)
        candidates = cv2.bitwise_or(candidates, tophat)

    _, mask = cv2.threshold(
        candidates, params["grad_thresh"], 255, cv2.THRESH_BINARY)

    # Gradient evidence: real scratches have sharp local gradients.
    gx = cv2.Scharr(gray, cv2.CV_32F, 1, 0)
    gy = cv2.Scharr(gray, cv2.CV_32F, 0, 1)
    grad = cv2.convertScaleAbs(cv2.magnitude(gx, gy))
    _, grad_mask = cv2.threshold(grad, params["grad_thresh"], 255, cv2.THRESH_BINARY)
    return cv2.bitwise_and(mask, grad_mask)


def _filter_components(mask: np.ndarray, params: Dict,
                       img_shape: Tuple[int, int]) -> Tuple[np.ndarray, int]:
    """Keep only thin, elongated components away from the card border.

    This is what protects card artwork (frames, letter strokes, player
    edges): artwork lines are either thick, short, or border-adjacent.
    """
    h, w = img_shape
    kept = np.zeros_like(mask)
    count = 0
    margin_x = int(w * BORDER_EXCLUDE_FRACTION)
    margin_y = int(h * BORDER_EXCLUDE_FRACTION)

    num, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    for i in range(1, num):
        x, y, cw, ch, area = stats[i]
        if area < params["min_len_px"]:
            continue
        long_side, short_side = max(cw, ch), max(1, min(cw, ch))
        thinness = short_side / long_side
        if thinness > params["max_aspect"]:
            continue                      # too fat — artwork, not a scratch
        if long_side < params["min_len_px"]:
            continue                      # too short — noise
        cx, cy = x + cw // 2, y + ch // 2
        if cx < margin_x or cx > w - margin_x or cy < margin_y or cy > h - margin_y:
            continue                      # card border zone — leave it alone
        kept[labels == i] = 255
        count += 1
    return kept, count


def build_scratch_mask(card_image: np.ndarray,
                       level: DescratchLevel = DescratchLevel.MEDIUM
                       ) -> ScratchMaskResult:
    """Build and characterize the proposed restoration mask."""
    params = LEVEL_PARAMS[level]
    if not params:
        empty = np.zeros(card_image.shape[:2], dtype=np.uint8)
        return ScratchMaskResult(empty, 0.0, 0, 1.0, ["descratch level OFF"])

    gray = cv2.cvtColor(card_image, cv2.COLOR_RGB2GRAY) \
        if card_image.ndim == 3 else card_image
    raw = detect_scanner_artifacts(gray, params)
    mask, count = _filter_components(raw, params, gray.shape)

    # Slight dilation so inpainting covers the full scratch width.
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=1)

    coverage = float(np.count_nonzero(mask)) / float(mask.size)
    warnings: List[str] = []
    if coverage > params["max_coverage"]:
        warnings.append(
            f"proposed mask covers {coverage:.1%} of the card "
            f"(limit {params['max_coverage']:.0%}) — possible artwork damage risk")
    confidence = float(max(0.0, min(1.0, 1.0 - coverage / HARD_MAX_COVERAGE)))
    return ScratchMaskResult(mask, round(coverage * 100, 3), count,
                             round(confidence, 3), warnings)


def validate_scratch_mask(mask_result: ScratchMaskResult,
                          level: DescratchLevel) -> Tuple[bool, List[str]]:
    """Guard rail: refuse destructively large masks, preserve the input."""
    params = LEVEL_PARAMS.get(level) or LEVEL_PARAMS[DescratchLevel.MEDIUM]
    coverage = mask_result.coverage_percentage / 100.0
    if coverage > HARD_MAX_COVERAGE or coverage > params["max_coverage"]:
        return False, mask_result.warnings + [
            f"mask coverage {mask_result.coverage_percentage}% exceeds safe "
            f"threshold; restoration refused and original preserved"]
    return True, mask_result.warnings


def descratch_card(card_image: np.ndarray,
                   level: DescratchLevel = DescratchLevel.MEDIUM
                   ) -> Tuple[np.ndarray, Dict]:
    """Restore scanner artifacts from a card image. Conservative by design.

    Returns (result_image, metadata). On OFF or on mask-validation refusal the
    input is returned unchanged, with metadata explaining why.
    """
    if level == DescratchLevel.OFF:
        return card_image.copy(), {
            "descratch_level": level.value, "descratch_algorithm": "none",
            "mask_coverage": 0.0, "applied": False, "warnings": ["descratch off"],
        }

    mask_result = build_scratch_mask(card_image, level)
    ok, warnings = validate_scratch_mask(mask_result, level)
    meta = {
        "descratch_level": level.value,
        "descratch_algorithm": DESCRATCH_ALGORITHM,
        "mask_coverage": mask_result.coverage_percentage,
        "artifact_count": mask_result.artifact_count,
        "mask_confidence": mask_result.confidence,
        "applied": False,
        "warnings": warnings,
    }
    if not ok:
        logger.warning("Descratch refused: %s", warnings)
        return card_image.copy(), meta
    if mask_result.artifact_count == 0:
        meta["warnings"] = warnings + ["no scanner artifacts detected"]
        return card_image.copy(), meta

    radius = LEVEL_PARAMS[level]["inpaint_radius"]
    bgr = cv2.cvtColor(card_image, cv2.COLOR_RGB2BGR)
    restored = cv2.inpaint(bgr, mask_result.mask, radius, cv2.INPAINT_TELEA)
    result = cv2.cvtColor(restored, cv2.COLOR_BGR2RGB)
    meta["applied"] = True
    return result, meta
