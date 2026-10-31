# Icon assets

Google Material Symbols, Outlined, 24px (D-080; the Nawy design system's icon source, ADR 0002).

- Upstream: https://github.com/google/material-design-icons
- Path pattern: `symbols/web/<name>/materialsymbolsoutlined/<name>_24px.svg`
- License: Apache License 2.0 (see `LICENSE` in this directory)

| File | Used by (`src/ui/shell/Icons.tsx`) |
| --- | --- |
| `menu.svg` | `MenuIcon` |
| `chevron_right.svg` | `ChevronIcon` (mirrored by CSS in RTL) |
| `close.svg` | `CloseIcon` |
| `add.svg` | `PlusIcon` |
| `calendar_view_month.svg` | `ViewsIcon` |
| `search.svg` | `SearchIcon` |
| `edit.svg` | `EditIcon` |

The components embed the same `path` data unchanged (no `vite-plugin-svgr`: no new dependency),
with `fill="currentColor"` and `aria-hidden`. These `.svg` files are the vendored originals,
kept for attribution and for adding the next icon the same way.
