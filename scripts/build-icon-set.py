#!/usr/bin/env python3
"""
Generate the iOS AppIcon.appiconset and Android mipmap-* sets from the
1024x1024 master at assets/icon.png.

Output layout (matches @capacitor/assets v3 conventions, which is what the
Codemagic step "Copy app icons into iOS project" expects):

  assets/icon.png                                (1024x1024 master, opaque)
  assets/ios/AppIcon.appiconset/
      Contents.json
      AppIcon-20.png ... AppIcon-512@2x.png       (15 PNGs)
  assets/android/mipmap-{m,h,x,xx,xxx}hdpi/
      ic_launcher.png
      ic_launcher_round.png

Re-run this whenever assets/icon.png changes. The output is fully derived
from the master, so commit the generated tree alongside the master.

iOS: opaque RGB, no alpha (Apple rejects icons with transparency).
Android: RGBA. ic_launcher_round masked to a circle.
"""

from PIL import Image, ImageDraw
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "assets" / "icon.png"

IOS_OUT = ROOT / "assets" / "ios" / "AppIcon.appiconset"
ANDROID_OUT = ROOT / "assets" / "android"

# (filename, pixel_size, idiom, size_string, scale)
IOS_ICONS = [
    ("AppIcon-20.png",       20,  "ipad",      "20x20",     "1x"),
    ("AppIcon-20@2x.png",    40,  "iphone",    "20x20",     "2x"),
    ("AppIcon-20@2x.png",    40,  "ipad",      "20x20",     "2x"),
    ("AppIcon-20@3x.png",    60,  "iphone",    "20x20",     "3x"),
    ("AppIcon-29.png",       29,  "ipad",      "29x29",     "1x"),
    ("AppIcon-29@2x.png",    58,  "iphone",    "29x29",     "2x"),
    ("AppIcon-29@2x.png",    58,  "ipad",      "29x29",     "2x"),
    ("AppIcon-29@3x.png",    87,  "iphone",    "29x29",     "3x"),
    ("AppIcon-40.png",       40,  "ipad",      "40x40",     "1x"),
    ("AppIcon-40@2x.png",    80,  "iphone",    "40x40",     "2x"),
    ("AppIcon-40@2x.png",    80,  "ipad",      "40x40",     "2x"),
    ("AppIcon-40@3x.png",    120, "iphone",    "40x40",     "3x"),
    ("AppIcon-60@2x.png",    120, "iphone",    "60x60",     "2x"),
    ("AppIcon-60@3x.png",    180, "iphone",    "60x60",     "3x"),
    ("AppIcon-76.png",       76,  "ipad",      "76x76",     "1x"),
    ("AppIcon-76@2x.png",    152, "ipad",      "76x76",     "2x"),
    ("AppIcon-83.5@2x.png",  167, "ipad",      "83.5x83.5", "2x"),
    ("AppIcon-512@2x.png",   1024, "ios-marketing", "1024x1024", "1x"),
]

ANDROID_DENSITIES = {
    "mipmap-mdpi":    48,
    "mipmap-hdpi":    72,
    "mipmap-xhdpi":   96,
    "mipmap-xxhdpi":  144,
    "mipmap-xxxhdpi": 192,
}


def load_master() -> Image.Image:
    img = Image.open(MASTER)
    if img.size != (1024, 1024):
        raise SystemExit(f"master must be 1024x1024, got {img.size}")
    return img


def save_ios(master: Image.Image) -> None:
    IOS_OUT.mkdir(parents=True, exist_ok=True)
    # Force opaque RGB — iOS rejects alpha in app icons.
    if master.mode != "RGB":
        flat = Image.new("RGB", master.size, (255, 255, 255))
        flat.paste(master, mask=master.split()[-1] if master.mode == "RGBA" else None)
        src = flat
    else:
        src = master

    written = set()
    for filename, size, _idiom, _sz, _scale in IOS_ICONS:
        if filename in written:
            continue
        out = IOS_OUT / filename
        src.resize((size, size), Image.LANCZOS).save(out, "PNG", optimize=True)
        written.add(filename)
        print(f"  ios {filename} ({size}x{size})")

    contents = {
        "images": [
            {"size": sz, "idiom": idiom, "filename": fn, "scale": scale}
            for fn, _px, idiom, sz, scale in IOS_ICONS
        ],
        "info": {"version": 1, "author": "xcode"},
    }
    (IOS_OUT / "Contents.json").write_text(json.dumps(contents, indent=2) + "\n")
    print(f"  ios Contents.json ({len(IOS_ICONS)} entries, {len(written)} unique files)")


def circle_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size, size), fill=255)
    return mask


def save_android(master: Image.Image) -> None:
    src = master.convert("RGBA")
    for folder, size in ANDROID_DENSITIES.items():
        out_dir = ANDROID_OUT / folder
        out_dir.mkdir(parents=True, exist_ok=True)

        scaled = src.resize((size, size), Image.LANCZOS)
        scaled.save(out_dir / "ic_launcher.png", "PNG", optimize=True)

        round_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        round_img.paste(scaled, (0, 0), mask=circle_mask(size))
        round_img.save(out_dir / "ic_launcher_round.png", "PNG", optimize=True)

        print(f"  android {folder}/ ({size}x{size}, square + round)")


def main() -> None:
    master = load_master()
    print(f"master: {MASTER} ({master.size}, mode={master.mode})")
    save_ios(master)
    save_android(master)
    print("done.")


if __name__ == "__main__":
    main()
