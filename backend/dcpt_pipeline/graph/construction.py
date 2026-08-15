"""Deterministic preprocessing and image -> graph construction.

Pipeline: image -> grid patches -> node features X -> positions -> edges E -> G.

Invariants enforced through GraphSample validation:
  edge_index.shape == [2, E], 0 <= edge_index < N, no NaN/Inf,
  zero-node graphs rejected, oversized graphs rejected.
"""

from __future__ import annotations

import numpy as np
import torch

from dcpt_pipeline.config import GraphConfig
from dcpt_pipeline.schemas import GraphSample, ValidationError

_TARGET_SIZE = (256, 256)  # deterministic resize target (w, h)


def preprocess_image(image: np.ndarray) -> np.ndarray:
    """Deterministic preprocessing: validate, resize to 256x256, scale to [0, 1].

    Accepts HxWx3 uint8 RGB. Raises ValidationError on malformed input.
    """
    import cv2

    if not isinstance(image, np.ndarray):
        raise ValidationError("image must be a numpy array")
    if image.ndim != 3 or image.shape[2] != 3:
        raise ValidationError(f"image must be HxWx3, got shape {getattr(image, 'shape', None)}")
    if image.dtype != np.uint8:
        raise ValidationError(f"image dtype must be uint8, got {image.dtype}")
    if image.shape[0] < 8 or image.shape[1] < 8:
        raise ValidationError(f"image too small: {image.shape[0]}x{image.shape[1]}")
    resized = cv2.resize(image, _TARGET_SIZE, interpolation=cv2.INTER_AREA)
    out = resized.astype(np.float32) / 255.0
    if not np.isfinite(out).all():
        raise ValidationError("preprocessed image contains non-finite values")
    return out


def _patch_features(patch: np.ndarray, in_features: int) -> np.ndarray:
    """Deterministic per-patch feature vector of length in_features.

    Composed of channel means/stds, gradient statistics, and an intensity
    histogram, tiled/truncated to the configured feature width.
    """
    import cv2

    gray = patch.mean(axis=2)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    grad_mag = np.sqrt(gx**2 + gy**2)

    stats = np.array(
        [
            *patch.mean(axis=(0, 1)),
            *patch.std(axis=(0, 1)),
            float(grad_mag.mean()),
            float(grad_mag.std()),
            float(grad_mag.max()),
            float(gray.min()),
            float(gray.max()),
            float(np.median(gray)),
        ],
        dtype=np.float32,
    )
    hist, _ = np.histogram(gray, bins=16, range=(0.0, 1.0))
    hist = hist.astype(np.float32) / max(1, gray.size)
    base = np.concatenate([stats, hist])
    if base.size >= in_features:
        return base[:in_features]
    reps = int(np.ceil(in_features / base.size))
    return np.tile(base, reps)[:in_features]


def _grid_edges(rows: int, cols: int, connectivity: str) -> torch.Tensor:
    """Undirected grid adjacency as a [2, E] edge_index (both directions)."""
    edges: list[tuple[int, int]] = []
    if connectivity == "full":
        n = rows * cols
        edges = [(i, j) for i in range(n) for j in range(n) if i != j]
    else:
        offsets = [(-1, 0), (1, 0), (0, -1), (0, 1)]
        if connectivity == "grid8":
            offsets += [(-1, -1), (-1, 1), (1, -1), (1, 1)]
        for r in range(rows):
            for c in range(cols):
                i = r * cols + c
                for dr, dc in offsets:
                    rr, cc = r + dr, c + dc
                    if 0 <= rr < rows and 0 <= cc < cols:
                        edges.append((i, rr * cols + cc))
    if not edges:
        # Single-node graph: self-loop keeps attention well-defined.
        edges = [(0, 0)]
    return torch.tensor(edges, dtype=torch.long).t().contiguous()


def build_graph(image: np.ndarray, config: GraphConfig) -> GraphSample:
    """Build a validated GraphSample from a raw RGB uint8 image."""
    processed = preprocess_image(image)
    rows, cols = config.grid_rows, config.grid_cols
    if rows * cols > config.max_nodes:
        raise ValidationError(f"graph size {rows * cols} exceeds max_nodes={config.max_nodes}")

    h, w = processed.shape[:2]
    ph, pw = h // rows, w // cols
    if ph == 0 or pw == 0:
        raise ValidationError(f"grid {rows}x{cols} produces empty patches for {h}x{w} image")

    features = np.stack(
        [
            _patch_features(processed[r * ph : (r + 1) * ph, c * pw : (c + 1) * pw], config.in_features)
            for r in range(rows)
            for c in range(cols)
        ]
    )
    positions = np.array(
        [[(c + 0.5) / cols, (r + 0.5) / rows] for r in range(rows) for c in range(cols)],
        dtype=np.float32,
    )
    return GraphSample(
        x=torch.from_numpy(features.astype(np.float32)),
        edge_index=_grid_edges(rows, cols, config.connectivity),
        positions=torch.from_numpy(positions),
    )
