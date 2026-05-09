#!/usr/bin/env python3
"""
Generate a placeholder iOS / Android app icon at assets/icon-only.png.

This is a 1024x1024 opaque PNG with the Grace Flare brand sage-green
background and a white "GF" monogram. Apple applies the rounded corners
on its end, so the source must be a perfect square with no transparency.

Replace this with the real icon master before submitting for App Store
Review — see tasks/todo.md §3.
"""

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

# Match --primary (152 45% 48%) ≈ RGB(67, 177, 126) sage green.
BG = (67, 177, 126)
FG = (255, 255, 255)
SIZE = 1024
TEXT = "GF"

OUT = Path(__file__).resolve().parent.parent / "assets" / "icon-only.png"


def resolve_font():
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
    ]
    for p in candidates:
        if Path(p).exists():
            return p
    return None


def main() -> None:
    img = Image.new("RGB", (SIZE, SIZE), BG)
    draw = ImageDraw.Draw(img)

    font_path = resolve_font()
    font = ImageFont.truetype(font_path, size=int(SIZE * 0.55)) if font_path else ImageFont.load_default()

    bbox = draw.textbbox((0, 0), TEXT, font=font)
    text_w, text_h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (SIZE - text_w) / 2 - bbox[0]
    y = (SIZE - text_h) / 2 - bbox[1]
    draw.text((x, y), TEXT, font=font, fill=FG)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} ({SIZE}x{SIZE})")


if __name__ == "__main__":
    main()
