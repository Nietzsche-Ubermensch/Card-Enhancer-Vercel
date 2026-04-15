from __future__ import annotations

import io
import shutil
import zipfile
from pathlib import Path
from typing import List

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}


def safe_zip_extract(
    zip_bytes: bytes,
    extract_dir: Path,
    max_files: int = 3000,
    max_unpacked: int = 5 * 1024 * 1024 * 1024,
) -> List[Path]:
    extract_dir.mkdir(parents=True, exist_ok=True)
    extracted: List[Path] = []
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        total_bytes = 0
        count = 0
        for member in zf.infolist():
            target = (extract_dir / member.filename).resolve()
            if not str(target).startswith(str(extract_dir.resolve())):
                continue
            if Path(member.filename).suffix.lower() not in ALLOWED_EXTENSIONS:
                continue
            count += 1
            if count > max_files:
                break
            total_bytes += member.file_size
            if total_bytes > max_unpacked:
                break
            zf.extract(member, extract_dir)
            extracted.append(target)
    return extracted


def cleanup_directory(path: Path) -> None:
    if path.is_dir():
        shutil.rmtree(path, ignore_errors=True)


def format_bytes(b: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if b < 1024:
            return f"{b:.1f} {unit}"
        b /= 1024
    return f"{b:.1f} TB"
