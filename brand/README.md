# CrossSign — logo & brand assets

Generated from the mark already used by the app (`components/layout/Logo.tsx`) and the
app's own tailwind tokens, so the logo and the product agree.

## Concept
A signature stroke crosses a chain boundary and resolves into a tick.
- **dashed seam** — the chain boundary
- **filled dot** — the origin wallet (Solana)
- **ink wave** — the signed challenge crossing that boundary
- **accent tick** (`#00B3A4`) — verification on Arbitrum

## Colours
| Token | Hex | Use |
|---|---|---|
| Ink | `#16171C` | wordmark, wave, dark backgrounds |
| Accent | `#00B3A4` | the tick only — never the whole mark |
| Paper | `#F6F5F1` | light backgrounds |
| Line | `#E7E5DE` | hairlines, paper-tile border |

Wordmark is **outlined from Geist SemiBold** (the app's UI font) — the files carry no font dependency.

## Which file to use
| Need | File |
|---|---|
| Anything on a light background | `svg/crosssign-lockup-horizontal.svg` |
| Dark background | `svg/crosssign-lockup-horizontal-dark-bg.svg` |
| Square / avatar / tight space | `svg/crosssign-lockup-stacked.svg` |
| Just the symbol | `svg/crosssign-mark.svg` |
| App icon, favicon, PWA | `svg/crosssign-app-icon.svg` (+ `png/app-icon-1024.png`, `-512`, `-192`, `-180`, `-64`, `-32`) |
| 16px favicon | `svg/crosssign-favicon.svg` (`png/favicon-16.png`, `-32`, `-48`) |
| Legacy favicon | `crosssign-favicon.ico` (16/32/48) |
| Social / OpenGraph / HackQuest cover | `png/og-card-1200.png` (1200×630), `svg/crosssign-og-card.svg` |
| One-page overview | `png/logo-system-1600.png` |
| Single-colour print / stamp | `svg/crosssign-mark-mono.svg`, `-mono-reversed.svg` |

All SVGs are hand-editable text; PNGs are rendered at the sizes named in the filenames.

## Usage rules
- **Clear space:** keep at least half the mark's height on all sides.
- **Minimum size:** lockup 120px wide; mark 16px; below 24px use `crosssign-favicon.svg` (the reduced form).
- **Don't:** recolour the tick to ink on light backgrounds, rotate, outline, add gradients/shadows, or place the light lockup on mid-tone backgrounds (use the dark-background version).

## Regenerating
`_source/make-logo.mjs` rebuilds every file here, including the outlined wordmark and all raster sizes:

```bash
mkdir -p /tmp/brandgen && cd /tmp/brandgen
npm init -y && npm install @resvg/resvg-js opentype.js geist
cp /path/to/brand/_source/make-logo.mjs .
node make-logo.mjs          # writes into <repo>/brand/
```

Requires Node 18+. `@resvg/resvg-js` does the rendering, `opentype.js` outlines the
wordmark from `geist`'s Geist-SemiBold.ttf, and the SVG sources stay hand-editable.
