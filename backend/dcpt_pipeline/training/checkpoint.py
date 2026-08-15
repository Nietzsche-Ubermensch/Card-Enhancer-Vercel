"""Checkpoint save/load with compatibility validation.

Checkpoints are loaded with torch.load(weights_only=True): state dicts and
primitive metadata only, no arbitrary pickled objects. Loading validates
schema version, model/TDA/feature versions, and tensor dimensions, and
rejects corrupted or incompatible files with typed errors.
"""

from __future__ import annotations

import hashlib
import time
from pathlib import Path
from typing import Any

import torch

from dcpt_pipeline import (
    CHECKPOINT_SCHEMA_VERSION,
    FEATURE_SCHEMA_VERSION,
    MODEL_VERSION,
    TDA_VERSION,
)
from dcpt_pipeline.config import DCPTConfig
from dcpt_pipeline.models.dcpt_model import DCPTModel


class CheckpointError(RuntimeError):
    """Typed checkpoint failure: corruption or incompatibility."""


def checkpoint_id(path: str | Path) -> str:
    """Content-addressed checkpoint identity (byte identity, not correctness)."""
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()[:16]


def save_checkpoint(
    path: str | Path,
    model: DCPTModel,
    config: DCPTConfig,
    epoch: int,
    metrics: dict[str, float],
    run_id: str,
    dataset_fingerprint: str,
    optimizer: torch.optim.Optimizer | None = None,
    scheduler: Any | None = None,
) -> None:
    payload: dict[str, Any] = {
        "schema_version": CHECKPOINT_SCHEMA_VERSION,
        "model_state_dict": model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict() if optimizer else None,
        "scheduler_state_dict": scheduler.state_dict() if scheduler else None,
        "configuration": config.model_dump(mode="json"),
        "epoch": epoch,
        "metrics": metrics,
        "model_version": MODEL_VERSION,
        "tda_version": TDA_VERSION,
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "seed": config.training.seed,
        "dataset_fingerprint": dataset_fingerprint,
        "run_id": run_id,
        "config_hash": config.config_hash(),
        "timestamp": time.time(),
    }
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(payload, path)


def load_checkpoint(path: str | Path, expected_config: DCPTConfig | None = None) -> dict[str, Any]:
    """Load and validate a checkpoint. Returns the validated payload."""
    path = Path(path)
    if not path.is_file():
        raise CheckpointError(f"checkpoint not found: {path}")
    try:
        payload = torch.load(path, map_location="cpu", weights_only=True)
    except Exception as exc:
        raise CheckpointError(f"corrupted or unsafe checkpoint: {exc}") from exc

    if not isinstance(payload, dict):
        raise CheckpointError("checkpoint payload must be a dict")
    schema = payload.get("schema_version")
    if schema != CHECKPOINT_SCHEMA_VERSION:
        raise CheckpointError(
            f"incompatible schema_version {schema!r}, expected {CHECKPOINT_SCHEMA_VERSION}"
        )
    for key, expected in (
        ("model_version", MODEL_VERSION),
        ("tda_version", TDA_VERSION),
        ("feature_schema_version", FEATURE_SCHEMA_VERSION),
    ):
        if payload.get(key) != expected:
            raise CheckpointError(f"incompatible {key}: {payload.get(key)!r} != {expected!r}")

    stored_config = DCPTConfig.model_validate(payload.get("configuration"))
    if expected_config is not None:
        for attr in ("num_nodes", "in_features", "hidden_features", "num_classes", "adapter_rank"):
            if getattr(stored_config.model, attr) != getattr(expected_config.model, attr):
                raise CheckpointError(
                    f"incompatible model dimension {attr}: checkpoint="
                    f"{getattr(stored_config.model, attr)} expected={getattr(expected_config.model, attr)}"
                )

    # Dimension check: state dict must actually fit the declared architecture.
    probe = DCPTModel(stored_config.model)
    try:
        probe.load_state_dict(payload["model_state_dict"])
    except Exception as exc:
        raise CheckpointError(f"state dict incompatible with declared configuration: {exc}") from exc
    return payload


def restore_model(path: str | Path, expected_config: DCPTConfig | None = None) -> tuple[DCPTModel, dict[str, Any]]:
    """Load checkpoint and return a ready eval-mode model plus payload."""
    payload = load_checkpoint(path, expected_config)
    config = DCPTConfig.model_validate(payload["configuration"])
    model = DCPTModel(config.model)
    model.load_state_dict(payload["model_state_dict"])
    model.eval()
    return model, payload
