"""DCPT model: node-conditioned attention with TDA-modulated coefficients.

Node-conditioned projections use shared weights plus low-rank per-node
adapters to avoid uncontrolled parameter growth:

    W_Q^(j) = W_Q + U_Q^(j) V_Q^(j)^T   (rank r << d)

and likewise for K, V, O.

Attention follows the repository's documented formulation
(dcpt_requirements.md):

    alpha_ij  propto  softmax_j( LeakyReLU( (W_Q,i h_i) . (W_K,j h_j) / sqrt(d) ) ) * sigma(gate_scale * T_j*)

Attention is restricted to valid graph neighborhoods via the adjacency mask.
TDA modulation is explicit and can be disabled for controlled comparisons.
"""

from __future__ import annotations

import torch
import torch.nn.functional as F
from torch import nn

from dcpt_pipeline.config import ModelConfig
from dcpt_pipeline.schemas import ModelOutput, ValidationError


class BPDAGate(torch.autograd.Function):
    """Backward-Pass Differentiable Approximation boundary.

    Forward: hard binarization (non-differentiable).
    Backward: straight-through identity surrogate  dy/dx ~= 1.
    """

    @staticmethod
    def forward(ctx: object, x: torch.Tensor) -> torch.Tensor:  # type: ignore[override]
        return (x > 0.5).to(x.dtype)

    @staticmethod
    def backward(ctx: object, grad_output: torch.Tensor) -> torch.Tensor:  # type: ignore[override]
        return grad_output


class LowRankNodeAdapter(nn.Module):
    """Per-node low-rank weight deltas: delta_W^(j) = U^(j) V^(j)^T."""

    def __init__(self, num_nodes: int, in_dim: int, out_dim: int, rank: int):
        super().__init__()
        self.u = nn.Parameter(torch.randn(num_nodes, out_dim, rank) * 0.02)
        self.v = nn.Parameter(torch.randn(num_nodes, rank, in_dim) * 0.02)

    def forward(self, h: torch.Tensor) -> torch.Tensor:
        """h: [B, N, in_dim] -> per-node delta projection [B, N, out_dim]."""
        # [B, N, in_dim] x [N, in_dim, rank] -> [B, N, rank]
        low = torch.einsum("bni,nri->bnr", h, self.v)
        # [B, N, rank] x [N, out_dim, rank] -> [B, N, out_dim]
        return torch.einsum("bnr,nor->bno", low, self.u)

    def regularization(self) -> torch.Tensor:
        return self.u.pow(2).mean() + self.v.pow(2).mean()


class NodeConditionedAttention(nn.Module):
    """Graph attention with node-specific projections and TDA gating."""

    def __init__(self, config: ModelConfig, in_dim: int, out_dim: int):
        super().__init__()
        self.config = config
        self.scale = out_dim**-0.5
        self.w_q = nn.Linear(in_dim, out_dim, bias=False)
        self.w_k = nn.Linear(in_dim, out_dim, bias=False)
        self.w_v = nn.Linear(in_dim, out_dim, bias=False)
        self.w_o = nn.Linear(out_dim, out_dim, bias=False)
        n, r = config.num_nodes, config.adapter_rank
        self.adapter_q = LowRankNodeAdapter(n, in_dim, out_dim, r)
        self.adapter_k = LowRankNodeAdapter(n, in_dim, out_dim, r)
        self.adapter_v = LowRankNodeAdapter(n, in_dim, out_dim, r)
        self.adapter_o = LowRankNodeAdapter(n, out_dim, out_dim, r)
        self.leaky = nn.LeakyReLU(config.leaky_relu_slope)
        self.dropout = nn.Dropout(config.dropout)

    def forward(
        self,
        h: torch.Tensor,  # [B, N, in_dim]
        adj_mask: torch.Tensor,  # [N, N] bool, True where edge exists
        t_star: torch.Tensor | None,  # [B, N] or None to disable TDA modulation
    ) -> tuple[torch.Tensor, torch.Tensor]:
        q = self.w_q(h) + self.adapter_q(h)  # node-conditioned W_Q^(j)
        k = self.w_k(h) + self.adapter_k(h)
        v = self.w_v(h) + self.adapter_v(h)

        # e_ij = LeakyReLU(Q_i . K_j / sqrt(d)), masked to graph neighborhoods.
        scores = self.leaky(torch.einsum("bid,bjd->bij", q, k) * self.scale)
        scores = scores.masked_fill(~adj_mask.unsqueeze(0), float("-inf"))
        alpha = torch.softmax(scores, dim=-1)

        if t_star is not None:
            # Documented TDA modulation: alpha_ij * sigma(gate_scale * T_j*).
            gate = torch.sigmoid(self.config.gate_scale * t_star)  # [B, N]
            alpha = alpha * gate.unsqueeze(1)
            alpha = alpha / alpha.sum(dim=-1, keepdim=True).clamp(min=1e-12)

        alpha = self.dropout(alpha)
        out = torch.einsum("bij,bjd->bid", alpha, v)
        out = self.w_o(out) + self.adapter_o(out)
        return out, alpha

    def regularization(self) -> torch.Tensor:
        return (
            self.adapter_q.regularization()
            + self.adapter_k.regularization()
            + self.adapter_v.regularization()
            + self.adapter_o.regularization()
        )


class DCPTModel(nn.Module):
    """DCPT: multi-task graph model for valuation regression and defect classification."""

    def __init__(self, config: ModelConfig):
        super().__init__()
        self.config = config
        h = config.hidden_features
        self.attn1 = NodeConditionedAttention(config, config.in_features, h)
        self.attn2 = NodeConditionedAttention(config, h, h)
        self.norm1 = nn.LayerNorm(h)
        self.norm2 = nn.LayerNorm(h)
        self.value_head = nn.Sequential(nn.Linear(h, h // 2), nn.GELU(), nn.Linear(h // 2, 1))
        self.defect_head = nn.Sequential(nn.Linear(h, h // 2), nn.GELU(), nn.Linear(h // 2, config.num_classes))

    @staticmethod
    def adjacency_mask(edge_index: torch.Tensor, num_nodes: int) -> torch.Tensor:
        """Dense [N, N] boolean mask with self-loops from a [2, E] edge_index."""
        if edge_index.ndim != 2 or edge_index.shape[0] != 2:
            raise ValidationError(f"edge_index.shape must be [2, E], got {tuple(edge_index.shape)}")
        if edge_index.numel() > 0 and (int(edge_index.min()) < 0 or int(edge_index.max()) >= num_nodes):
            raise ValidationError("edge_index contains out-of-range node indices")
        mask = torch.zeros(num_nodes, num_nodes, dtype=torch.bool)
        mask[edge_index[0], edge_index[1]] = True
        mask |= torch.eye(num_nodes, dtype=torch.bool)
        return mask

    def _validate_inputs(self, x: torch.Tensor, t_star: torch.Tensor | None) -> None:
        if x.ndim != 3:
            raise ValidationError(f"x must be [B, N, F], got shape {tuple(x.shape)}")
        b, n, f = x.shape
        if n != self.config.num_nodes:
            raise ValidationError(f"expected {self.config.num_nodes} nodes, got {n}")
        if f != self.config.in_features:
            raise ValidationError(f"expected {self.config.in_features} features, got {f}")
        if not torch.isfinite(x).all():
            raise ValidationError("x contains NaN or Inf")
        if x.device != next(self.parameters()).device:
            raise ValidationError(
                f"input device {x.device} != model device {next(self.parameters()).device}; "
                "no silent device movement"
            )
        if t_star is not None:
            if t_star.shape != (b, n):
                raise ValidationError(f"t_star must be [B, N] = [{b}, {n}], got {tuple(t_star.shape)}")
            if not torch.isfinite(t_star).all():
                raise ValidationError("t_star contains NaN or Inf")

    def forward(
        self,
        x: torch.Tensor,  # [B, N, F]
        edge_index: torch.Tensor,  # [2, E]
        t_star: torch.Tensor | None = None,  # [B, N]; None disables TDA modulation
    ) -> ModelOutput:
        self._validate_inputs(x, t_star)
        adj = self.adjacency_mask(edge_index, self.config.num_nodes).to(x.device)

        h1, _ = self.attn1(x, adj, t_star)
        h1 = self.norm1(F.gelu(h1))
        h2, alpha = self.attn2(h1, adj, t_star)
        h2 = self.norm2(F.gelu(h2) + h1)  # residual

        pooled = h2.mean(dim=1)  # [B, H]
        value_pred = self.value_head(pooled).squeeze(-1)
        defect_logits = self.defect_head(pooled)
        return ModelOutput(
            value_pred=value_pred,
            defect_logits=defect_logits,
            node_embeddings=h2,
            t_star=t_star if t_star is not None else torch.zeros(x.shape[0], x.shape[1], device=x.device),
            attention_weights=alpha,
        )

    def regularization(self) -> torch.Tensor:
        return self.attn1.regularization() + self.attn2.regularization()
