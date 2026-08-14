"""Canonical T* transform.

    T*(l) = (l - gamma) / (l + lambda)

Structural facts preserved and tested:
  - pole at l = -lambda,
  - zero at l = gamma,
  - dT*/dl = (gamma + lambda) / (l + lambda)^2 where defined.

Domain contract: inputs are 0-dimensional persistence lifetimes, so l >= 0.
With lambda > 0 the pole lies strictly outside the domain. Evaluation across
the pole is NOT treated as continuous: any input within pole_epsilon of the
pole, or on the far side of it, raises TStarDomainError. T* is a topological
descriptor transform; it is not AUROC, probability, confidence, similarity,
or entropy.
"""

from __future__ import annotations

import torch

from dcpt_pipeline.config import TStarConfig


class TStarDomainError(ValueError):
    """Raised when T* is evaluated at or beyond its pole, or off-domain."""


def t_star_transform(lifetimes: torch.Tensor, config: TStarConfig) -> torch.Tensor:
    """Vectorized T*(l) = (l - gamma) / (l + lambda) with explicit pole handling."""
    if not torch.isfinite(lifetimes).all():
        raise TStarDomainError("lifetimes contain NaN or Inf")
    if (lifetimes < 0).any():
        raise TStarDomainError("lifetimes must be >= 0 (0-dim persistence domain)")
    denom = lifetimes + config.lambda_
    if (denom.abs() < config.pole_epsilon).any() or (denom <= 0).any():
        raise TStarDomainError(
            f"evaluation at or beyond the pole l = -lambda = {-config.lambda_}; "
            "T* is not globally continuous across the pole"
        )
    return (lifetimes - config.gamma) / denom


def t_star_derivative(lifetimes: torch.Tensor, config: TStarConfig) -> torch.Tensor:
    """dT*/dl = (gamma + lambda) / (l + lambda)^2 where defined."""
    denom = lifetimes + config.lambda_
    if (denom.abs() < config.pole_epsilon).any():
        raise TStarDomainError("derivative undefined at the pole")
    return (config.gamma + config.lambda_) / denom.pow(2)
