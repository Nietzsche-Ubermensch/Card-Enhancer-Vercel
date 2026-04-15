"""Unit tests for file utilities."""
from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pytest
from PIL import Image


def _make_zip(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, data in files.items():
            zf.writestr(name, data)
    return buf.getvalue()


def _png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (32, 32), color=(128, 64, 200)).save(buf, format="PNG")
    return buf.getvalue()


def test_safe_zip_extract_basic(tmp_path: Path):
    from app.utils.file_utils import safe_zip_extract
    z = _make_zip({"a.jpg": _png_bytes(), "b.png": _png_bytes()})
    extracted = safe_zip_extract(z, tmp_path / "out")
    assert len(extracted) == 2


def test_safe_zip_extract_skips_non_image(tmp_path: Path):
    from app.utils.file_utils import safe_zip_extract
    z = _make_zip({"doc.txt": b"hello", "img.png": _png_bytes()})
    extracted = safe_zip_extract(z, tmp_path / "out")
    assert len(extracted) == 1
    assert extracted[0].suffix == ".png"


def test_safe_zip_extract_path_traversal(tmp_path: Path):
    from app.utils.file_utils import safe_zip_extract
    z = _make_zip({"../../etc/passwd": b"root:x", "safe.png": _png_bytes()})
    extracted = safe_zip_extract(z, tmp_path / "out")
    # The traversal entry must be skipped
    assert all("etc" not in str(p) for p in extracted)


def test_format_bytes():
    from app.utils.file_utils import format_bytes
    assert format_bytes(0) == "0.0 B"
    assert format_bytes(1024) == "1.0 KB"
    assert format_bytes(1024 * 1024) == "1.0 MB"
    assert "GB" in format_bytes(1024 ** 3)
