"""Рисует иконки приложения без внешних зависимостей, кроме Pillow."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

BG = (36, 64, 47)
CREAM = (244, 235, 216)
SPINE = (217, 199, 164)
INK = (44, 74, 55)
TERRACOTTA = (192, 106, 68)
MASTER = 2048


def draw_master(scale: float = 1.0) -> Image.Image:
    image = Image.new("RGB", (MASTER, MASTER), BG)
    unit = MASTER / 1024

    def point(x: float, y: float) -> tuple[float, float]:
        return (
            (512 + (x - 512) * scale) * unit,
            (512 + (y - 512) * scale) * unit,
        )

    def box(x0: float, y0: float, x1: float, y1: float) -> list[float]:
        return [*point(x0, y0), *point(x1, y1)]

    shadow = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_box = box(300, 252, 754, 812)
    shadow_draw.rounded_rectangle(
        shadow_box,
        radius=54 * unit * scale,
        fill=(0, 0, 0, 70),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(18 * unit * scale))
    image.paste(shadow, (0, 0), shadow)

    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        box(290, 230, 734, 790),
        radius=46 * unit * scale,
        fill=CREAM,
    )
    draw.rounded_rectangle(
        box(290, 230, 394, 790),
        radius=46 * unit * scale,
        fill=SPINE,
    )
    draw.rectangle(box(390, 252, 394, 768), fill=(196, 176, 139))

    for top in (388, 466, 544):
        draw.rounded_rectangle(
            box(432, top, 668, top + 13),
            radius=7 * unit * scale,
            fill=INK,
        )

    draw.polygon(
        [
            point(600, 230),
            point(666, 230),
            point(666, 438),
            point(633, 404),
            point(600, 438),
        ],
        fill=TERRACOTTA,
    )

    return image


def save(image: Image.Image, target: Path, size: int) -> None:
    image.resize((size, size), Image.Resampling.LANCZOS).save(target, "PNG", optimize=True)
    print(f"{target.name}: {size}x{size}")


def main() -> None:
    target = Path(__file__).resolve().parent.parent / "icons"
    target.mkdir(exist_ok=True)

    standard = draw_master()
    maskable = draw_master(scale=0.78)

    save(standard, target / "icon-192.png", 192)
    save(standard, target / "icon-512.png", 512)
    save(standard, target / "apple-touch-icon.png", 180)
    save(maskable, target / "icon-maskable-512.png", 512)


if __name__ == "__main__":
    main()
