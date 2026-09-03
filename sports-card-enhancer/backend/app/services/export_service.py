"""Artifact export and manifest generation."""
from __future__ import annotations

import json
import re
import shutil
import uuid
import zipfile
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException

from app.core.config import settings
from app.models.schemas import ArtifactType, ExportCardEntry, ExportManifest, ExportRecord, ExportScope
from app.services.state_store import state_store

SAFE_NAME = re.compile(r"[^a-zA-Z0-9._-]+")


class ExportService:
    """Creates individual and bulk exports with manifest metadata."""

    def sanitize_export_filename(self, value: str) -> str:
        return SAFE_NAME.sub("_", value).strip("._") or "card"

    async def export_single_card(self, batch_id: str, card_id: str, artifact_type: ArtifactType, fmt: str, quality: int | None) -> ExportRecord:
        return await self.create_bulk_export(
            batch_id=batch_id,
            scope=ExportScope.CURRENT_CARD,
            artifact_type=artifact_type,
            fmt=fmt,
            quality=quality,
            card_ids=[card_id],
        )

    async def create_export_manifest(self, card_ids: list[str], artifact_type: ArtifactType, fmt: str) -> ExportManifest:
        entries: list[ExportCardEntry] = []
        for card_id in card_ids:
            card = await state_store.get_card(card_id)
            if card is None:
                continue
            source = await state_store.get_source(card.source_id)
            artifact_id = self._artifact_id_for_type(card, artifact_type)
            artifact = await state_store.get_artifact(artifact_id) if artifact_id else None
            if source is None or artifact is None:
                continue
            processing = artifact.processing_parameters
            entries.append(
                ExportCardEntry(
                    card_id=card.card_id,
                    source_id=card.source_id,
                    source_filename=source.original_filename,
                    source_index=card.source_index,
                    output_filename=self._output_filename(card.source_index, card.display_index, artifact_type, fmt),
                    artifact_type=artifact_type.value.lower(),
                    width=artifact.width,
                    height=artifact.height,
                    orientation=card.orientation_degrees,
                    detection_confidence=card.detection_confidence,
                    geometry_confidence=card.geometry_confidence,
                    upscale=processing if artifact_type == ArtifactType.UPSCALED else processing.get("upscale") if artifact_type == ArtifactType.DESCRATCHED_UPSCALED else None,
                    descratch=processing if artifact_type == ArtifactType.DESCRATCHED else {
                        key: value for key, value in processing.items() if key != "upscale"
                    } if artifact_type == ArtifactType.DESCRATCHED_UPSCALED else None,
                    warnings=card.warnings,
                )
            )
        return ExportManifest(
            export_id=str(uuid.uuid4()),
            created_at=datetime.utcnow(),
            artifact_selection=artifact_type.value.lower(),
            format=fmt,
            card_count=len(entries),
            cards=entries,
        )

    async def create_export_zip(self, export_dir: Path, manifest: ExportManifest, artifact_type: ArtifactType, fmt: str) -> Path:
        package_root = export_dir / f"CardEnhance_Export_{manifest.created_at.strftime('%Y%m%d_%H%M%S')}"
        images_dir = package_root / "images"
        images_dir.mkdir(parents=True, exist_ok=True)
        for entry in manifest.cards:
            card = await state_store.get_card(entry.card_id)
            artifact_id = self._artifact_id_for_type(card, artifact_type) if card else None
            artifact = await state_store.get_artifact(artifact_id) if artifact_id else None
            if artifact is None:
                continue
            source_path = settings.STORAGE_DIR / artifact.relative_path
            target_path = images_dir / entry.output_filename
            shutil.copy2(source_path, target_path)
        manifest_path = package_root / "manifest.json"
        manifest_path.write_text(json.dumps(manifest.model_dump(mode="json"), indent=2))
        zip_path = export_dir / f"CardEnhance_Export_{manifest.created_at.strftime('%Y%m%d_%H%M%S')}.zip"
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for file_path in package_root.rglob("*"):
                if file_path.is_file():
                    archive.write(file_path, file_path.relative_to(export_dir))
        return zip_path

    async def create_bulk_export(
        self,
        batch_id: str,
        scope: ExportScope,
        artifact_type: ArtifactType,
        fmt: str,
        quality: int | None,
        card_ids: list[str],
    ) -> ExportRecord:
        if not card_ids:
            raise HTTPException(status_code=400, detail="No cards available for export.")
        manifest = await self.create_export_manifest(card_ids, artifact_type, fmt)
        export_id = manifest.export_id
        export_dir = settings.exports_root / export_id
        export_dir.mkdir(parents=True, exist_ok=True)
        if manifest.card_count == 1:
            entry = manifest.cards[0]
            card = await state_store.get_card(entry.card_id)
            artifact_id = self._artifact_id_for_type(card, artifact_type) if card else None
            artifact = await state_store.get_artifact(artifact_id) if artifact_id else None
            if artifact is None:
                raise HTTPException(status_code=400, detail="The requested artifact is not available for export.")
            source_path = settings.STORAGE_DIR / artifact.relative_path
            single_path = export_dir / entry.output_filename
            shutil.copy2(source_path, single_path)
            relative_path = str(single_path.relative_to(settings.STORAGE_DIR))
        else:
            zip_path = await self.create_export_zip(export_dir, manifest, artifact_type, fmt)
            relative_path = str(zip_path.relative_to(settings.STORAGE_DIR))
        export = ExportRecord(
            export_id=export_id,
            batch_id=batch_id,
            status="completed",
            created_at=manifest.created_at,
            updated_at=datetime.utcnow(),
            scope=scope,
            artifact_type=artifact_type,
            format=fmt,
            quality=quality,
            card_ids=card_ids,
            manifest=manifest,
            relative_path=relative_path,
            download_url=f"/api/exports/{export_id}/download",
        )
        await state_store.upsert_export(export)
        return export

    def _output_filename(self, source_index: int, display_index: int, artifact_type: ArtifactType, fmt: str) -> str:
        return f"card_{source_index:03d}_{display_index:03d}_{artifact_type.value.lower()}.{fmt}"

    def _artifact_id_for_type(self, card, artifact_type: ArtifactType) -> str | None:
        if card is None:
            return None
        mapping = {
            ArtifactType.ORIGINAL_SOURCE: card.original_source_artifact_id,
            ArtifactType.RECTIFIED: card.rectified_artifact_id,
            ArtifactType.UPSCALED: card.upscaled_artifact_id,
            ArtifactType.DESCRATCHED: card.descratched_artifact_id,
            ArtifactType.DESCRATCHED_UPSCALED: card.descratched_upscaled_artifact_id,
        }
        return mapping.get(artifact_type)


export_service = ExportService()
