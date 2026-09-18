/**
 * CrossSign logo system generator  →  crosssign/brand/
 *
 * Concept (an evolution of the mark already shipped in components/layout/Logo.tsx):
 * a signature stroke crosses a chain boundary and resolves into a verified tick.
 *   · dashed seam        = the chain boundary
 *   · filled dot         = origin wallet (Solana)
 *   · ink signature wave = the signed challenge crossing the boundary
 *   · accent tick        = verification on Arbitrum
 *
 * Palette = the app's own tailwind tokens (#16171C ink, #F6F5F1 paper, #00B3A4 accent).
 * Wordmark is outlined from Geist-SemiBold (the app's UI font) so the output files
 * carry no font dependency.
 *
 * Requires: @resvg/resvg-js, opentype.js, geist   (see brand/_source/README.md)
 * Run:      node make-logo.mjs
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import opentype from "opentype.js";
import { Resvg } from "@resvg/resvg-js";

const OUT = "/home/user/crosssign/brand";
const FONT_DIR = "/home/user/brand-tools/node_modules/geist/dist/fonts/geist-sans";
const FONT = `${FONT_DIR}/Geist-SemiBold.ttf`;
const FONT_MED = `${FONT_DIR}/Geist-Medium.ttf`;

const INK = "#16171C";
const PAPER = "#F6F5F1";
const ACCENT = "#00B3A4";
const LINE = "#E7E5DE";
const MUTED = "#7A7F89";
const FAINT = "#A7ABB3";
const SEAM_LIGHT = ".22";
const SEAM_DARK = ".16";

mkdirSync(`${OUT}/png`, { recursive: true });
mkdirSync(`${OUT}/svg`, { recursive: true });

/* ───────────────────────────── wordmark (outlined) ───────────────────────── */

function loadFont(file) {
  const buf = readFileSync(file);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}
const font = loadFont(FONT);

/** Outline text to SVG path data; caps extend upward (negative y) from baseline 0. */
function outline(text, capHeight, tracking = -0.006) {
  const H = font.charToGlyph("H").getPath(0, 0, font.unitsPerEm).getBoundingBox();
  const size = (capHeight * font.unitsPerEm) / (H.y2 - H.y1);
  const track = tracking * size;
  let x = 0;
  const parts = [];
  for (const ch of text) {
    const g = font.charToGlyph(ch);
    parts.push(g.getPath(x, 0, size).toPathData(2));
    x += (g.advanceWidth / font.unitsPerEm) * size + track;
  }
  return { d: parts.join(" "), width: x - track, capHeight };
}

const CAP = 25.5;
const WORD = outline("CROSSSIGN", CAP);
const WM_BASELINE = 32 + CAP / 2;
const MARK_W = 64;
const GAP = 19;
const LOCKUP_W = MARK_W + GAP + WORD.width;

/* ───────────────────────────────── glyphs ───────────────────────────────── */

const primaryMark = ({ ink = INK, accent = ACCENT, seam = SEAM_LIGHT } = {}) => `
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M32 11V53" stroke="${ink}" stroke-opacity="${seam}" stroke-width="1.4" stroke-dasharray="3 4.6"/>
    <circle cx="13" cy="32" r="3" fill="${ink}"/>
    <path d="M18 32c4-5 6.6-5 9.2 0s5.2 5 9.2 0" stroke="${ink}" stroke-width="3.4"/>
    <path d="M39.5 33.2 43.7 37.4 53.1 25.8" stroke="${accent}" stroke-width="3.6"/>
  </g>`;

const monoMark = ({ ink = INK, seam = SEAM_LIGHT } = {}) => `
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M32 11V53" stroke="${ink}" stroke-opacity="${seam}" stroke-width="1.4" stroke-dasharray="3 4.6"/>
    <circle cx="13" cy="32" r="3" fill="${ink}"/>
    <path d="M18 32c4-5 6.6-5 9.2 0s5.2 5 9.2 0" stroke="${ink}" stroke-width="3.4"/>
    <path d="M39.5 33.2 43.7 37.4 53.1 25.8" stroke="${ink}" stroke-width="3.6"/>
  </g>`;

/** App icon: reduced to wave + tick so it survives 32px. */
const iconTile = ({ bg = INK, fg = PAPER, accent = ACCENT, seam = SEAM_DARK, rx = 15 } = {}) => `
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <rect x="0" y="0" width="64" height="64" rx="${rx}" fill="${bg}"/>
    <path d="M32 12V52" stroke="${fg}" stroke-opacity="${seam}" stroke-width="1.6" stroke-dasharray="3 4.6"/>
    <path d="M13 32c4.6-5.6 7.6-5.6 10.6 0s6 5.6 10.6 0" stroke="${fg}" stroke-width="3.8"/>
    <path d="M37 33 41.8 37.8 52.4 24.8" stroke="${accent}" stroke-width="4"/>
  </g>`;

const paperTile = ({ bg = PAPER, fg = INK, accent = ACCENT, seam = SEAM_LIGHT, rx = 15 } = {}) => `
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <rect x="0" y="0" width="64" height="64" rx="${rx}" fill="${bg}" stroke="${LINE}"/>
    <path d="M32 12V52" stroke="${fg}" stroke-opacity="${seam}" stroke-width="1.6" stroke-dasharray="3 4.6"/>
    <path d="M13 32c4.6-5.6 7.6-5.6 10.6 0s6 5.6 10.6 0" stroke="${fg}" stroke-width="3.8"/>
    <path d="M37 33 41.8 37.8 52.4 24.8" stroke="${accent}" stroke-width="4"/>
  </g>`;

/** Micro form for 16–24px: a bold tick crossing the seam. */
const microTile = ({ bg = INK, accent = ACCENT, seam = PAPER } = {}) => `
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <rect x="0" y="0" width="64" height="64" rx="15" fill="${bg}"/>
    <path d="M32 12V52" stroke="${seam}" stroke-opacity="${SEAM_DARK}" stroke-width="2" stroke-dasharray="3.5 5"/>
    <path d="M15 33 25.4 43.4 50 20" stroke="${accent}" stroke-width="6.5"/>
  </g>`;

/* ─────────────────────────────── wrappers ───────────────────────────────── */

const wrap = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="none" role="img" aria-label="CrossSign">\n${body}\n</svg>\n`;

const lockupHorizontal = (o) => ({
  w: Math.ceil(LOCKUP_W),
  h: 64,
  body: `<g>${primaryMark(o)}</g>
  <g transform="translate(${MARK_W + GAP} ${WM_BASELINE})"><path d="${WORD.d}" fill="${o.ink}"/></g>`,
});

const lockupStacked = (o) => {
  const w = Math.max(MARK_W, WORD.width);
  return {
    w: Math.ceil(w),
    h: Math.ceil(64 + 10 + CAP + 16),
    body: `<g transform="translate(${((w - MARK_W) / 2).toFixed(2)} 0)">${primaryMark(o)}</g>
  <g transform="translate(${((w - WORD.width) / 2).toFixed(2)} ${WM_BASELINE + 74})"><path d="${WORD.d}" fill="${o.ink}"/></g>`,
  };
};

/* ─────────────────────────────────── files ──────────────────────────────── */

const simple = {
  "svg/crosssign-mark.svg": wrap(64, 64, primaryMark({})),
  "svg/crosssign-mark-dark-bg.svg": wrap(64, 64, primaryMark({ ink: PAPER, seam: SEAM_DARK })),
  "svg/crosssign-mark-mono.svg": wrap(64, 64, monoMark({})),
  "svg/crosssign-mark-mono-reversed.svg": wrap(64, 64, monoMark({ ink: "#FFFFFF", seam: SEAM_DARK })),
  "svg/crosssign-app-icon.svg": wrap(64, 64, iconTile({})),
  "svg/crosssign-app-icon-paper.svg": wrap(64, 64, paperTile({})),
  "svg/crosssign-favicon.svg": wrap(64, 64, microTile({})),
};
for (const [rel, content] of Object.entries(simple)) writeFileSync(`${OUT}/${rel}`, content);

for (const [rel, o] of [
  ["svg/crosssign-lockup-horizontal.svg", { ink: INK, seam: SEAM_LIGHT }],
  ["svg/crosssign-lockup-horizontal-dark-bg.svg", { ink: PAPER, seam: SEAM_DARK }],
  ["svg/crosssign-lockup-horizontal-mono.svg", { ink: INK, seam: SEAM_LIGHT, accent: INK }],
]) {
  const { body, w, h } = lockupHorizontal(o);
  writeFileSync(`${OUT}/${rel}`, wrap(w, h, body));
}
{
  const { body, w, h } = lockupStacked({ ink: INK, seam: SEAM_LIGHT });
  writeFileSync(`${OUT}/svg/crosssign-lockup-stacked.svg`, wrap(w, h, body));
}

/* ────────────────────────── presentation sheet ──────────────────────────── */

const sheet = (() => {
  const W = 1600;
  const H = 1120;
  const parts = [];
  const P = (s) => parts.push(s);
  const label = (x, y, t) =>
    P(`<text x="${x}" y="${y}" font-family="Geist" font-size="12.5" letter-spacing="2.2" fill="${FAINT}">${t}</text>`);
  const lockupAt = (x, y, scale, ink, seam) => {
    P(`<g transform="translate(${x} ${y}) scale(${scale})">${primaryMark({ ink, seam })}</g>`);
    P(`<g transform="translate(${x + (MARK_W + GAP) * scale} ${y + WM_BASELINE * scale}) scale(${scale})"><path d="${WORD.d}" fill="${ink}"/></g>`);
  };

  P(`<rect width="${W}" height="${H}" fill="${PAPER}"/>`);
  P(`<text x="80" y="112" font-family="Geist" font-size="42" font-weight="600" letter-spacing="-1" fill="${INK}">CrossSign</text>`);
  P(`<text x="80" y="144" font-family="Geist" font-size="17" fill="${MUTED}">Logo system · identity across chains · Arbitrum Stylus</text>`);

  label(80, 216, "PRIMARY LOCKUP");
  P(`<rect x="64" y="236" width="800" height="250" rx="18" fill="#FCFCFA" stroke="${LINE}"/>`);
  lockupAt(112, 316, 1.75, INK, SEAM_LIGHT);

  label(80, 556, "ON CHARCOAL");
  P(`<rect x="64" y="576" width="800" height="250" rx="18" fill="${INK}"/>`);
  lockupAt(112, 656, 1.75, PAPER, SEAM_DARK);

  label(920, 216, "APP ICON · 512 / 180 / 64 / 32");
  P(`<g transform="translate(920 244) scale(3.2)">${iconTile({})}</g>`);
  P(`<g transform="translate(1140 244) scale(1.7)">${paperTile({})}</g>`);
  P(`<g transform="translate(1272 244) scale(0.9)">${iconTile({})}</g>`);
  P(`<g transform="translate(1344 244) scale(0.62)">${iconTile({})}</g>`);
  P(`<g transform="translate(1404 244) scale(0.5)">${microTile({})}</g>`);

  label(920, 496, "MONOCHROME");
  P(`<rect x="904" y="516" width="288" height="180" rx="18" fill="#FCFCFA" stroke="${LINE}"/>`);
  P(`<g transform="translate(946 580) scale(1.45)">${monoMark({})}</g>`);
  P(`<rect x="1220" y="516" width="288" height="180" rx="18" fill="${INK}"/>`);
  P(`<g transform="translate(1262 580) scale(1.45)">${monoMark({ ink: PAPER, seam: SEAM_DARK })}</g>`);

  label(920, 756, "STACKED");
  P(`<rect x="904" y="776" width="288" height="200" rx="18" fill="#FCFCFA" stroke="${LINE}"/>`);
  P(`<g transform="translate(1050.4 806) scale(1.05)">${primaryMark({})}</g>`);
  {
    const s = 0.6;
    P(`<g transform="translate(${(1048 - (WORD.width * s) / 2).toFixed(1)} 919.6) scale(${s})"><path d="${WORD.d}" fill="${INK}"/></g>`);
  }

  label(1220, 756, "PALETTE");
  const sw = (x, y, fill, hex, stroke = "none") =>
    `<g transform="translate(${x} ${y})"><rect width="132" height="132" rx="14" fill="${fill}"${stroke !== "none" ? ` stroke="${stroke}"` : ""}/><text x="0" y="158" font-family="Geist" font-size="13" fill="#3E434C">${hex}</text></g>`;
  P(sw(1220, 776, INK, "#16171C"));
  P(sw(1376, 776, ACCENT, "#00B3A4 — accent"));
  P(sw(1220, 962 - 40, PAPER, "#F6F5F1 — paper", LINE));

  P(`<line x1="64" y1="892" x2="880" y2="892" stroke="#D5D2C8"/>`);
  P(`<text x="64" y="922" font-family="Geist" font-size="14" fill="${MUTED}">Signature stroke crosses the chain boundary, then resolves into a tick.</text>`);
  P(`<text x="64" y="946" font-family="Geist" font-size="14" fill="${MUTED}">The dashed seam is the boundary; the tick is on-chain verification.</text>`);
  P(`<text x="64" y="978" font-family="Geist" font-size="13" fill="${FAINT}">Wordmark outlined from Geist SemiBold — no font dependency. Clear space = half the mark height.</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">\n${parts.join("\n")}\n</svg>\n`;
})();
writeFileSync(`${OUT}/svg/crosssign-logo-system.svg`, sheet);

/* ───────────────────── social / OpenGraph card (1200×630) ───────────────── */

const og = (() => {
  const W = 1200;
  const H = 630;
  const parts = [];
  const P = (s) => parts.push(s);

  P(`<rect width="${W}" height="${H}" fill="${INK}"/>`);
  P(`<path d="M880 0V630" stroke="#F6F5F1" stroke-opacity="0.07" stroke-width="2" stroke-dasharray="10 14"/>`);
  P(`<path d="M960 0V630" stroke="#00B3A4" stroke-opacity="0.10" stroke-width="2" stroke-dasharray="10 14"/>`);

  const s = 1.5;
  P(`<g transform="translate(88 132) scale(${s})">${primaryMark({ ink: PAPER, seam: SEAM_DARK })}</g>`);
  P(`<g transform="translate(${88 + (MARK_W + GAP) * s} ${132 + WM_BASELINE * s}) scale(${s})"><path d="${WORD.d}" fill="${PAPER}"/></g>`);

  P(`<text x="88" y="330" font-family="Geist" font-size="34" fill="${PAPER}" fill-opacity="0.94">Prove you control a wallet. Verified on-chain.</text>`);
  P(`<text x="88" y="374" font-family="Geist" font-size="22" fill="${PAPER}" fill-opacity="0.62">Ed25519 signature verification in a Rust contract on Arbitrum Stylus.</text>`);

  P(`<g transform="translate(88 424)">`);
  P(`<rect width="228" height="42" rx="21" fill="#00B3A4" fill-opacity="0.14" stroke="#00B3A4" stroke-opacity="0.5"/>`);
  P(`<circle cx="26" cy="21" r="4.5" fill="#00B3A4"/>`);
  P(`<text x="44" y="28" font-family="Geist" font-size="15.5" fill="#5FD9CF">Arbitrum Sepolia</text>`);
  P(`<g transform="translate(248 0)"><rect width="196" height="42" rx="21" fill="#F6F5F1" fill-opacity="0.06"/><text x="22" y="28" font-family="Geist" font-size="15.5" fill="${PAPER}" fill-opacity="0.75">Rust · Stylus</text></g>`);
  P(`<g transform="translate(464 0)"><rect width="182" height="42" rx="21" fill="#F6F5F1" fill-opacity="0.06"/><text x="22" y="28" font-family="Geist" font-size="15.5" fill="${PAPER}" fill-opacity="0.75">No bridge</text></g>`);
  P(`</g>`);

  P(`<line x1="88" y1="556" x2="1112" y2="556" stroke="#F6F5F1" stroke-opacity="0.10"/>`);
  P(`<text x="88" y="592" font-family="Geist" font-size="16" fill="${PAPER}" fill-opacity="0.45">crosssign.vercel.app</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">\n${parts.join("\n")}\n</svg>\n`;
})();
writeFileSync(`${OUT}/svg/crosssign-og-card.svg`, og);

/* ─────────────────────────────── rasterise ──────────────────────────────── */

const FONTS = [FONT, FONT_MED];
function render(svgString, width, outPath) {
  const r = new Resvg(svgString, {
    fitTo: { mode: "width", value: width },
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Geist" },
    background: "rgba(0,0,0,0)",
  });
  writeFileSync(outPath, r.render().asPng());
}

const jobs = {
  "svg/crosssign-mark.svg": ["mark", [1024, 512, 256, 128]],
  "svg/crosssign-mark-dark-bg.svg": ["mark-dark-bg", [1024, 512]],
  "svg/crosssign-mark-mono.svg": ["mark-mono", [512, 128]],
  "svg/crosssign-mark-mono-reversed.svg": ["mark-mono-reversed", [512]],
  "svg/crosssign-lockup-horizontal.svg": ["lockup-horizontal", [2048, 1024, 512]],
  "svg/crosssign-lockup-horizontal-dark-bg.svg": ["lockup-horizontal-dark-bg", [1024]],
  "svg/crosssign-lockup-stacked.svg": ["lockup-stacked", [1024, 512]],
  "svg/crosssign-app-icon.svg": ["app-icon", [1024, 512, 192, 180, 64, 32]],
  "svg/crosssign-app-icon-paper.svg": ["app-icon-paper", [512]],
  "svg/crosssign-favicon.svg": ["favicon", [64, 48, 32, 16]],
  "svg/crosssign-logo-system.svg": ["logo-system", [1600]],
  "svg/crosssign-og-card.svg": ["og-card", [1200, 600]],
};

let count = 0;
for (const [rel, [name, widths]] of Object.entries(jobs)) {
  const content = readFileSync(`${OUT}/${rel}`, "utf8");
  for (const w of widths) {
    render(content, w, `${OUT}/png/${name}-${w}.png`);
    count++;
  }
}

console.log(`wordmark ${WORD.width.toFixed(1)}u · lockup ${LOCKUP_W.toFixed(0)}u · ${count} PNGs → ${OUT}`);
