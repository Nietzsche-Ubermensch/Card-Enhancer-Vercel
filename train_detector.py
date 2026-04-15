#!/usr/bin/env python3
"""
Fine-tune YOLO11n-OBB on a card dataset.

Usage:
    # With a Roboflow dataset URL:
    python train_detector.py --data "https://universe.roboflow.com/ds/YOUR_EXPORT_URL"

    # With a local dataset YAML:
    python train_detector.py --data path/to/data.yaml

    # Adjust training params:
    python train_detector.py --data data.yaml --epochs 80 --batch 8 --device cpu

The best weights are automatically copied to models/card_detector_obb.pt
so the app picks them up without any config changes.
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from ultralytics import YOLO


def main() -> None:
    parser = argparse.ArgumentParser(description="Train YOLO11-OBB card detector")
    parser.add_argument("--data", required=True,
                        help="Roboflow export URL or local data.yaml path")
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--device", default="0",
                        help="'0' for GPU, 'cpu' for CPU")
    parser.add_argument("--patience", type=int, default=15,
                        help="Early stop patience (epochs without improvement)")
    parser.add_argument("--base-model", default="yolo11n-obb.pt",
                        help="Pretrained base model")
    args = parser.parse_args()

    model = YOLO(args.base_model)

    results = model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=int(args.device) if args.device.isdigit() else args.device,
        project="runs/card_obb",
        name="v1",
        patience=args.patience,
        augment=True,
        degrees=15,      # random rotation ±15° — tilted card photos
        fliplr=0.0,      # no horizontal flip — card text direction matters
        mosaic=0.5,
    )

    # Copy best weights to the location the app expects
    best_weights = Path("runs/card_obb/v1/weights/best.pt")
    dest = Path("models/card_detector_obb.pt")
    dest.parent.mkdir(parents=True, exist_ok=True)

    if best_weights.exists():
        shutil.copy(best_weights, dest)
        print(f"\nBest weights saved to {dest}")
        print("The app will automatically use these on next startup.")
    else:
        print(f"\nWarning: {best_weights} not found — check training output above")


if __name__ == "__main__":
    main()
