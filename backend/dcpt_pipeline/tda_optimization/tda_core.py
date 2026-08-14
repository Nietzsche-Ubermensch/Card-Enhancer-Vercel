"""TDA core: per-node 0-dimensional persistence lifetimes, caching, approximation.

Lifetimes are computed with a superlevel-set filtration of a node scalar
field (feature-norm) over the graph: components are born at local maxima and
die when they merge into a component with an older (higher) birth value
(elder rule). The globally oldest component receives lifetime
(birth - min_value). All lifetimes are >= 0, matching the T* domain contract.

Cache keys include every input capable of changing the result:
input fingerprint, graph configuration, TDA configuration, T* parameters,
and the algorithm version. Corrupted entries are detected via checksum and
treated as misses. Approximate results identify themselves in metadata.
"""

from __future__ import annotations

import hashlib
import json
import pickle
from pathlib import Path

import torch

from dcpt_pipeline import TDA_VERSION
from dcpt_pipeline.config import GraphConfig, TDAConfig
from dcpt_pipeline.schemas import GraphSample, TDAFeatures, ValidationError
from dcpt_pipeline.tda_optimization.t_star import t_star_transform


def compute_lifetimes(graph: GraphSample) -> torch.Tensor:
    """0-dim persistence lifetimes per node via superlevel-set union-find."""
    values = torch.linalg.norm(graph.x, dim=1)
    if not torch.isfinite(values).all():
        raise ValidationError("node scalar field contains non-finite values")
    n = graph.num_nodes
    order = torch.argsort(values, descending=True)

    parent = list(range(n))
    birth = [0.0] * n  # birth value of the component root
    lifetimes = torch.zeros(n)
    activated = [False] * n

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    neighbors: list[set[int]] = [set() for _ in range(n)]
    src, dst = graph.edge_index[0].tolist(), graph.edge_index[1].tolist()
    for s, d in zip(src, dst):
        if s != d:
            neighbors[s].add(d)
            neighbors[d].add(s)

    vals = values.tolist()
    for idx in order.tolist():
        activated[idx] = True
        birth[idx] = vals[idx]
        for nb in neighbors[idx]:
            if not activated[nb]:
                continue
            ra, rb = find(idx), find(nb)
            if ra == rb:
                continue
            # Elder rule: the younger component (lower birth) dies now.
            if birth[ra] < birth[rb]:
                ra, rb = rb, ra
            lifetimes[rb] = birth[rb] - vals[idx]
            parent[rb] = ra

    # Surviving components: lifetime = birth - global minimum.
    min_val = float(values.min())
    for i in range(n):
        if find(i) == i and activated[i]:
            lifetimes[i] = birth[i] - min_val
    return lifetimes.clamp(min=0.0)


def _approximate_lifetimes(graph: GraphSample, sample_ratio: float) -> torch.Tensor:
    """Approximation: exact lifetimes on a node subsample, nearest-neighbor fill."""
    n = graph.num_nodes
    k = max(1, int(n * sample_ratio))
    values = torch.linalg.norm(graph.x, dim=1)
    top = torch.argsort(values, descending=True)[:k]
    exact = compute_lifetimes(graph)
    out = torch.zeros(n)
    out[top] = exact[top]
    return out


class TDACacheManager:
    """Disk cache keyed by every result-changing input, with corruption detection."""

    def __init__(self, cache_dir: str | Path):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.hits = 0
        self.misses = 0
        self.corrupted = 0

    @staticmethod
    def cache_key(
        input_fingerprint: str,
        graph_config: GraphConfig,
        tda_config: TDAConfig,
    ) -> str:
        payload = json.dumps(
            {
                "input": input_fingerprint,
                "graph": graph_config.model_dump(mode="json"),
                "tda": tda_config.model_dump(mode="json", exclude={"cache_enabled", "cache_dir"}),
                "t_star": tda_config.t_star.model_dump(mode="json"),
                "algorithm_version": TDA_VERSION,
            },
            sort_keys=True,
        )
        return hashlib.sha256(payload.encode()).hexdigest()

    def _path(self, key: str) -> Path:
        return self.cache_dir / f"{key}.pkl"

    def get(self, key: str) -> torch.Tensor | None:
        path = self._path(key)
        if not path.is_file():
            self.misses += 1
            return None
        try:
            raw = path.read_bytes()
            stored_checksum, blob = raw[:64], raw[64:]
            if hashlib.sha256(blob).hexdigest().encode() != stored_checksum:
                self.corrupted += 1
                self.misses += 1
                path.unlink(missing_ok=True)
                return None
            lifetimes = pickle.loads(blob)  # noqa: S301 - self-written, checksum-verified
            if not isinstance(lifetimes, torch.Tensor):
                raise TypeError("cache payload is not a tensor")
            self.hits += 1
            return lifetimes
        except Exception:
            self.corrupted += 1
            self.misses += 1
            path.unlink(missing_ok=True)
            return None

    def put(self, key: str, lifetimes: torch.Tensor) -> None:
        blob = pickle.dumps(lifetimes)
        checksum = hashlib.sha256(blob).hexdigest().encode()
        self._path(key).write_bytes(checksum + blob)

    def stats(self) -> dict[str, int]:
        return {"hits": self.hits, "misses": self.misses, "corrupted": self.corrupted}


class TDAPipeline:
    """End-to-end TDA feature computation with caching and T* transform."""

    def __init__(self, graph_config: GraphConfig, tda_config: TDAConfig):
        self.graph_config = graph_config
        self.tda_config = tda_config
        self.cache = TDACacheManager(tda_config.cache_dir) if tda_config.cache_enabled else None

    @staticmethod
    def fingerprint(graph: GraphSample) -> str:
        h = hashlib.sha256()
        h.update(graph.x.numpy().tobytes())
        h.update(graph.edge_index.numpy().tobytes())
        return h.hexdigest()

    def compute(self, graph: GraphSample) -> TDAFeatures:
        fingerprint = self.fingerprint(graph)
        key = (
            TDACacheManager.cache_key(fingerprint, self.graph_config, self.tda_config)
            if self.cache
            else None
        )
        cache_hit = False
        lifetimes: torch.Tensor | None = None
        if self.cache and key:
            lifetimes = self.cache.get(key)
            cache_hit = lifetimes is not None
        if lifetimes is None:
            if self.tda_config.approximate:
                lifetimes = _approximate_lifetimes(graph, self.tda_config.approx_sample_ratio)
            else:
                lifetimes = compute_lifetimes(graph)
            if self.cache and key:
                self.cache.put(key, lifetimes)
        return TDAFeatures(
            lifetimes=lifetimes,
            t_star=t_star_transform(lifetimes, self.tda_config.t_star),
            approximate=self.tda_config.approximate,
            cache_hit=cache_hit,
            algorithm_version=TDA_VERSION,
        )
