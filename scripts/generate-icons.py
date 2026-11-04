"""Rebuild original map3d site artwork. Optional dev tool: Python + Pillow.
Run: python scripts/generate-icons.py. No browser, AI image, SVG or remote asset.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, PngImagePlugin
import json

root = Path(__file__).resolve().parent.parent
version = json.loads((root / "package.json").read_text())["version"]
out = root / "public" / "icons" / f"v{version}"
out.mkdir(parents=True, exist_ok=True)
SKY, LAND, FAR, WALL, SIDE, ROOF, SUN = "#dcecf2", "#4b7b62", "#99b79c", "#fff1ce", "#d6c29b", "#b85636", "#f4bf50"
meta = PngImagePlugin.PngInfo()
meta.add_text("Copyright", "Copyright (c) SCOUT SYSTEM")
meta.add_text("Software", f"map3d v{version} - original programmatic artwork")


def artwork(n):
    im = Image.new("RGB", (512, 512), SKY)
    d = ImageDraw.Draw(im)
    d.ellipse((327, 90, 405, 168), fill=SUN)
    d.polygon([(0, 306), (90, 250), (195, 300), (310, 241), (512, 308), (512, 512), (0, 512)], fill=FAR)
    d.polygon([(0, 366), (171, 300), (365, 353), (512, 315), (512, 512), (0, 512)], fill=LAND)
    # Main subject remains in the centre 66% for maskable cropping.
    d.polygon([(128, 326), (340, 309), (387, 366), (175, 390)], fill="#d2d9c2")
    for x, y, w, h in [(160, 307, 58, 87), (234, 330, 72, 135), (320, 310, 43, 65)]:
        d.polygon([(x, y-h), (x+w, y-h), (x+w, y), (x, y)], fill=WALL)
        d.polygon([(x+w, y-h), (x+w+18, y-h-11), (x+w+18, y-11), (x+w, y)], fill=SIDE)
        d.polygon([(x-5, y-h), (x+w/2, y-h-27), (x+w+5, y-h), (x+w+21, y-h-11), (x+w/2+18, y-h-38), (x+13, y-h-11)], fill=ROOF)
        for yy in range(y-h+17, y-10, 26):
            d.rectangle((x+12, yy, x+22, yy+12), fill="#2b596e")
            if w > 50: d.rectangle((x+38, yy, x+48, yy+12), fill="#2b596e")
    return im.resize((n, n), Image.Resampling.LANCZOS)


def save(im, name):
    im.quantize(colors=48).save(out / name, optimize=True, pnginfo=meta)


# Hand-drawn at 16px, not a blurry reduction of the full scene.
small = Image.new("RGB", (16, 16), SKY)
d = ImageDraw.Draw(small)
d.rectangle((0, 11, 15, 15), fill=LAND)
d.ellipse((11, 2, 14, 5), fill=SUN)
d.rectangle((5, 6, 10, 13), fill=WALL)
d.polygon([(4, 6), (7, 3), (11, 6)], fill=ROOF)
d.rectangle((7, 8, 8, 9), fill="#2b596e")
d.rectangle((7, 11, 8, 13), fill="#2b596e")
save(small, "favicon-16.png")
for n, name in [(32, "favicon-32.png"), (180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png"), (192, "icon-maskable-192.png"), (512, "icon-maskable-512.png")]:
    save(artwork(n), name)
# Explicit independent 16/32/48 frames in the ICO.
artwork(48).save(out / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[small, artwork(32)])
og = Image.new("RGB", (1200, 630), SKY)
og.paste(artwork(480), (30, 75))
d = ImageDraw.Draw(og)
try:
    large = ImageFont.truetype("DejaVuSans-Bold.ttf", 72)
    normal = ImageFont.truetype("DejaVuSans.ttf", 27)
    fine = ImageFont.truetype("DejaVuSans.ttf", 22)
except OSError:
    large, normal, fine = ImageFont.load_default(size=72), ImageFont.load_default(size=27), ImageFont.load_default(size=22)
d.text((560, 170), "map3d", fill="#183c4f", font=large)
for y, text in [(275, "Real-world maps. In 3D."), (320, "Buildings / Terrain / GPX"), (365, "Plan, explore and export.")]:
    d.text((560, y), text, fill="#294f61", font=normal)
d.text((560, 478), f"v{version}  /  Copyright SCOUT SYSTEM", fill="#294f61", font=fine)
save(og, "og-image.png")
print(f"9 versioned PNG/ICO assets: {sum(f.stat().st_size for f in out.iterdir()):,} bytes")
