"""Bulk export service: selected / all-completed, PNG/JPEG/ZIP + manifest.

Produces a ZIP shaped like:

    CardEnhance_Export/
      images/            # processed images (safe filenames)
      manifest.json      # per-card export metadata

Filenames are sanitized and OCR/user-derived text is never allowed to create
path traversal or invalid paths.
"""
from __future__ import annotations

import json
import logging
import os
import re
import unicodedata
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# Characters that are unsafe in filenames / could enable path traversal.
_UNSAFE_CHARS = re.compile(r"[^\w.\- ]+", re.UNICODE)
_RESERVED = {"", ".", ".."}


def sanitize_filename(name: str, default: str = "card") -> str:
    """Return a filesystem-safe filename.

    - Normalizes unicode, strips path separators and traversal.
    - Collapses whitespace to underscores.
    - Keeps alphanumerics, dot, dash, underscore.
    - Never returns a reserved/empty name.
    """
    if not name:
        return default
    # Normalize and drop any directory components.
    name = unicodedata.normalize("NFKD", str(name))
    name = name.replace("\\", "/").split("/")[-1]      # strip any path
    name = name.replace("\x00", "")                     # strip NULs
    name = _UNSAFE_CHARS.sub("_", name)
    name = name.strip().strip(".")                      # no leading/trailing dots
    name = re.sub(r"\s+", "_", name)
    name = re.sub(r"_+", "_", name)
    if name in _RESERVED or not name:
        return default
    # Guard against residual traversal.
    while ".." in name:
        name = name.replace("..", "_")
    return name[:200]  # bound length


def _unique_name(name: str, used: set) -> str:
    """Ensure uniqueness within an export set by appending a counter."""
    base, ext = os.path.splitext(name)
    candidate = name
    i = 1
    while candidate.lower() in used:
        candidate = f"{base}_{i}{ext}"
        i += 1
    used.add(candidate.lower())
    return candidate


class ExportService:
    """Builds export bundles (single files or ZIP archives) with manifests."""

    EXPORT_ROOT = "CardEnhance_Export"

    def build_manifest_entry(
        self,
        source_filename: str,
        output_filename: str,
        *,
        orientation: Optional[dict] = None,
        crop_confidence: Optional[float] = None,
        dimensions: Optional[dict] = None,
        processing_status: str = "completed",
        warnings: Optional[List[str]] = None,
    ) -> Dict:
        """Create a single manifest entry."""
        return {
            "source_filename": source_filename,
            "output_filename": output_filename,
            "orientation": orientation,
            "crop_confidence": crop_confidence,
            "dimensions": dimensions,
            "processing_status": processing_status,
            "warnings": warnings or [],
        }

    def create_export_zip(
        self,
        items: List[Dict],
        zip_path: str,
        job_id: Optional[str] = None,
    ) -> Dict:
        """Create a ZIP export containing images and a manifest.

        Args:
            items: List of dicts, each with:
                - output_path: path to the processed image on disk
                - source_filename: original uploaded filename
                - orientation, crop_confidence, dimensions, warnings (optional)
                - processing_status (default "completed")
            zip_path: Destination path for the ZIP file.
            job_id: Optional job identifier recorded in the manifest.

        Returns:
            A dict with zip path, file count, total bytes, and the manifest.
        """
        zip_path = str(zip_path)
        Path(zip_path).parent.mkdir(parents=True, exist_ok=True)

        manifest: Dict = {
            "export_root": self.EXPORT_ROOT,
            "created_at": datetime.now().isoformat(),
            "job_id": job_id,
            "image_count": 0,
            "images": [],
        }

        used_names: set = set()
        total_bytes = 0
        file_count = 0

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for item in items:
                output_path = item.get("output_path")
                if not output_path or not os.path.exists(output_path):
                    continue

                safe_out = _unique_name(
                    sanitize_filename(os.path.basename(output_path)), used_names
                )
                arcname = f"{self.EXPORT_ROOT}/images/{safe_out}"
                zipf.write(output_path, arcname)
                total_bytes += os.path.getsize(output_path)
                file_count += 1

                manifest["images"].append(self.build_manifest_entry(
                    source_filename=sanitize_filename(
                        item.get("source_filename", safe_out), default=safe_out
                    ),
                    output_filename=safe_out,
                    orientation=item.get("orientation"),
                    crop_confidence=item.get("crop_confidence"),
                    dimensions=item.get("dimensions"),
                    processing_status=item.get("processing_status", "completed"),
                    warnings=item.get("warnings", []),
                ))

            manifest["image_count"] = file_count

            # Write the manifest inside the ZIP.
            manifest_bytes = json.dumps(manifest, indent=2).encode("utf-8")
            zipf.writestr(f"{self.EXPORT_ROOT}/manifest.json", manifest_bytes)

        logger.info("Created export ZIP %s (%d images)", zip_path, file_count)
        return {
            "zip_path": zip_path,
            "file_count": file_count,
            "total_size_bytes": total_bytes,
            "manifest": manifest,
        }


# Global export service instance.
export_service = ExportService()
