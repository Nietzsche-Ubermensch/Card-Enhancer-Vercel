from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Dict

from app.services.upscalers import get_upscaler
from app.utils.logger import log


class EnhancementService:

    def enhance_image(
        self,
        input_path: str,
        opts: Dict[str, Any],
        quality: int = 95,
    ) -> str:
        src  = Path(input_path)
        fmt  = opts.get("format", "png")
        out  = src.with_suffix(f".enhanced.{fmt}")
        opts = {**opts, "quality": quality}

        backend = get_upscaler()
        log.info(f"Enhancing {src.name} with {backend.name}")
        t0 = time.time()
        result = backend.enhance(str(src), str(out), opts)
        log.info(f"Done {src.name} in {time.time() - t0:.2f}s")
        return result
