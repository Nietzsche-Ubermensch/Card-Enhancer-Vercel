"""Real card detection, geometry extraction, rectification, and orientation helpers."""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np

from app.core.config import settings
from app.models.schemas import GeometryMethod, OrientationMethod


@dataclass
class DetectionCandidate:
    polygon: np.ndarray
    bbox: tuple[int, int, int, int]
    centroid: tuple[float, float]
    confidence: float
    detector_method: str


@dataclass
class GeometryResult:
    corners: np.ndarray
    geometry_method: str
    geometry_confidence: float
    warnings: list[str]


@dataclass
class OrientationResult:
    degrees: int
    confidence: float
    method: str


class CardDetector:
    """Detects one or more cards from a source image using contour geometry."""

    def detect_cards(self, image: np.ndarray) -> list[DetectionCandidate]:
        height, width = image.shape[:2]
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        adaptive = cv2.adaptiveThreshold(
            blurred,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            31,
            7,
        )
        edges = cv2.Canny(adaptive, 60, 180)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        min_area = (height * width) * 0.025
        detections: list[DetectionCandidate] = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < min_area:
                continue
            perimeter = cv2.arcLength(contour, True)
            if perimeter <= 0:
                continue
            hull = cv2.convexHull(contour)
            epsilon = max(3.0, 0.018 * cv2.arcLength(hull, True))
            polygon = cv2.approxPolyDP(hull, epsilon, True)
            x, y, w, h = cv2.boundingRect(hull)
            bbox_area = max(w * h, 1)
            fill_ratio = area / bbox_area
            aspect_ratio = w / max(h, 1)
            if aspect_ratio < 0.45 or aspect_ratio > 1.6:
                continue
            if fill_ratio < 0.55:
                continue
            centroid = self._contour_centroid(hull)
            confidence = min(0.99, 0.55 + min(fill_ratio, 0.95) * 0.25 + min(area / (height * width), 0.3))
            detections.append(
                DetectionCandidate(
                    polygon=polygon.reshape(-1, 2),
                    bbox=(x, y, w, h),
                    centroid=centroid,
                    confidence=confidence,
                    detector_method="contour_sheet_detector",
                )
            )

        if not detections:
            fallback = self._image_bounds_detection(image)
            if fallback is not None:
                detections = [fallback]

        return self.sort_detections(self.deduplicate_detections(detections))

    def deduplicate_detections(self, detections: list[DetectionCandidate]) -> list[DetectionCandidate]:
        kept: list[DetectionCandidate] = []
        for candidate in sorted(detections, key=lambda item: item.confidence, reverse=True):
            duplicate = False
            for existing in kept:
                if self._is_duplicate(existing, candidate):
                    duplicate = True
                    break
            if not duplicate:
                kept.append(candidate)
        return kept

    def sort_detections(self, detections: list[DetectionCandidate]) -> list[DetectionCandidate]:
        if not detections:
            return []
        median_height = np.median([d.bbox[3] for d in detections])
        row_threshold = max(20.0, median_height * 0.45)
        rows: list[list[DetectionCandidate]] = []
        for detection in sorted(detections, key=lambda item: item.centroid[1]):
            placed = False
            for row in rows:
                row_y = np.mean([item.centroid[1] for item in row])
                if abs(detection.centroid[1] - row_y) <= row_threshold:
                    row.append(detection)
                    placed = True
                    break
            if not placed:
                rows.append([detection])
        ordered: list[DetectionCandidate] = []
        for row in rows:
            ordered.extend(sorted(row, key=lambda item: item.centroid[0]))
        return ordered

    def polygon_to_contour(self, polygon: list[list[float]] | np.ndarray) -> np.ndarray:
        contour = np.asarray(polygon, dtype=np.float32).reshape(-1, 2)
        return contour

    def extract_quad(self, polygon: list[list[float]] | np.ndarray, image_shape: tuple[int, int, int]) -> GeometryResult:
        contour = self.polygon_to_contour(polygon)
        warnings: list[str] = []
        perimeter = cv2.arcLength(contour.astype(np.float32), True)
        approx = cv2.approxPolyDP(contour.astype(np.float32), max(3.0, 0.018 * perimeter), True).reshape(-1, 2)
        if len(approx) == 4:
            ordered = self.order_corners(approx)
            if self.validate_quad(ordered, image_shape):
                return GeometryResult(
                    corners=ordered,
                    geometry_method=GeometryMethod.POLYGON_QUAD.value,
                    geometry_confidence=0.94,
                    warnings=warnings,
                )
            warnings.append("DIRECT_QUAD_INVALID")
        warnings.append("USED_MIN_AREA_RECT_FALLBACK")
        return self.fallback_min_area_rect(contour, image_shape, warnings)

    def fallback_min_area_rect(
        self,
        contour: np.ndarray,
        image_shape: tuple[int, int, int],
        warnings: list[str] | None = None,
    ) -> GeometryResult:
        rect = cv2.minAreaRect(contour.astype(np.float32))
        box = cv2.boxPoints(rect)
        ordered = self.order_corners(box)
        geometry_warnings = list(warnings or [])
        if not self.validate_quad(ordered, image_shape):
            geometry_warnings.append("GEOMETRY_FAILED")
            raise ValueError("Card geometry could not be determined.")
        return GeometryResult(
            corners=ordered,
            geometry_method=GeometryMethod.MIN_AREA_RECT_FALLBACK.value,
            geometry_confidence=0.72,
            warnings=geometry_warnings,
        )

    def validate_quad(self, corners: np.ndarray, image_shape: tuple[int, int, int]) -> bool:
        if corners.shape != (4, 2):
            return False
        clipped = np.clip(corners, [0, 0], [image_shape[1] - 1, image_shape[0] - 1])
        if len(np.unique(np.round(clipped, 2), axis=0)) != 4:
            return False
        if not cv2.isContourConvex(clipped.astype(np.float32)):
            return False
        area = abs(cv2.contourArea(clipped.astype(np.float32)))
        if area <= 5000:
            return False
        side_lengths = [np.linalg.norm(clipped[i] - clipped[(i + 1) % 4]) for i in range(4)]
        if min(side_lengths) <= 20:
            return False
        intersection = self._segments_intersect(clipped[0], clipped[1], clipped[2], clipped[3])
        if intersection:
            return False
        opposite_ratio_1 = side_lengths[0] / max(side_lengths[2], 1e-6)
        opposite_ratio_2 = side_lengths[1] / max(side_lengths[3], 1e-6)
        return 0.45 <= opposite_ratio_1 <= 2.2 and 0.45 <= opposite_ratio_2 <= 2.2

    def order_corners(self, corners: np.ndarray) -> np.ndarray:
        points = np.asarray(corners, dtype=np.float32).reshape(4, 2)
        centroid = np.mean(points, axis=0)
        angles = np.arctan2(points[:, 1] - centroid[1], points[:, 0] - centroid[0])
        ordered = points[np.argsort(angles)]
        top_two = ordered[np.argsort(ordered[:, 1])[:2]]
        bottom_two = ordered[np.argsort(ordered[:, 1])[2:]]
        top_left, top_right = sorted(top_two, key=lambda point: point[0])
        bottom_left, bottom_right = sorted(bottom_two, key=lambda point: point[0])
        return np.array([top_left, top_right, bottom_right, bottom_left], dtype=np.float32)

    def rectify_card(self, image: np.ndarray, corners: np.ndarray) -> np.ndarray:
        tl, tr, br, bl = corners.astype(np.float32)
        width_top = np.linalg.norm(tr - tl)
        width_bottom = np.linalg.norm(br - bl)
        height_left = np.linalg.norm(bl - tl)
        height_right = np.linalg.norm(br - tr)
        max_width = int(max(width_top, width_bottom))
        max_height = int(max(height_left, height_right))
        if settings.RECTIFY_MODE == "STANDARD_5_7":
            max_width = max(max_width, 500)
            max_height = max(max_height, int(max_width * 3.5 / 2.5))
        destination = np.array(
            [
                [0, 0],
                [max_width - 1, 0],
                [max_width - 1, max_height - 1],
                [0, max_height - 1],
            ],
            dtype=np.float32,
        )
        matrix = cv2.getPerspectiveTransform(corners.astype(np.float32), destination)
        return cv2.warpPerspective(image, matrix, (max_width, max_height), flags=cv2.INTER_LANCZOS4)

    def detect_orientation(self, rectified_card: np.ndarray, exif_orientation: int | None = None) -> OrientationResult:
        if exif_orientation in {3, 6, 8}:
            mapping = {3: 180, 6: 90, 8: 270}
            return OrientationResult(mapping[exif_orientation], 0.82, OrientationMethod.EXIF.value)
        height, width = rectified_card.shape[:2]
        if width > height:
            return OrientationResult(90, 0.68, OrientationMethod.GEOMETRY.value)
        gray = cv2.cvtColor(rectified_card, cv2.COLOR_RGB2GRAY)
        top_band = gray[: max(20, height // 6), :]
        bottom_band = gray[-max(20, height // 6) :, :]
        top_detail = cv2.Laplacian(top_band, cv2.CV_64F).var()
        bottom_detail = cv2.Laplacian(bottom_band, cv2.CV_64F).var()
        if bottom_detail > top_detail * 1.2:
            return OrientationResult(0, 0.56, OrientationMethod.LAYOUT.value)
        if top_detail > bottom_detail * 1.2:
            return OrientationResult(180, 0.56, OrientationMethod.LAYOUT.value)
        return OrientationResult(0, 0.4, OrientationMethod.GEOMETRY.value)

    def apply_orientation(self, image: np.ndarray, degrees: int) -> np.ndarray:
        normalized = degrees % 360
        if normalized == 90:
            return cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
        if normalized == 180:
            return cv2.rotate(image, cv2.ROTATE_180)
        if normalized == 270:
            return cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)
        return image.copy()

    def apply_manual_orientation(self, image: np.ndarray, degrees: int) -> np.ndarray:
        return self.apply_orientation(image, degrees)

    def crop_original_source(self, image: np.ndarray, corners: np.ndarray) -> np.ndarray:
        x, y, w, h = cv2.boundingRect(corners.astype(np.float32))
        margin_x = int(w * settings.CARD_BORDER_MARGIN_RATIO)
        margin_y = int(h * settings.CARD_BORDER_MARGIN_RATIO)
        x1 = max(0, x - margin_x)
        y1 = max(0, y - margin_y)
        x2 = min(image.shape[1], x + w + margin_x)
        y2 = min(image.shape[0], y + h + margin_y)
        return image[y1:y2, x1:x2].copy()

    def _image_bounds_detection(self, image: np.ndarray) -> DetectionCandidate | None:
        height, width = image.shape[:2]
        aspect_ratio = width / max(height, 1)
        if not 0.55 <= aspect_ratio <= 0.82:
            return None
        margin = max(6, int(min(height, width) * settings.CARD_BORDER_MARGIN_RATIO))
        polygon = np.array(
            [
                [margin, margin],
                [width - margin, margin],
                [width - margin, height - margin],
                [margin, height - margin],
            ],
            dtype=np.float32,
        )
        return DetectionCandidate(
            polygon=polygon,
            bbox=(margin, margin, width - 2 * margin, height - 2 * margin),
            centroid=(width / 2.0, height / 2.0),
            confidence=0.58,
            detector_method=GeometryMethod.IMAGE_BOUNDS_FALLBACK.value.lower(),
        )

    def _contour_centroid(self, contour: np.ndarray) -> tuple[float, float]:
        moments = cv2.moments(contour)
        if moments["m00"] == 0:
            x, y, w, h = cv2.boundingRect(contour)
            return (x + w / 2.0, y + h / 2.0)
        return (moments["m10"] / moments["m00"], moments["m01"] / moments["m00"])

    def _is_duplicate(self, left: DetectionCandidate, right: DetectionCandidate) -> bool:
        iou = self._bbox_iou(left.bbox, right.bbox)
        left_center = np.array(left.centroid)
        right_center = np.array(right.centroid)
        centroid_distance = float(np.linalg.norm(left_center - right_center))
        diagonal = math.sqrt(max(left.bbox[2] * left.bbox[2] + left.bbox[3] * left.bbox[3], 1.0))
        containment = self._contains(left.bbox, right.bbox) or self._contains(right.bbox, left.bbox)
        return iou > 0.5 or containment or (centroid_distance < diagonal * 0.2 and iou > 0.2)

    def _bbox_iou(self, a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
        ax1, ay1, aw, ah = a
        bx1, by1, bw, bh = b
        ax2, ay2 = ax1 + aw, ay1 + ah
        bx2, by2 = bx1 + bw, by1 + bh
        inter_x1 = max(ax1, bx1)
        inter_y1 = max(ay1, by1)
        inter_x2 = min(ax2, bx2)
        inter_y2 = min(ay2, by2)
        if inter_x2 <= inter_x1 or inter_y2 <= inter_y1:
            return 0.0
        inter_area = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
        union = (aw * ah) + (bw * bh) - inter_area
        return inter_area / max(union, 1)

    def _contains(self, outer: tuple[int, int, int, int], inner: tuple[int, int, int, int]) -> bool:
        ox, oy, ow, oh = outer
        ix, iy, iw, ih = inner
        return ox <= ix and oy <= iy and (ox + ow) >= (ix + iw) and (oy + oh) >= (iy + ih)

    def _segments_intersect(self, a: np.ndarray, b: np.ndarray, c: np.ndarray, d: np.ndarray) -> bool:
        def ccw(p1: np.ndarray, p2: np.ndarray, p3: np.ndarray) -> bool:
            return (p3[1] - p1[1]) * (p2[0] - p1[0]) > (p2[1] - p1[1]) * (p3[0] - p1[0])

        return ccw(a, c, d) != ccw(b, c, d) and ccw(a, b, c) != ccw(a, b, d)


card_detector = CardDetector()
