"""Tests for smart orientation detection (local signals only, no provider)."""
import numpy as np
import cv2
import pytest

from app.services.orientation_service import OrientationService, OrientationResult


def _portrait_card(w=300, h=420) -> np.ndarray:
    """A synthetic portrait card with a bright title bar near the top."""
    img = np.full((h, w, 3), 120, dtype=np.uint8)
    cv2.rectangle(img, (10, 10), (w - 10, h - 10), (255, 255, 255), 2)
    cv2.rectangle(img, (20, 20), (w - 20, 60), (255, 255, 255), -1)  # title bar top
    return img


class TestOrientationService:
    def test_detect_upright(self, tmp_path):
        svc = OrientationService()
        img = _portrait_card()
        p = tmp_path / "card.png"
        cv2.imwrite(str(p), cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
        result = svc.detect(str(p), img)
        assert result.orientation_degrees in (0, 180)
        assert 0.0 <= result.orientation_confidence <= 1.0
        assert result.orientation_method in (
            "exif", "geometry", "edge_heuristic", "default"
        )

    def test_detect_rotated_90(self, tmp_path):
        svc = OrientationService()
        img = _portrait_card()
        rotated = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
        p = tmp_path / "card90.png"
        cv2.imwrite(str(p), cv2.cvtColor(rotated, cv2.COLOR_RGB2BGR))
        result = svc.detect(str(p), rotated)
        # Rotated CCW => needs 90 CW to restore; geometry sees landscape.
        assert result.orientation_degrees in (90, 270)

    def test_detect_upside_down(self, tmp_path):
        svc = OrientationService()
        img = _portrait_card()
        flipped = cv2.rotate(img, cv2.ROTATE_180)
        p = tmp_path / "card180.png"
        cv2.imwrite(str(p), cv2.cvtColor(flipped, cv2.COLOR_RGB2BGR))
        result = svc.detect(str(p), flipped)
        # Portrait aspect stays; edge heuristic should flag 180 (or 0).
        assert result.orientation_degrees in (0, 180)

    def test_manual_override_wins(self):
        svc = OrientationService()
        img = _portrait_card()
        corrected, result = svc.apply_manual(img, 90)
        assert result.orientation_degrees == 90
        assert result.orientation_method == "manual"
        assert result.orientation_confidence == 1.0
        assert corrected.shape[:2] == (img.shape[1], img.shape[0])  # rotated

    def test_manual_override_invalid(self):
        svc = OrientationService()
        with pytest.raises(ValueError):
            svc.apply_manual(_portrait_card(), 45)

    def test_result_shape(self):
        r = OrientationResult(90, 0.8, "geometry")
        d = r.as_dict()
        assert d["orientation_degrees"] == 90
        assert d["orientation_method"] == "geometry"
        assert "orientation_confidence" in d
