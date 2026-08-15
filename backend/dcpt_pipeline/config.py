"""Typed configuration for the DCPT pipeline.

Precedence: defaults < configuration file < environment < explicit CLI override.
Invalid configuration is rejected before any expensive initialization.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field, model_validator

_ENV_PREFIX = "DCPT_"


class GraphConfig(BaseModel):
    """Image-to-graph construction configuration."""

    grid_rows: int = Field(default=5, ge=1, le=64)
    grid_cols: int = Field(default=2, ge=1, le=64)
    in_features: int = Field(default=64, ge=4, le=4096)
    max_nodes: int = Field(default=1024, ge=1)
    connectivity: str = Field(default="grid4")  # grid4 | grid8 | full

    @property
    def num_nodes(self) -> int:
        return self.grid_rows * self.grid_cols

    @model_validator(mode="after")
    def _validate(self) -> GraphConfig:
        if self.connectivity not in {"grid4", "grid8", "full"}:
            raise ValueError(f"connectivity must be grid4|grid8|full, got {self.connectivity!r}")
        if self.num_nodes > self.max_nodes:
            raise ValueError(f"grid produces {self.num_nodes} nodes > max_nodes={self.max_nodes}")
        return self


class TStarConfig(BaseModel):
    """Parameters of the canonical T*(l) = (l - gamma) / (l + lambda_) transform.

    Domain contract: l >= 0 (0-dim persistence lifetimes are non-negative).
    With lambda_ > 0 the pole at l = -lambda_ lies strictly outside the domain.
    """

    gamma: float = Field(default=0.1)
    lambda_: float = Field(default=1.0, alias="lambda")
    pole_epsilon: float = Field(default=1e-6, gt=0)

    model_config = {"populate_by_name": True}

    @model_validator(mode="after")
    def _validate(self) -> TStarConfig:
        if self.lambda_ <= 0:
            raise ValueError("lambda must be > 0 so the pole l = -lambda is outside the domain l >= 0")
        if self.gamma < 0:
            raise ValueError("gamma must be >= 0")
        return self


class TDAConfig(BaseModel):
    """TDA computation, caching, and approximation configuration."""

    t_star: TStarConfig = Field(default_factory=TStarConfig)
    cache_enabled: bool = True
    cache_dir: str = ".dcpt_cache"
    approximate: bool = False
    approx_sample_ratio: float = Field(default=0.5, gt=0.0, le=1.0)


class ModelConfig(BaseModel):
    """DCPT model architecture configuration."""

    num_nodes: int = Field(default=10, ge=1)
    in_features: int = Field(default=64, ge=1)
    hidden_features: int = Field(default=128, ge=1)
    num_classes: int = Field(default=6, ge=2)
    adapter_rank: int = Field(default=4, ge=1)
    gate_scale: float = Field(default=5.0)
    leaky_relu_slope: float = Field(default=0.2, gt=0, lt=1)
    dropout: float = Field(default=0.1, ge=0.0, lt=1.0)

    @model_validator(mode="after")
    def _validate(self) -> ModelConfig:
        if self.adapter_rank > min(self.in_features, self.hidden_features):
            raise ValueError("adapter_rank must be <= min(in_features, hidden_features)")
        return self


class TrainingConfig(BaseModel):
    """Training loop configuration."""

    batch_size: int = Field(default=32, ge=1)
    epochs: int = Field(default=20, ge=1)
    learning_rate: float = Field(default=1e-3, gt=0)
    weight_decay: float = Field(default=1e-5, ge=0)
    seed: int = Field(default=42, ge=0)
    value_loss: str = Field(default="huber")  # huber | mse
    value_weight: float = Field(default=1.0, ge=0)
    defect_weight: float = Field(default=1.0, ge=0)
    reg_weight: float = Field(default=1e-4, ge=0)
    grad_clip_norm: float = Field(default=1.0, gt=0)
    grad_accumulation_steps: int = Field(default=1, ge=1)
    early_stopping_patience: int = Field(default=5, ge=1)
    scheduler: str = Field(default="cosine")  # cosine | none
    val_split: float = Field(default=0.15, gt=0, lt=1)
    test_split: float = Field(default=0.15, gt=0, lt=1)
    checkpoint_dir: str = "checkpoints"
    device: str = "cpu"

    @model_validator(mode="after")
    def _validate(self) -> TrainingConfig:
        if self.value_loss not in {"huber", "mse"}:
            raise ValueError(f"value_loss must be huber|mse, got {self.value_loss!r}")
        if self.scheduler not in {"cosine", "none"}:
            raise ValueError(f"scheduler must be cosine|none, got {self.scheduler!r}")
        if self.val_split + self.test_split >= 0.9:
            raise ValueError("val_split + test_split must leave at least 10% for training")
        return self


class APIConfig(BaseModel):
    """FastAPI service configuration."""

    max_upload_bytes: int = Field(default=10 * 1024 * 1024, ge=1024)
    max_batch_items: int = Field(default=16, ge=1, le=256)
    request_timeout_seconds: float = Field(default=30.0, gt=0)
    cors_origins: list[str] = Field(default_factory=lambda: ["*"])
    checkpoint_path: str | None = None


class DCPTConfig(BaseModel):
    """Root configuration object."""

    graph: GraphConfig = Field(default_factory=GraphConfig)
    tda: TDAConfig = Field(default_factory=TDAConfig)
    model: ModelConfig = Field(default_factory=ModelConfig)
    training: TrainingConfig = Field(default_factory=TrainingConfig)
    api: APIConfig = Field(default_factory=APIConfig)

    @model_validator(mode="after")
    def _cross_validate(self) -> DCPTConfig:
        if self.model.num_nodes != self.graph.num_nodes:
            raise ValueError(
                f"model.num_nodes ({self.model.num_nodes}) must equal "
                f"graph.grid_rows*grid_cols ({self.graph.num_nodes})"
            )
        if self.model.in_features != self.graph.in_features:
            raise ValueError("model.in_features must equal graph.in_features")
        return self

    def config_hash(self) -> str:
        """Deterministic hash of the full configuration."""
        payload = json.dumps(self.model_dump(mode="json"), sort_keys=True)
        return hashlib.sha256(payload.encode()).hexdigest()[:16]


def _apply_env_overrides(data: dict[str, Any]) -> dict[str, Any]:
    """Apply DCPT_SECTION__FIELD environment overrides (e.g. DCPT_TRAINING__SEED=7)."""
    for key, raw in os.environ.items():
        if not key.startswith(_ENV_PREFIX):
            continue
        path = key[len(_ENV_PREFIX):].lower().split("__")
        if len(path) < 2:
            continue
        node = data
        for part in path[:-1]:
            node = node.setdefault(part, {})
            if not isinstance(node, dict):
                raise ValueError(f"environment override {key} conflicts with non-dict config node")
        try:
            node[path[-1]] = json.loads(raw)
        except json.JSONDecodeError:
            node[path[-1]] = raw
    return data


def load_config(
    config_file: str | Path | None = None,
    cli_overrides: dict[str, Any] | None = None,
) -> DCPTConfig:
    """Load configuration with precedence: defaults < file < environment < CLI."""
    data: dict[str, Any] = {}
    if config_file is not None:
        path = Path(config_file)
        if not path.is_file():
            raise FileNotFoundError(f"configuration file not found: {path}")
        loaded = json.loads(path.read_text())
        if not isinstance(loaded, dict):
            raise ValueError("configuration file must contain a JSON object")
        data = loaded
    data = _apply_env_overrides(data)
    if cli_overrides:
        for dotted, value in cli_overrides.items():
            node = data
            parts = dotted.split(".")
            for part in parts[:-1]:
                node = node.setdefault(part, {})
            node[parts[-1]] = value
    return DCPTConfig.model_validate(data)
