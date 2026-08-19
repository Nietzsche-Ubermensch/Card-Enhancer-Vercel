"""Super-resolution service with truthful fallback metadata."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path

import cv2
import numpy as np

try:
    import torch
except ImportError:  # pragma: no cover - runtime dependency varies in CI
    torch = None  # type: ignore[assignment]

try:
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer
    REAL_ESRGAN_AVAILABLE = True
except ImportError:  # pragma: no cover - runtime dependency varies in CI
    RRDBNet = None  # type: ignore[assignment]
    RealESRGANer = None  # type: ignore[assignment]
    REAL_ESRGAN_AVAILABLE = False


class SRModelType(str, Enum):
    REAL_ESRGAN_X4PLUS = "RealESRGAN_x4plus"
    REAL_ESRNET_X4PLUS = "RealESRNet_x4plus"
    REAL_ESRGAN_X2PLUS = "RealESRGAN_x2plus"


@dataclass
class UpscaleMetadata:
    model: str
    method: str
    requested_scale: int
    actual_scale: int
    used_real_sr: bool
    input_dimensions: tuple[int, int]
    output_dimensions: tuple[int, int]


class RealESRGANService:
    """Loads Real-ESRGAN lazily and falls back to Lanczos when unavailable."""

    MODEL_CONFIGS = {
        SRModelType.REAL_ESRGAN_X4PLUS: {"scale": 4, "filename": "RealESRGAN_x4plus.pth"},
        SRModelType.REAL_ESRNET_X4PLUS: {"scale": 4, "filename": "RealESRNet_x4plus.pth"},
        SRModelType.REAL_ESRGAN_X2PLUS: {"scale": 2, "filename": "RealESRGAN_x2plus.pth"},
    }

    def __init__(self, model_type: SRModelType = SRModelType.REAL_ESRGAN_X4PLUS, weights_dir: str = "weights", tile_size: int = 256, tile_pad: int = 10):
        self.model_type = model_type
        self.weights_dir = Path(weights_dir)
        self.weights_dir.mkdir(parents=True, exist_ok=True)
        self.tile_size = tile_size
        self.tile_pad = tile_pad
        self.device = "cpu"
        if torch is not None and getattr(torch, "cuda", None) and torch.cuda.is_available():
            self.device = "cuda"
        self._upsampler = None

    def load_upscaler(self) -> object | None:
        if self._upsampler is not None:
            return self._upsampler
        if not REAL_ESRGAN_AVAILABLE or torch is None:
            return None
        config = self.MODEL_CONFIGS[self.model_type]
        model_path = self.weights_dir / config["filename"]
        if not model_path.exists():
            return None
        model = RRDBNet(
            num_in_ch=3,
            num_out_ch=3,
            num_feat=64,
            num_block=23,
            num_grow_ch=32,
            scale=config["scale"],
        )
        self._upsampler = RealESRGANer(
            scale=config["scale"],
            model_path=str(model_path),
            model=model,
            tile=self.tile_size,
            tile_pad=self.tile_pad,
            pre_pad=0,
            half=self.device == "cuda",
            device=self.device,
        )
        return self._upsampler

    def upscale_with_fallback(self, image: np.ndarray, outscale: float = 2.0) -> tuple[np.ndarray, bool, UpscaleMetadata]:
        height, width = image.shape[:2]
        requested_scale = max(2, int(round(outscale)))
        upsampler = self.load_upscaler()
        if upsampler is not None:
            try:
                result, _ = upsampler.enhance(cv2.cvtColor(image, cv2.COLOR_RGB2BGR), outscale=requested_scale)
                rgb = cv2.cvtColor(result, cv2.COLOR_BGR2RGB)
                metadata = UpscaleMetadata(
                    model=self.model_type.value,
                    method="real_esrgan",
                    requested_scale=requested_scale,
                    actual_scale=requested_scale,
                    used_real_sr=True,
                    input_dimensions=(width, height),
                    output_dimensions=(rgb.shape[1], rgb.shape[0]),
                )
                return rgb, True, metadata
            except Exception:
                upsampler = None
        resized = cv2.resize(
            image,
            (width * requested_scale, height * requested_scale),
            interpolation=cv2.INTER_LANCZOS4,
        )
        metadata = UpscaleMetadata(
            model=self.model_type.value,
            method="lanczos_fallback",
            requested_scale=requested_scale,
            actual_scale=requested_scale,
            used_real_sr=False,
            input_dimensions=(width, height),
            output_dimensions=(resized.shape[1], resized.shape[0]),
        )
        return resized, False, metadata
