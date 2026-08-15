"""Typed, validated data contracts for the DCPT pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import numpy as np
import torch


class DataProvenance(str, Enum):
    """Explicit provenance. Synthetic data must always identify itself."""

    REAL = "real"
    SYNTHETIC = "synthetic"


class DefectLabel(int, Enum):
    """Mutually exclusive defect classes (multiclass, CrossEntropy objective)."""

    NONE = 0
    CORNER_WEAR = 1
    EDGE_WEAR = 2
    SURFACE_SCRATCH = 3
    CREASE = 4
    PRINT_DEFECT = 5


class ValidationError(ValueError):
    """Deterministic, typed validation failure."""


def _require_finite(t: torch.Tensor, name: str) -> None:
    if not torch.isfinite(t).all():
        raise ValidationError(f"{name} contains NaN or Inf values")


@dataclass(frozen=True)
class CardSample:
    """A single validated card record."""

    card_id: str
    image: np.ndarray  # HxWx3 uint8, RGB
    valuation: float
    defect_label: DefectLabel
    provenance: DataProvenance
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.card_id or not isinstance(self.card_id, str):
            raise ValidationError("card_id must be a non-empty string")
        if not isinstance(self.image, np.ndarray):
            raise ValidationError("image must be a numpy array")
        if self.image.ndim != 3 or self.image.shape[2] != 3:
            raise ValidationError(f"image must be HxWx3, got shape {self.image.shape}")
        if self.image.dtype != np.uint8:
            raise ValidationError(f"image dtype must be uint8, got {self.image.dtype}")
        h, w = self.image.shape[:2]
        if h < 8 or w < 8:
            raise ValidationError(f"image dimensions too small: {h}x{w} (minimum 8x8)")
        if not np.isfinite(self.valuation) or self.valuation < 0:
            raise ValidationError(f"valuation must be finite and >= 0, got {self.valuation}")
        if not isinstance(self.defect_label, DefectLabel):
            raise ValidationError("defect_label must be a DefectLabel")
        if not isinstance(self.provenance, DataProvenance):
            raise ValidationError("provenance must be a DataProvenance")


@dataclass(frozen=True)
class GraphSample:
    """Validated graph representation of a card image.

    Invariants:
      - x: [N, F] finite float tensor, N >= 1
      - edge_index: [2, E] long tensor with 0 <= idx < N
      - positions: [N, 2] finite float tensor
    """

    x: torch.Tensor
    edge_index: torch.Tensor
    positions: torch.Tensor

    def __post_init__(self) -> None:
        if self.x.ndim != 2:
            raise ValidationError(f"x must be [N, F], got shape {tuple(self.x.shape)}")
        n = self.x.shape[0]
        if n == 0:
            raise ValidationError("zero-node graphs are rejected")
        _require_finite(self.x, "x")
        if self.edge_index.ndim != 2 or self.edge_index.shape[0] != 2:
            raise ValidationError(f"edge_index.shape must be [2, E], got {tuple(self.edge_index.shape)}")
        if self.edge_index.dtype != torch.long:
            raise ValidationError(f"edge_index dtype must be long, got {self.edge_index.dtype}")
        if self.edge_index.numel() > 0:
            if int(self.edge_index.min()) < 0 or int(self.edge_index.max()) >= n:
                raise ValidationError(
                    f"edge_index out of bounds: values must be in [0, {n}), "
                    f"got range [{int(self.edge_index.min())}, {int(self.edge_index.max())}]"
                )
        if self.positions.ndim != 2 or self.positions.shape != (n, 2):
            raise ValidationError(f"positions must be [N, 2] = [{n}, 2], got {tuple(self.positions.shape)}")
        _require_finite(self.positions, "positions")

    @property
    def num_nodes(self) -> int:
        return int(self.x.shape[0])


@dataclass(frozen=True)
class TDAFeatures:
    """Per-node topological features and T* values."""

    lifetimes: torch.Tensor  # [N], l >= 0
    t_star: torch.Tensor  # [N]
    approximate: bool
    cache_hit: bool
    algorithm_version: str

    def __post_init__(self) -> None:
        if self.lifetimes.ndim != 1 or self.t_star.ndim != 1:
            raise ValidationError("lifetimes and t_star must be 1-D tensors")
        if self.lifetimes.shape != self.t_star.shape:
            raise ValidationError("lifetimes and t_star must have identical shapes")
        _require_finite(self.lifetimes, "lifetimes")
        _require_finite(self.t_star, "t_star")
        if (self.lifetimes < 0).any():
            raise ValidationError("lifetimes must be non-negative")


@dataclass(frozen=True)
class ModelOutput:
    """Structured model forward output."""

    value_pred: torch.Tensor  # [B]
    defect_logits: torch.Tensor  # [B, C]
    node_embeddings: torch.Tensor  # [B, N, H]
    t_star: torch.Tensor  # [B, N]
    attention_weights: torch.Tensor  # [B, N, N]


@dataclass(frozen=True)
class PredictionResult:
    """Stable typed inference response."""

    card_id: str
    predicted_value: float
    defect_probabilities: dict[str, float]
    predicted_defect: str
    tda_summary: dict[str, float]
    model_version: str
    checkpoint_id: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "card_id": self.card_id,
            "predicted_value": self.predicted_value,
            "defect_probabilities": self.defect_probabilities,
            "predicted_defect": self.predicted_defect,
            "tda_summary": self.tda_summary,
            "model_version": self.model_version,
            "checkpoint_id": self.checkpoint_id,
        }


@dataclass
class TrainingMetrics:
    """Per-epoch training metrics record."""

    epoch: int
    total_loss: float
    value_loss: float
    defect_loss: float
    reg_loss: float
    val_total_loss: float
    val_mae: float
    val_rmse: float
    val_r2: float
    val_accuracy: float
    val_precision: float
    val_recall: float
    val_f1: float

    def to_dict(self) -> dict[str, float | int]:
        return dict(vars(self))
