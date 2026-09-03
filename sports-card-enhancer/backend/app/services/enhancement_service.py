"""Card enhancement orchestration for rectified card artifacts."""
from __future__ import annotations

import cv2
import numpy as np

from app.models.schemas import DescratchStrength
from app.services.descratch_service import descratch_service
from app.services.real_esrgan_service import RealESRGANService, SRModelType
from app.utils.image_utils import ImageEnhancer


class EnhancementService:
    """Applies upscale and descratch operations to rectified cards."""

    def __init__(self) -> None:
        self.image_enhancer = ImageEnhancer()
        self.sr_service = RealESRGANService(model_type=SRModelType.REAL_ESRGAN_X4PLUS)

    def prepare_rectified(self, image: np.ndarray) -> np.ndarray:
        result = self.image_enhancer.reduce_noise(image, 0.22)
        result = self.image_enhancer.adjust_contrast(result, 0.12)
        result = self.image_enhancer.enhance_details(result, 0.18)
        return self.image_enhancer.sharpen(result, 0.18)

    def upscale_card(self, image: np.ndarray, scale: int) -> tuple[np.ndarray, dict[str, object]]:
        upscaled, _used_sr, metadata = self.sr_service.upscale_with_fallback(image, outscale=float(scale))
        return upscaled, {
            "requested_scale": metadata.requested_scale,
            "actual_scale": metadata.actual_scale,
            "model": metadata.model,
            "method": metadata.method,
            "used_real_sr": metadata.used_real_sr,
            "input_dimensions": metadata.input_dimensions,
            "output_dimensions": metadata.output_dimensions,
        }

    def apply_descratch(self, image: np.ndarray, strength: str) -> tuple[np.ndarray | None, dict[str, object], list[str], bool]:
        result = descratch_service.process(image, strength)
        return result.image, result.metadata, result.warnings, result.success

    def create_descratched_upscaled(self, image: np.ndarray, strength: str, scale: int) -> tuple[np.ndarray | None, dict[str, object], list[str], bool]:
        descratched, descratch_metadata, warnings, success = self.apply_descratch(image, strength)
        if not success or descratched is None:
            return None, descratch_metadata, warnings, False
        upscaled, upscale_metadata = self.upscale_card(descratched, scale)
        combined_metadata = dict(descratch_metadata)
        combined_metadata["upscale"] = upscale_metadata
        return upscaled, combined_metadata, warnings, True

    def reset_to_rectified(self, image: np.ndarray) -> np.ndarray:
        return image.copy()


enhancement_service = EnhancementService()
