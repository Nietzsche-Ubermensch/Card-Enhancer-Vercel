"""Data loading and synthetic data generation.

Synthetic data always carries explicit provenance (DataProvenance.SYNTHETIC).
Production code must never silently substitute synthetic data when real
input fails: generation is opt-in and clearly labeled.
"""

from __future__ import annotations

import hashlib

import numpy as np
import torch
from torch.utils.data import Dataset

from dcpt_pipeline.config import DCPTConfig
from dcpt_pipeline.graph.construction import build_graph
from dcpt_pipeline.schemas import CardSample, DataProvenance, DefectLabel, ValidationError
from dcpt_pipeline.tda_optimization.tda_core import TDAPipeline

_DEFECT_VALUE_PENALTY = {
    DefectLabel.NONE: 0.0,
    DefectLabel.CORNER_WEAR: 0.30,
    DefectLabel.EDGE_WEAR: 0.25,
    DefectLabel.SURFACE_SCRATCH: 0.40,
    DefectLabel.CREASE: 0.60,
    DefectLabel.PRINT_DEFECT: 0.20,
}


def generate_synthetic_card(
    rng: np.random.Generator, defect: DefectLabel, size: tuple[int, int] = (256, 180)
) -> CardSample:
    """One synthetic card image with a visually rendered defect signal."""
    h, w = size
    base_value = float(rng.uniform(5.0, 500.0))
    img = np.full((h, w, 3), 235, dtype=np.uint8)
    # Card border and interior artwork blocks (deterministic structure + noise).
    img[8:-8, 8:-8] = rng.integers(90, 200, size=3, dtype=np.uint8)
    img[24 : h // 2, 20:-20] = rng.integers(40, 220, size=3, dtype=np.uint8)
    noise = rng.normal(0, 6, img.shape)
    img = np.clip(img.astype(np.int16) + noise.astype(np.int16), 0, 255).astype(np.uint8)

    if defect == DefectLabel.CORNER_WEAR:
        img[:20, :20] = rng.integers(20, 60, size=3, dtype=np.uint8)
    elif defect == DefectLabel.EDGE_WEAR:
        img[:, :6] = rng.integers(20, 70, size=3, dtype=np.uint8)
        img[:, -6:] = rng.integers(20, 70, size=3, dtype=np.uint8)
    elif defect == DefectLabel.SURFACE_SCRATCH:
        y = int(rng.integers(h // 4, 3 * h // 4))
        img[y : y + 3, 10:-10] = 250
    elif defect == DefectLabel.CREASE:
        x = int(rng.integers(w // 4, 3 * w // 4))
        img[10:-10, x : x + 4] = 30
    elif defect == DefectLabel.PRINT_DEFECT:
        cy, cx = int(rng.integers(30, h - 30)), int(rng.integers(30, w - 30))
        img[cy - 8 : cy + 8, cx - 8 : cx + 8] = rng.integers(0, 255, size=3, dtype=np.uint8)

    valuation = base_value * (1.0 - _DEFECT_VALUE_PENALTY[defect])
    card_id = "synthetic-" + hashlib.sha256(img.tobytes()).hexdigest()[:12]
    return CardSample(
        card_id=card_id,
        image=img,
        valuation=valuation,
        defect_label=defect,
        provenance=DataProvenance.SYNTHETIC,
        metadata={"generator": "dcpt_pipeline.utils.data_utils", "base_value": base_value},
    )


def generate_synthetic_dataset(num_samples: int, seed: int) -> list[CardSample]:
    """Balanced synthetic dataset, explicitly labeled SYNTHETIC."""
    if num_samples < 1:
        raise ValidationError("num_samples must be >= 1")
    rng = np.random.default_rng(seed)
    labels = list(DefectLabel)
    return [generate_synthetic_card(rng, labels[i % len(labels)]) for i in range(num_samples)]


def dataset_fingerprint(samples: list[CardSample]) -> str:
    """Stable fingerprint over card ids and targets for run metadata."""
    h = hashlib.sha256()
    for s in samples:
        h.update(s.card_id.encode())
        h.update(np.float64(s.valuation).tobytes())
        h.update(bytes([s.defect_label.value]))
    return h.hexdigest()[:16]


class CardDataset(Dataset):
    """Torch dataset producing (x, edge_index, t_star, price, label) tensors."""

    def __init__(self, samples: list[CardSample], config: DCPTConfig):
        if not samples:
            raise ValidationError("CardDataset requires at least one sample")
        self.config = config
        self.samples = samples
        self._tda = TDAPipeline(config.graph, config.tda)
        self._cache: dict[int, tuple[torch.Tensor, torch.Tensor, torch.Tensor]] = {}
        # All samples share the graph topology defined by the grid config.
        self.edge_index = build_graph(samples[0].image, config.graph).edge_index

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        if idx not in self._cache:
            sample = self.samples[idx]
            graph = build_graph(sample.image, self.config.graph)
            tda = self._tda.compute(graph)
            self._cache[idx] = (graph.x, tda.t_star, tda.lifetimes)
        x, t_star, _ = self._cache[idx]
        sample = self.samples[idx]
        return {
            "x": x,
            "t_star": t_star,
            "price": torch.tensor(sample.valuation, dtype=torch.float32),
            "label": torch.tensor(sample.defect_label.value, dtype=torch.long),
        }
