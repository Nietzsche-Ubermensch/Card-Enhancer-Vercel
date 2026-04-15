#!/usr/bin/env python3
"""
Deterministic test card image generator for CI.

Produces a synthetic "trading card" PNG with known properties:
  - Exact 200x300 pixels (standard card aspect ratio ~2:3)
  - Bordered rectangle, title text, gradient fill, serial grid
  - Fully deterministic (no randomness) so CI diffs are meaningful
  - Adds optional synthetic "wear" (noise/scratches) to exercise denoise stages

Usage:
    python tests/generate_test_card.py [--output PATH] [--worn]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


WIDTH, HEIGHT = 200, 300
BORDER = 8
CARD_BG = (30, 30, 50)        # dark navy
GOLD = (218, 165, 32)          # title / border accent
TEXT_COLOR = (240, 240, 240)


def _gradient_fill(draw: ImageDraw.ImageDraw) -> None:
    """Vertical gradient from dark blue to dark purple inside the card."""
    x0, y0 = BORDER, BORDER
    x1, y1 = WIDTH - BORDER, HEIGHT - BORDER
    for y in range(y0, y1):
        t = (y - y0) / (y1 - y0)
        r = int(30 + 40 * t)
        g = int(30 - 10 * t)
        b = int(50 + 60 * t)
        draw.line([(x0, y), (x1, y)], fill=(r, g, b))


def _draw_border(draw: ImageDraw.ImageDraw) -> None:
    """Gold double-border around the card."""
    draw.rectangle([0, 0, WIDTH - 1, HEIGHT - 1], outline=GOLD, width=3)
    draw.rectangle([BORDER - 1, BORDER - 1, WIDTH - BORDER, HEIGHT - BORDER],
                   outline=GOLD, width=1)


def _draw_title(draw: ImageDraw.ImageDraw) -> None:
    """Title text at top of card."""
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 14)
    except OSError:
        font = ImageFont.load_default()
    text = "TEST CARD #001"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    x = (WIDTH - tw) // 2
    draw.text((x, BORDER + 6), text, fill=GOLD, font=font)


def _draw_serial_grid(draw: ImageDraw.ImageDraw) -> None:
    """Grid of tiny numbers to create fine detail the pipeline can upscale."""
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 7)
    except OSError:
        font = ImageFont.load_default()
    y_start = 80
    for row in range(10):
        for col in range(5):
            num = f"{row * 5 + col + 1:03d}"
            x = BORDER + 8 + col * 36
            y = y_start + row * 18
            draw.text((x, y), num, fill=TEXT_COLOR, font=font)


def _draw_color_patches(draw: ImageDraw.ImageDraw) -> None:
    """Small color reference patches at bottom for quality comparison."""
    colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255),
              (255, 255, 0), (255, 0, 255), (0, 255, 255)]
    patch_w = 20
    total = len(colors) * patch_w + (len(colors) - 1) * 4
    x_start = (WIDTH - total) // 2
    y = HEIGHT - BORDER - 28
    for i, c in enumerate(colors):
        x = x_start + i * (patch_w + 4)
        draw.rectangle([x, y, x + patch_w, y + 18], fill=c, outline=GOLD)


def _add_wear(img: Image.Image) -> Image.Image:
    """Add deterministic noise + scratches to simulate a worn card."""
    arr = np.array(img, dtype=np.int16)
    rng = np.random.default_rng(seed=42)
    noise = rng.integers(-15, 16, size=arr.shape, dtype=np.int16)
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr)
    draw = ImageDraw.Draw(img)
    # Deterministic diagonal scratches
    scratches = [
        ((20, 50), (180, 250)),
        ((150, 30), (40, 270)),
        ((100, 10), (100, 290)),
    ]
    for start, end in scratches:
        draw.line([start, end], fill=(200, 200, 200), width=1)
    return img


def generate(output: str | Path, worn: bool = False) -> Path:
    """Generate the test card and return the output path."""
    img = Image.new("RGB", (WIDTH, HEIGHT), CARD_BG)
    draw = ImageDraw.Draw(img)
    _gradient_fill(draw)
    _draw_border(draw)
    _draw_title(draw)
    _draw_serial_grid(draw)
    _draw_color_patches(draw)
    if worn:
        img = _add_wear(img)
    out = Path(output)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(str(out), "PNG")
    print(f"Generated test card: {out}  ({WIDTH}x{HEIGHT}, worn={worn})")
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate deterministic test card image")
    parser.add_argument("--output", "-o", default="tests/fixtures/test_card.png",
                        help="Output file path")
    parser.add_argument("--worn", action="store_true",
                        help="Add synthetic wear (noise + scratches)")
    args = parser.parse_args()
    generate(args.output, args.worn)


if __name__ == "__main__":
    main()
