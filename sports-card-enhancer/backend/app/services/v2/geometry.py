"""Card detection on single scans and multi-card scanner sheets + rectification."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Physical trading-card aspect ratio (w/h portrait). Detection accepts a
# generous band around it in either orientation.
CARD_ASPECT = 2.5 / 3.5
MIN_AREA_FRACTION = 0.01    # a card must cover at least 1% of the sheet
MAX_AREA_FRACTION = 0.98    # ... and not be the whole sheet (multi-card mode)
ASPECT_MIN = 0.40
ASPECT_MAX = 1.80


@dataclass
class CardDetection:
    """One detected card instance on a source image."""
    polygon: List[List[float]]   # 4 ordered corners [tl, tr, br, bl]
    bbox: Tuple[int, int, int, int]
    centroid: Tuple[float, float]
    confidence: float
    detector_method: str
    warnings: List[str] = field(default_factory=list)


def _order_quad(pts: np.ndarray) -> np.ndarray:
    """Deterministic corner order: [top-left, top-right, bottom-right, bottom-left]."""
    pts = pts.reshape(4, 2).astype(np.float32)
    rect = np.zeros((4, 2), dtype=np.float32)
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1).ravel()
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def estimate_card_corners(contour: np.ndarray) -> np.ndarray:
    """Quadrilateral estimation: polygon approx, min-area-rect fallback."""
    peri = cv2.arcLength(contour, True)
    for eps in (0.02, 0.03, 0.05):
        approx = cv2.approxPolyDP(contour, eps * peri, True)
        if len(approx) == 4:
            return _order_quad(approx)
    rect = cv2.minAreaRect(contour)
    return _order_quad(cv2.boxPoints(rect))


def validate_card_geometry(quad: np.ndarray, img_shape: Tuple[int, int]) -> List[str]:
    """Sanity checks on a detected quadrilateral; returns warnings."""
    warnings: List[str] = []
    h, w = img_shape
    if quad.shape != (4, 2):
        return ["degenerate polygon"]
    if np.any(quad < -0.05 * max(h, w)) or np.any(quad[:, 0] > w * 1.05) \
            or np.any(quad[:, 1] > h * 1.05):
        warnings.append("polygon extends beyond image bounds")
    area = cv2.contourArea(quad.astype(np.float32))
    if area < MIN_AREA_FRACTION * h * w:
        warnings.append("detected region suspiciously small")
    side_lengths = [
        np.linalg.norm(quad[(i + 1) % 4] - quad[i]) for i in range(4)
    ]
    if min(side_lengths) < 8:
        warnings.append("degenerate edge in detected quadrilateral")
    return warnings


def detect_cards(image: np.ndarray) -> List[CardDetection]:
    """Detect every card on a source image (single scan or scanner sheet).

    Uses edge + adaptive-threshold evidence, extracts external contours,
    filters by area and plausible card aspect, then returns detections in
    stable reading order: top-to-bottom, then left-to-right.
    """
    h, w = image.shape[:2]
    img_area = float(h * w)
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY) if image.ndim == 3 else image

    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 40, 120)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)

    # Fuse edge evidence with adaptive threshold so dark-bordered and
    # light-bordered cards both segment on a scanner bed.
    adapt = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 51, 7)
    combined = cv2.bitwise_or(closed, cv2.bitwise_not(adapt))
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel, iterations=1)

    contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    detections: List[CardDetection] = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < MIN_AREA_FRACTION * img_area:
            continue
        if area > MAX_AREA_FRACTION * img_area and len(contours) > 1:
            continue  # sheet-spanning blob, not a card
        x, y, bw, bh = cv2.boundingRect(contour)
        if bw < 20 or bh < 20:
            continue
        aspect = bw / float(bh)
        if not (ASPECT_MIN <= aspect <= ASPECT_MAX):
            continue
        quad = estimate_card_corners(contour)
        qw = np.linalg.norm(quad[1] - quad[0])
        qh = np.linalg.norm(quad[3] - quad[0])
        quad_aspect = min(qw, qh) / max(qw, qh, 1e-6)
        # Prefer quads close to real card geometry, but don't hard-reject.
        geom_conf = 1.0 - min(1.0, abs(quad_aspect - CARD_ASPECT) / CARD_ASPECT)
        area_conf = min(1.0, area / (0.5 * img_area))
        confidence = float(round(min(0.98, 0.35 + 0.45 * geom_conf + 0.20 * area_conf), 3))
        detections.append(CardDetection(
            polygon=quad.tolist(),
            bbox=(int(x), int(y), int(bw), int(bh)),
            centroid=(float(x + bw / 2), float(y + bh / 2)),
            confidence=confidence,
            detector_method="opencv_contour_quad",
            warnings=validate_card_geometry(quad, (h, w)),
        ))

    if not detections:
        # No segmentable cards: treat the whole image as one card.
        quad = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]],
                        dtype=np.float32)
        return [CardDetection(
            polygon=quad.tolist(), bbox=(0, 0, w, h),
            centroid=(w / 2.0, h / 2.0), confidence=0.3,
            detector_method="whole_image_fallback",
            warnings=["no distinct card region detected; using full image"],
        )]

    return _stable_order(detections)


def _stable_order(detections: List[CardDetection]) -> List[CardDetection]:
    """Reading order: top-to-bottom rows, left-to-right within a row."""
    if len(detections) <= 1:
        return detections
    heights = [d.bbox[3] for d in detections]
    row_tol = max(24, int(np.median(heights) * 0.6))
    by_y = sorted(detections, key=lambda d: d.centroid[1])
    rows: List[List[CardDetection]] = []
    for det in by_y:
        for row in rows:
            if abs(np.mean([r.centroid[1] for r in row]) - det.centroid[1]) <= row_tol:
                row.append(det)
                break
        else:
            rows.append([det])
    ordered: List[CardDetection] = []
    for row in rows:
        ordered.extend(sorted(row, key=lambda d: d.centroid[0]))
    return ordered


def extract_card_polygon(image: np.ndarray, detection: CardDetection) -> np.ndarray:
    """Return the detection polygon as a float32 (4, 2) array."""
    return np.asarray(detection.polygon, dtype=np.float32)


def rectify_card(image: np.ndarray, polygon: np.ndarray) -> Tuple[np.ndarray, float]:
    """Perspective-correct a card to an upright, portrait rectangle.

    Preserves the physical card border by warping the detected quadrilateral
    itself (never a plain bounding-box crop).
    """
    quad = _order_quad(polygon)
    (tl, tr, br, bl) = quad
    width = int(round(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl))))
    height = int(round(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr))))
    width, height = max(width, 8), max(height, 8)

    rotated = False
    if width > height:  # keep cards portrait
        width, height = height, width
        rotated = True

    dst = np.array(
        [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]],
        dtype=np.float32)
    src = quad if not rotated else np.roll(quad, 1, axis=0)
    matrix = cv2.getPerspectiveTransform(src, dst)
    rectified = cv2.warpPerspective(image, matrix, (width, height))

    # Geometry confidence: how close the quad already was to a clean rectangle.
    card_area = cv2.contourArea(quad)
    hull_area = cv2.contourArea(cv2.convexHull(quad)) or 1.0
    rectangularity = float(card_area / hull_area)
    confidence = float(round(min(0.99, 0.5 + 0.5 * rectangularity), 3))
    return rectified, confidence
