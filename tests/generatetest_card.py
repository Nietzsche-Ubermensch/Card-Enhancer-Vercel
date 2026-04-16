"""Generate a synthetic card scene for YOLO detector testing.

Produces a card-on-background image so YOLO has contrast to detect against.
A bare card filling the entire frame is the degenerate case — nothing to detect.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def generate_test_card(
    output: Path,
    card_w: int = 400,
    card_h: int = 560,
    bg_w: int = 800,
    bg_h: int = 600,
    rotation: float = 12.0,
    bg_color: tuple[int, int, int] = (45, 55, 72),
    card_color: tuple[int, int, int] = (255, 255, 255),
) -> Path:
    """Create a card scene: white card on dark background, slightly rotated."""
    scene = Image.new("RGB", (bg_w, bg_h), bg_color)

    card = Image.new("RGB", (card_w, card_h), card_color)
    draw = ImageDraw.Draw(card)

    # Border
    draw.rectangle([8, 8, card_w - 9, card_h - 9], outline=(200, 200, 200), width=3)

    # Title area
    draw.rectangle([20, 20, card_w - 20, 80], fill=(230, 230, 240))
    try:
        font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 28
        )
    except OSError:
        font = ImageFont.load_default()
    draw.text((30, 30), "TEST CARD", fill=(60, 60, 60), font=font)

    # Art area
    draw.rectangle([20, 100, card_w - 20, 340], fill=(180, 210, 240))
    draw.ellipse(
        [100, 160, 300, 280], fill=(100, 150, 200), outline=(60, 100, 160), width=2
    )

    # Text box
    draw.rectangle([20, 360, card_w - 20, card_h - 20], fill=(245, 245, 245))
    for y_off in range(370, card_h - 40, 20):
        draw.line([(30, y_off), (card_w - 30, y_off)], fill=(220, 220, 220), width=1)

    # Rotate card and paste onto scene
    rotated = card.rotate(
        rotation, expand=True, resample=Image.BICUBIC, fillcolor=bg_color
    )
    paste_x = (bg_w - rotated.width) // 2
    paste_y = (bg_h - rotated.height) // 2
    scene.paste(rotated, (paste_x, paste_y))

    output.parent.mkdir(parents=True, exist_ok=True)
    scene.save(str(output))
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate test card scene")
    parser.add_argument(
        "-o", "--output", type=Path, default=Path("tests/fixtures/card_scene.png")
    )
    args = parser.parse_args()
    path = generate_test_card(args.output)
    print(f"Generated: {path}")
