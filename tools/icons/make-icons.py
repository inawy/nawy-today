#!/usr/bin/env python3
"""Draws the app icons from brand.json with the Python standard library only (no image library).

  python3 tools/icons/make-icons.py      writes public/icons/*.png

The mark is our own: a calendar card with a header band and one marked day. Shapes are signed
distance fields, anti-aliased by 3x3 supersampling. Output is committed; re-run only when the
brand colour or the drawing changes.
"""

import json
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "icons"
SS = 3  # supersampling per axis


def hex_rgb(text: str) -> tuple[int, int, int]:
    return int(text[1:3], 16), int(text[3:5], 16), int(text[5:7], 16)


def shade(rgb, k):
    return tuple(max(0, min(255, round(c * k))) for c in rgb)


def rrect(px, py, x0, y0, x1, y1, r):
    """True when (px, py) is inside the rounded rectangle."""
    cx = min(max(px, x0 + r), x1 - r)
    cy = min(max(py, y0 + r), y1 - r)
    return x0 <= px <= x1 and y0 <= py <= y1 and (px - cx) ** 2 + (py - cy) ** 2 <= r * r


def circle(px, py, cx, cy, r):
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r


def render(size: int, accent, *, rounded: bool, glyph_scale: float) -> bytes:
    dark = shade(accent, 0.78)
    white = (255, 255, 255)
    rows = []
    s = glyph_scale

    def g(v):  # map a glyph coordinate (0..1, centred) to the canvas
        return 0.5 + (v - 0.5) * s

    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    px = (x + (sx + 0.5) / SS) / size
                    py = (y + (sy + 0.5) / SS) / size
                    colour = None  # (r, g, b, a)
                    if not rounded or rrect(px, py, 0, 0, 1, 1, 0.22):
                        colour = (*accent, 255)
                        # the card
                        if rrect(px, py, g(0.22), g(0.26), g(0.78), g(0.76), 0.06 * s):
                            colour = (*white, 255)
                            if py < g(0.40):
                                colour = (*dark, 255)  # header band
                            # the marked day
                            if circle(px, py, g(0.62), g(0.62), 0.07 * s):
                                colour = (*accent, 255)
                        # two binding pegs
                        for cx in (0.36, 0.64):
                            if rrect(px, py, g(cx) - 0.02 * s, g(0.20), g(cx) + 0.02 * s, g(0.32), 0.02 * s):
                                colour = (*white, 255)
                    if colour is None:
                        colour = (0, 0, 0, 0)
                    a = colour[3]
                    acc[0] += colour[0] * a
                    acc[1] += colour[1] * a
                    acc[2] += colour[2] * a
                    acc[3] += a
            n = SS * SS
            a = acc[3]
            if a == 0:
                row += bytes([0, 0, 0, 0])
            else:
                row += bytes([round(acc[0] / a), round(acc[1] / a), round(acc[2] / a), round(a / n)])
        rows.append(bytes(row))
    return b"".join(rows)


def png(size: int, raw: bytes) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def main() -> None:
    accent = hex_rgb(json.loads((ROOT / "brand.json").read_text(encoding="utf-8"))["accent"])
    OUT.mkdir(parents=True, exist_ok=True)
    specs = [
        # name, size, rounded corners (transparent), glyph scale
        ("icon-192.png", 192, True, 1.0),
        ("icon-512.png", 512, True, 1.0),
        # Maskable: full-bleed square, glyph inside the 80% safe zone so any mask keeps it whole.
        ("icon-maskable-512.png", 512, False, 0.72),
        # iOS draws its own corners: opaque, full-bleed.
        ("apple-touch-icon.png", 180, False, 0.9),
    ]
    for name, size, rounded, scale in specs:
        data = png(size, render(size, accent, rounded=rounded, glyph_scale=scale))
        (OUT / name).write_bytes(data)
        print(f"wrote public/icons/{name} ({len(data)} bytes)")


if __name__ == "__main__":
    main()
