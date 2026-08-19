"""Durable-enough JSON-backed state store for batches, sources, cards, artifacts, and exports."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.models.schemas import ArtifactRecord, BatchRecord, BatchStatus, CardRecord, CardStatus, ExportRecord, SourceRecord


class StateStore:
    """Maintains authoritative backend state and persists it to disk."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._data = self._load()

    def _load(self) -> dict[str, Any]:
        if settings.state_path.exists():
            return json.loads(settings.state_path.read_text())
        return {"batches": {}, "sources": {}, "cards": {}, "artifacts": {}, "exports": {}}

    def _save_unlocked(self) -> None:
        settings.state_path.write_text(json.dumps(self._data, indent=2, default=str))

    async def save(self) -> None:
        async with self._lock:
            self._save_unlocked()

    async def create_batch(self, batch: BatchRecord) -> None:
        async with self._lock:
            self._data["batches"][batch.batch_id] = batch.model_dump(mode="json")
            self._save_unlocked()

    async def get_batch(self, batch_id: str) -> BatchRecord | None:
        batch = self._data["batches"].get(batch_id)
        return BatchRecord.model_validate(batch) if batch else None

    async def list_batches(self) -> list[BatchRecord]:
        return [BatchRecord.model_validate(batch) for batch in self._data["batches"].values()]

    async def upsert_source(self, source: SourceRecord) -> None:
        async with self._lock:
            self._data["sources"][source.source_id] = source.model_dump(mode="json")
            self._save_unlocked()

    async def get_source(self, source_id: str) -> SourceRecord | None:
        source = self._data["sources"].get(source_id)
        return SourceRecord.model_validate(source) if source else None

    async def get_sources_for_batch(self, batch_id: str) -> list[SourceRecord]:
        return [
            SourceRecord.model_validate(source)
            for source in self._data["sources"].values()
            if source["batch_id"] == batch_id
        ]

    async def upsert_card(self, card: CardRecord) -> None:
        async with self._lock:
            self._data["cards"][card.card_id] = card.model_dump(mode="json")
            self._save_unlocked()

    async def get_card(self, card_id: str) -> CardRecord | None:
        card = self._data["cards"].get(card_id)
        return CardRecord.model_validate(card) if card else None

    async def get_cards_for_batch(self, batch_id: str) -> list[CardRecord]:
        cards = [
            CardRecord.model_validate(card)
            for card in self._data["cards"].values()
            if card["batch_id"] == batch_id
        ]
        return sorted(cards, key=lambda item: item.display_index)

    async def upsert_artifact(self, artifact: ArtifactRecord) -> None:
        async with self._lock:
            self._data["artifacts"][artifact.artifact_id] = artifact.model_dump(mode="json")
            self._save_unlocked()

    async def get_artifact(self, artifact_id: str) -> ArtifactRecord | None:
        artifact = self._data["artifacts"].get(artifact_id)
        return ArtifactRecord.model_validate(artifact) if artifact else None

    async def get_artifacts_for_card(self, card_id: str) -> list[ArtifactRecord]:
        artifacts = [
            ArtifactRecord.model_validate(artifact)
            for artifact in self._data["artifacts"].values()
            if artifact["card_id"] == card_id
        ]
        return sorted(artifacts, key=lambda item: item.created_at)

    async def upsert_export(self, export_record: ExportRecord) -> None:
        async with self._lock:
            self._data["exports"][export_record.export_id] = export_record.model_dump(mode="json")
            self._save_unlocked()

    async def get_export(self, export_id: str) -> ExportRecord | None:
        export_record = self._data["exports"].get(export_id)
        return ExportRecord.model_validate(export_record) if export_record else None

    async def attach_source_to_batch(self, batch_id: str, source_id: str) -> None:
        batch = await self.get_batch(batch_id)
        if batch is None:
            return
        if source_id not in batch.source_ids:
            batch.source_ids.append(source_id)
            batch.source_count = len(batch.source_ids)
            batch.updated_at = datetime.utcnow()
            await self.create_batch(batch)

    async def attach_card_to_batch(self, batch_id: str, card_id: str) -> None:
        batch = await self.get_batch(batch_id)
        if batch is None:
            return
        if card_id not in batch.card_ids:
            batch.card_ids.append(card_id)
            batch.detected_card_count = len(batch.card_ids)
            batch.updated_at = datetime.utcnow()
            await self.create_batch(batch)

    async def update_batch_state(self, batch_id: str) -> BatchRecord | None:
        async with self._lock:
            raw_batch = self._data["batches"].get(batch_id)
            if raw_batch is None:
                return None
            batch = BatchRecord.model_validate(raw_batch)
            cards = [
                CardRecord.model_validate(card)
                for card in self._data["cards"].values()
                if card["batch_id"] == batch_id
            ]
            batch.source_count = len(batch.source_ids)
            batch.detected_card_count = len(cards)
            batch.queued_count = sum(card.current_stage in {"VALIDATING", "DETECTING", "GEOMETRY", "QUEUED"} for card in cards)
            batch.processing_count = sum(card.status == CardStatus.PROCESSING.value for card in cards)
            batch.completed_count = sum(card.status in {CardStatus.READY.value, CardStatus.COMPLETED.value} for card in cards)
            batch.failed_count = sum(card.status == CardStatus.FAILED.value for card in cards)
            batch.cancelled_count = sum(card.status == CardStatus.CANCELLED.value for card in cards)
            if cards:
                batch.progress = round(sum(card.progress for card in cards) / len(cards), 2)
            else:
                sources = [source for source in self._data["sources"].values() if source["batch_id"] == batch_id]
                batch.progress = 100.0 if sources and all(source["status"] == "FAILED" for source in sources) else 0.0
            if cards and batch.failed_count and batch.completed_count:
                batch.status = BatchStatus.PARTIAL_SUCCESS
            elif cards and batch.failed_count == len(cards):
                batch.status = BatchStatus.FAILED
            elif cards and batch.completed_count == len(cards):
                batch.status = BatchStatus.COMPLETED
            elif cards and batch.processing_count:
                batch.status = BatchStatus.PROCESSING
            elif batch.source_count:
                batch.status = BatchStatus.UPLOADING if batch.detected_card_count == 0 else BatchStatus.PROCESSING
            else:
                batch.status = BatchStatus.QUEUED
            batch.updated_at = datetime.utcnow()
            self._data["batches"][batch_id] = batch.model_dump(mode="json")
            self._save_unlocked()
            return batch


state_store = StateStore()
