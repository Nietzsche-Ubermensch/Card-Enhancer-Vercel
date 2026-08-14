"""Deterministic seeding for reproducible runs."""

from __future__ import annotations

import random

import numpy as np
import torch


def seed_everything(seed: int) -> None:
    """Seed python, numpy, and torch RNGs deterministically."""
    if seed < 0:
        raise ValueError("seed must be >= 0")
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.use_deterministic_algorithms(True, warn_only=True)
