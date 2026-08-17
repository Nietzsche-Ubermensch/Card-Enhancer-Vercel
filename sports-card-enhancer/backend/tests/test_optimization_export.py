"""Tests for optimization metrics and the export service."""
import json
import os
import zipfile

import numpy as np
import cv2

from app.services.optimization_service import OptimizationService
from app.services.export_service import (
    ExportService, sanitize_filename
)


def _card(w=300, h=420) -> np.ndarray:
    img = np.random.randint(60, 200, (h, w, 3), dtype=np.uint8)
    cv2.rectangle(img, (10, 10), (w - 10, h - 10), (255, 255, 255), 2)
    return img


class TestOptimizationService:
    def test_measure_returns_all_metrics(self):
        svc = OptimizationService()
        m = svc.measure(_card())
        d = m.as_dict()
        for key in ("blur", "exposure", "contrast", "white_balance",
                    "glare", "shadow", "noise", "perspective", "resolution"):
            assert key in d
        assert d["resolution"] == 300 * 420

    def test_optimize_produces_output(self):
        svc = OptimizationService()
        img = _card()
        out, metrics = svc.optimize(img)
        assert out.shape == img.shape
        assert out.dtype == np.uint8

    def test_optimize_blurry_image(self):
        svc = OptimizationService()
        img = cv2.GaussianBlur(_card(), (15, 15), 0)
        out, metrics = svc.optimize(img, aggressive=True)
        assert out.shape == img.shape


class TestFilenameSanitization:
    def test_path_traversal_removed(self):
        assert sanitize_filename("../../etc/passwd") == "passwd"
        assert sanitize_filename("..\\..\\win\\system32") == "system32"

    def test_invalid_chars_replaced(self):
        out = sanitize_filename('my card<>:"/\\|?*.png')
        assert "<" not in out and ">" not in out and ":" not in out
        assert "/" not in out and "\\" not in out

    def test_empty_and_reserved(self):
        assert sanitize_filename("") == "card"
        assert sanitize_filename("..") == "card"
        assert sanitize_filename("   ") == "card"

    def test_normal_name_preserved(self):
        assert sanitize_filename("pikachu_base_1st.png") == "pikachu_base_1st.png"

    def test_unicode_normalized(self):
        out = sanitize_filename("café_card.png")
        assert out.endswith(".png")
        assert "/" not in out


class TestExportService:
    def _make_items(self, tmp_path, n=3):
        items = []
        for i in range(n):
            p = tmp_path / f"card_{i}_optimized.png"
            cv2.imwrite(str(p), cv2.cvtColor(_card(60, 80), cv2.COLOR_RGB2BGR))
            items.append({
                "output_path": str(p),
                "source_filename": f"card {i}.png",
                "orientation": {"orientation_degrees": 0,
                                "orientation_confidence": 0.9,
                                "orientation_method": "exif"},
                "crop_confidence": 0.85,
                "dimensions": {"width": 60, "height": 80},
                "processing_status": "completed",
                "warnings": [],
            })
        return items

    def test_zip_structure_and_manifest(self, tmp_path):
        svc = ExportService()
        items = self._make_items(tmp_path)
        zip_path = tmp_path / "export.zip"
        result = svc.create_export_zip(items, str(zip_path), job_id="job123")

        assert result["file_count"] == 3
        assert os.path.exists(zip_path)

        with zipfile.ZipFile(zip_path) as zf:
            names = zf.namelist()
            # Manifest present
            assert "CardEnhance_Export/manifest.json" in names
            # Images under images/
            imgs = [n for n in names if n.startswith("CardEnhance_Export/images/")]
            assert len(imgs) == 3
            # Manifest parses and has required fields
            manifest = json.loads(zf.read("CardEnhance_Export/manifest.json"))
            assert manifest["image_count"] == 3
            assert manifest["job_id"] == "job123"
            entry = manifest["images"][0]
            for key in ("source_filename", "output_filename", "orientation",
                        "crop_confidence", "dimensions", "processing_status",
                        "warnings"):
                assert key in entry

    def test_zip_sanitizes_filenames(self, tmp_path):
        svc = ExportService()
        # Create a file with an evil-ish name to ensure arcname is safe.
        p = tmp_path / "evil.png"
        cv2.imwrite(str(p), cv2.cvtColor(_card(40, 50), cv2.COLOR_RGB2BGR))
        items = [{
            "output_path": str(p),
            "source_filename": "../../evil.png",
            "processing_status": "completed",
        }]
        zip_path = tmp_path / "export2.zip"
        svc.create_export_zip(items, str(zip_path))
        with zipfile.ZipFile(zip_path) as zf:
            for name in zf.namelist():
                assert ".." not in name
                assert not name.startswith("/")

    def test_missing_files_skipped(self, tmp_path):
        svc = ExportService()
        items = [{"output_path": str(tmp_path / "nope.png"),
                  "source_filename": "nope.png"}]
        zip_path = tmp_path / "export3.zip"
        result = svc.create_export_zip(items, str(zip_path))
        assert result["file_count"] == 0
