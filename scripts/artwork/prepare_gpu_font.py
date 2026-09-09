"""Expose recovered glyph variants as codepoints for worker-side rasterizing."""

from pathlib import Path

from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "public" / "fonts" / "planet.woff2"
OUTPUT = ROOT / "public" / "fonts" / "planet-gpu.woff2"


def main() -> None:
    font = TTFont(SOURCE)
    for table in font["cmap"].tables:
        if not table.isUnicode():
            continue
        for index in range(60):
            table.cmap[0xE000 + index] = f"variant{index}"
    font.flavor = "woff2"
    font.save(OUTPUT)


if __name__ == "__main__":
    main()
