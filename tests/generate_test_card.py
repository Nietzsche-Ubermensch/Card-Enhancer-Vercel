"""Generate a synthetic card image for CI testing."""
import argparse
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def make_card(worn: bool = False, seed: int = 42) -> Image.Image:
    rng = random.Random(seed)
    np.random.seed(seed)

    # Base card — white background, coloured border
    img = Image.new("RGB", (200, 280), color=(248, 248, 248))
    draw = ImageDraw.Draw(img)

    # Border
    border_color = (rng.randint(50, 200), rng.randint(50, 200), rng.randint(50, 200))
    draw.rectangle([4, 4, 195, 275], outline=border_color, width=4)

    # Art area
    art_color = (rng.randint(100, 220), rng.randint(100, 220), rng.randint(100, 220))
    draw.rectangle([12, 20, 188, 140], fill=art_color)

    # Title bar
    draw.rectangle([12, 148, 188, 168], fill=(220, 220, 220))
    draw.text((14, 150), "TEST CARD", fill=(30, 30, 30))

    # Text lines
    for i in range(4):
        y = 178 + i * 18
        draw.rectangle([12, y, 188, y + 12], fill=(200, 200, 200))

    if worn:
        arr = np.array(img, dtype=np.float32)
        noise = np.random.normal(0, 12, arr.shape)
        arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
        img = Image.fromarray(arr)
        draw = ImageDraw.Draw(img)
        # Scratches
        for _ in range(6):
            x0, y0 = rng.randint(0, 200), rng.randint(0, 280)
            x1, y1 = x0 + rng.randint(-60, 60), y0 + rng.randint(-60, 60)
            draw.line([(x0, y0), (x1, y1)], fill=(180, 180, 180), width=1)

    return img


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", default="tests/fixtures/test_card.png")
    ap.add_argument("--worn", action="store_true")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    card = make_card(worn=args.worn, seed=args.seed)
    card.save(str(out))
    print(f"Test card saved: {out} ({card.size[0]}x{card.size[1]})")


if __name__ == "__main__":
    main()
