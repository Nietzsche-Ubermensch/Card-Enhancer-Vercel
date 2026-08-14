"""Multi-task training: L = w_v * L_value + w_d * L_defect + w_r * L_reg.

Value regression uses Huber or MSE. Defect classification uses CrossEntropy
(labels are mutually exclusive multiclass per the repository data contract).
Loss components are returned individually. Non-finite losses abort training
with a typed error. Supports deterministic seeding, splits, clipping,
accumulation, early stopping, checkpointing, and resume.
"""

from __future__ import annotations

import math
import uuid

import torch
from torch import nn
from torch.utils.data import DataLoader, Subset

from dcpt_pipeline.config import DCPTConfig
from dcpt_pipeline.models.dcpt_model import DCPTModel
from dcpt_pipeline.schemas import TrainingMetrics, ValidationError
from dcpt_pipeline.training.checkpoint import save_checkpoint
from dcpt_pipeline.utils.data_utils import CardDataset, dataset_fingerprint
from dcpt_pipeline.utils.logging import get_logger
from dcpt_pipeline.utils.seeding import seed_everything

logger = get_logger(__name__)


class NonFiniteLossError(RuntimeError):
    """Raised when the training loss becomes NaN or Inf."""


def regression_metrics(preds: torch.Tensor, targets: torch.Tensor) -> dict[str, float]:
    err = preds - targets
    mae = float(err.abs().mean())
    rmse = float(err.pow(2).mean().sqrt())
    ss_res = float(err.pow(2).sum())
    ss_tot = float((targets - targets.mean()).pow(2).sum())
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
    return {"mae": mae, "rmse": rmse, "r2": r2}


def classification_metrics(logits: torch.Tensor, labels: torch.Tensor, num_classes: int) -> dict[str, float]:
    preds = logits.argmax(dim=-1)
    accuracy = float((preds == labels).float().mean())
    precisions, recalls, f1s = [], [], []
    for c in range(num_classes):
        tp = float(((preds == c) & (labels == c)).sum())
        fp = float(((preds == c) & (labels != c)).sum())
        fn = float(((preds != c) & (labels == c)).sum())
        p = tp / (tp + fp) if tp + fp > 0 else 0.0
        r = tp / (tp + fn) if tp + fn > 0 else 0.0
        f = 2 * p * r / (p + r) if p + r > 0 else 0.0
        precisions.append(p)
        recalls.append(r)
        f1s.append(f)
    k = num_classes
    return {
        "accuracy": accuracy,
        "precision": sum(precisions) / k,
        "recall": sum(recalls) / k,
        "f1": sum(f1s) / k,
    }


class MultiTaskTrainer:
    """Production training loop for the DCPT model."""

    def __init__(self, config: DCPTConfig, dataset: CardDataset):
        self.config = config
        tcfg = config.training
        if tcfg.device not in {"cpu", "cuda"}:
            raise ValidationError(f"unsupported device: {tcfg.device!r}")
        if tcfg.device == "cuda" and not torch.cuda.is_available():
            raise ValidationError("device=cuda requested but CUDA is not available")
        seed_everything(tcfg.seed)

        self.device = torch.device(tcfg.device)
        self.dataset = dataset
        self.edge_index = dataset.edge_index
        self.run_id = uuid.uuid4().hex[:12]
        self.dataset_fp = dataset_fingerprint(dataset.samples)

        n = len(dataset)
        n_test = max(1, int(n * tcfg.test_split))
        n_val = max(1, int(n * tcfg.val_split))
        n_train = n - n_val - n_test
        if n_train < 1:
            raise ValidationError(f"dataset too small for configured splits: {n} samples")
        gen = torch.Generator().manual_seed(tcfg.seed)
        perm = torch.randperm(n, generator=gen).tolist()
        self.train_set = Subset(dataset, perm[:n_train])
        self.val_set = Subset(dataset, perm[n_train : n_train + n_val])
        self.test_set = Subset(dataset, perm[n_train + n_val :])

        self.model = DCPTModel(config.model).to(self.device)
        self.optimizer = torch.optim.AdamW(
            self.model.parameters(), lr=tcfg.learning_rate, weight_decay=tcfg.weight_decay
        )
        self.scheduler = (
            torch.optim.lr_scheduler.CosineAnnealingLR(self.optimizer, T_max=tcfg.epochs)
            if tcfg.scheduler == "cosine"
            else None
        )
        self.value_criterion: nn.Module = nn.HuberLoss() if tcfg.value_loss == "huber" else nn.MSELoss()
        self.defect_criterion = nn.CrossEntropyLoss()
        self.history: list[TrainingMetrics] = []
        self.start_epoch = 0

    def _compute_losses(self, batch: dict[str, torch.Tensor]) -> dict[str, torch.Tensor]:
        x = batch["x"].to(self.device)
        t_star = batch["t_star"].to(self.device)
        prices = batch["price"].to(self.device)
        labels = batch["label"].to(self.device)
        out = self.model(x, self.edge_index, t_star)
        # Log-scale value regression stabilizes wide price ranges.
        value_loss = self.value_criterion(out.value_pred, torch.log1p(prices))
        defect_loss = self.defect_criterion(out.defect_logits, labels)
        reg_loss = self.model.regularization()
        tcfg = self.config.training
        total = tcfg.value_weight * value_loss + tcfg.defect_weight * defect_loss + tcfg.reg_weight * reg_loss
        return {"total": total, "value": value_loss, "defect": defect_loss, "reg": reg_loss}

    @torch.no_grad()
    def evaluate(self, subset: Subset) -> dict[str, float]:
        self.model.eval()
        loader = DataLoader(subset, batch_size=self.config.training.batch_size)
        all_preds, all_prices, all_logits, all_labels, losses = [], [], [], [], []
        for batch in loader:
            x = batch["x"].to(self.device)
            t_star = batch["t_star"].to(self.device)
            out = self.model(x, self.edge_index, t_star)
            all_preds.append(torch.expm1(out.value_pred).cpu())
            all_prices.append(batch["price"])
            all_logits.append(out.defect_logits.cpu())
            all_labels.append(batch["label"])
            losses.append(
                float(
                    self.value_criterion(out.value_pred.cpu(), torch.log1p(batch["price"]))
                    + self.defect_criterion(out.defect_logits.cpu(), batch["label"])
                )
            )
        preds, prices = torch.cat(all_preds), torch.cat(all_prices)
        logits, labels = torch.cat(all_logits), torch.cat(all_labels)
        return {
            "loss": sum(losses) / len(losses),
            **regression_metrics(preds, prices),
            **classification_metrics(logits, labels, self.config.model.num_classes),
        }

    def train(self, checkpoint_path: str | None = None) -> list[TrainingMetrics]:
        tcfg = self.config.training
        loader = DataLoader(
            self.train_set,
            batch_size=tcfg.batch_size,
            shuffle=True,
            generator=torch.Generator().manual_seed(tcfg.seed),
        )
        best_val = math.inf
        patience = 0
        for epoch in range(self.start_epoch, tcfg.epochs):
            self.model.train()
            sums = {"total": 0.0, "value": 0.0, "defect": 0.0, "reg": 0.0}
            batches = 0
            self.optimizer.zero_grad()
            for step, batch in enumerate(loader):
                losses = self._compute_losses(batch)
                if not torch.isfinite(losses["total"]):
                    raise NonFiniteLossError(f"non-finite loss at epoch {epoch}, step {step}")
                (losses["total"] / tcfg.grad_accumulation_steps).backward()
                if (step + 1) % tcfg.grad_accumulation_steps == 0:
                    nn.utils.clip_grad_norm_(self.model.parameters(), tcfg.grad_clip_norm)
                    self.optimizer.step()
                    self.optimizer.zero_grad()
                for k in sums:
                    sums[k] += float(losses[k])
                batches += 1
            if self.scheduler:
                self.scheduler.step()

            val = self.evaluate(self.val_set)
            metrics = TrainingMetrics(
                epoch=epoch,
                total_loss=sums["total"] / batches,
                value_loss=sums["value"] / batches,
                defect_loss=sums["defect"] / batches,
                reg_loss=sums["reg"] / batches,
                val_total_loss=val["loss"],
                val_mae=val["mae"],
                val_rmse=val["rmse"],
                val_r2=val["r2"],
                val_accuracy=val["accuracy"],
                val_precision=val["precision"],
                val_recall=val["recall"],
                val_f1=val["f1"],
            )
            self.history.append(metrics)
            logger.info(
                f"epoch={epoch} total={metrics.total_loss:.4f} val_loss={val['loss']:.4f} "
                f"val_acc={val['accuracy']:.3f}",
                extra={"run_id": self.run_id},
            )

            if val["loss"] < best_val:
                best_val = val["loss"]
                patience = 0
                if checkpoint_path:
                    save_checkpoint(
                        checkpoint_path,
                        self.model,
                        self.config,
                        epoch,
                        {k: float(v) for k, v in val.items()},
                        run_id=self.run_id,
                        dataset_fingerprint=self.dataset_fp,
                        optimizer=self.optimizer,
                        scheduler=self.scheduler,
                    )
            else:
                patience += 1
                if patience >= tcfg.early_stopping_patience:
                    logger.info(f"early stopping at epoch {epoch}", extra={"run_id": self.run_id})
                    break
        return self.history

    def resume(self, payload: dict) -> None:
        """Resume compatible training from a validated checkpoint payload."""
        self.model.load_state_dict(payload["model_state_dict"])
        if payload.get("optimizer_state_dict"):
            self.optimizer.load_state_dict(payload["optimizer_state_dict"])
        if payload.get("scheduler_state_dict") and self.scheduler:
            self.scheduler.load_state_dict(payload["scheduler_state_dict"])
        self.start_epoch = int(payload["epoch"]) + 1
