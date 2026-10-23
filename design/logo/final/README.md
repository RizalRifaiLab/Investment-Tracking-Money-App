# Nilai logo: usage guide

**Idea:** the second i-dot is bigger than the first, so small amounts become value. Every rupiah counts.
The wordmark is the logo; the two i's (`ıı` with growing dots) are the symbol for icons.

Masters are built by `build.py` (outlined paths, no strokes or live text). Edit there, never by hand.

## Files
| File | Use |
|---|---|
| `nilai-wordmark.svg` | Primary logo, on light backgrounds |
| `nilai-wordmark-reversed.svg` | On ink/dark backgrounds (drawn 2 units thinner against glow) |
| `nilai-wordmark-black.svg`, `wordmark/` | One-colour black, white, red; PNGs at 1200 px |
| `nilai-symbol.svg` | Symbol, 48 px and up |
| `nilai-symbol-small.svg` | Small-size cut for 16–32 px: heavier, the small dot is bigger |
| `web/` | favicon.ico/svg, PNG icons, apple-touch, maskable, `site.webmanifest`, `head-snippet.html` |
| `board.html`, `slides/` | Presentation board with mockups |

## Colour
| | HEX | RGB | Use |
|---|---|---|---|
| Ink | `#201e1d` | 32 30 29 | Letters |
| Accent red | `#ec3013` | 236 48 19 | **Only** the big dot, or the icon tile |
| Paper | `#f3f2f2` | 243 242 242 | Background, reversed letters |

Approximate print match: Pantone 172 C / CMYK 0 85 95 0 (check against a swatch book).
The red is decoration, not text: it's 3.7:1 on paper, so never set small text in it (use accent-700 `#ae1800`).

## Rules
- **Clear space:** the width of the big dot on every side.
- **Minimum size:** wordmark 64 px wide on screen / 15 mm in print; symbol 16 px (use the small cut below 48 px).
- **Backgrounds:** paper, white or ink. On red, use the all-white version.
- Never: recolour the small dot, make both dots the same size, add shadows or gradients, stretch, or retype "nilai" in a font.

Trademark clearance for the name and mark has not been checked. Do a professional search before registering.
