/**
 * Picker Previews — refined SVG thumbnails for sections & elements
 * ═══════════════════════════════════════════════════════════════════
 *
 * Returns data-URI SVGs rendered inside .pk-popup__preview-card
 * (white surface, subtle shadow, ~220px wide).
 *
 * Every thumbnail is a carefully proportioned miniature of the real
 * layout — designed to Shopify / Airbnb / Apple standards with:
 *   • proper typography hierarchy (heading vs body vs muted)
 *   • gradient image placeholders (not literal wireframe icons)
 *   • 8px-grid spacing and consistent rounded corners
 *   • soft zinc-scale neutrals with a single strong black accent
 */

// ── Zinc-inspired palette ──────────────────────────────────────────
const CANVAS = "#ffffff";
const SURFACE = "#fafafa";
const SURFACE_2 = "#f4f4f5";
const BORDER = "#e8e8ea";
const IMG_LO = "#e4e4e7";
const IMG_HI = "#c7c7cc";
const HERO_LO = "#c4c4c7";
const HERO_HI = "#8e8e93";
const TEXT_HEADING = "#3f3f46";
const TEXT_BODY = "#a1a1aa";
const TEXT_MUTED = "#d4d4d8";
const ACCENT = "#18181b";
const ON_DARK = "#ffffff";
const ON_DARK_SOFT = "rgba(255,255,255,0.72)";
const MAP_BG = "#eef0f3";
const MAP_LINE = "rgba(15,23,42,0.06)";
const MAP_ROAD = "rgba(15,23,42,0.12)";

// ── Canvas dimensions ──────────────────────────────────────────────
const W = 240;
const H = 160;
const EW = 240;
const EH = 120;

// ── Builder ────────────────────────────────────────────────────────
const DEFS =
  `<defs>` +
  `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
  `<stop offset="0" stop-color="${IMG_LO}"/>` +
  `<stop offset="1" stop-color="${IMG_HI}"/>` +
  `</linearGradient>` +
  `<linearGradient id="d" x1="0" y1="0" x2="0" y2="1">` +
  `<stop offset="0" stop-color="${HERO_LO}"/>` +
  `<stop offset="1" stop-color="${HERO_HI}"/>` +
  `</linearGradient>` +
  `</defs>`;

function svg(w: number, h: number, body: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      DEFS +
      `<rect width="${w}" height="${h}" fill="${CANVAS}"/>` +
      body +
      `</svg>`
  )}`;
}

// ── Shape primitives ───────────────────────────────────────────────
function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string = SURFACE_2,
  rx: number = 6
): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
}

function stroke(
  x: number,
  y: number,
  w: number,
  h: number,
  color: string = BORDER,
  rx: number = 6,
  sw: number = 1
): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
}

function card(x: number, y: number, w: number, h: number, rx: number = 8): string {
  return rect(x, y, w, h, SURFACE, rx) + stroke(x, y, w, h, BORDER, rx);
}

function divider(x1: number, y1: number, x2: number, y2: number, color: string = BORDER): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1"/>`;
}

function circle(cx: number, cy: number, r: number, fill: string = TEXT_BODY): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
}

// ── Image placeholders (gradient + subtle horizon) ────────────────
function img(x: number, y: number, w: number, h: number, rx: number = 6): string {
  const hy = y + h * 0.62;
  return (
    rect(x, y, w, h, "url(#g)", rx) +
    `<path d="M${x} ${hy} Q${x + w * 0.5} ${hy - 4} ${x + w} ${hy} L${x + w} ${y + h} L${x} ${y + h} Z" fill="rgba(0,0,0,0.04)"/>`
  );
}

function imgDark(x: number, y: number, w: number, h: number, rx: number = 6): string {
  const hy = y + h * 0.6;
  return (
    rect(x, y, w, h, "url(#d)", rx) +
    `<path d="M${x} ${hy} Q${x + w * 0.5} ${hy - 6} ${x + w} ${hy} L${x + w} ${y + h} L${x} ${y + h} Z" fill="rgba(0,0,0,0.14)"/>`
  );
}

// ── Typography bars ───────────────────────────────────────────────
function bar(
  x: number,
  y: number,
  w: number,
  h: number = 2.5,
  color: string = TEXT_BODY
): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(h / 2, 2)}" fill="${color}"/>`;
}

function head(x: number, y: number, w: number, color: string = TEXT_HEADING): string {
  return bar(x, y, w, 4, color);
}

function sub(x: number, y: number, w: number, color: string = TEXT_BODY): string {
  return bar(x, y, w, 2.5, color);
}

function tiny(x: number, y: number, w: number, color: string = TEXT_MUTED): string {
  return bar(x, y, w, 2, color);
}

// ── Buttons ───────────────────────────────────────────────────────
function btnFilled(x: number, y: number, w: number, h: number = 16, rx: number = 8): string {
  return rect(x, y, w, h, ACCENT, rx) + bar(x + (w - Math.min(w - 14, 44)) / 2, y + h / 2 - 1.25, Math.min(w - 14, 44), 2.5, ON_DARK);
}

function btnOutline(x: number, y: number, w: number, h: number = 16, rx: number = 8): string {
  return (
    stroke(x, y, w, h, TEXT_HEADING, rx, 1.2) +
    bar(x + (w - Math.min(w - 14, 44)) / 2, y + h / 2 - 1.25, Math.min(w - 14, 44), 2.5, TEXT_HEADING)
  );
}

function btnOnDark(x: number, y: number, w: number, h: number = 16, rx: number = 8): string {
  return (
    rect(x, y, w, h, ON_DARK, rx) +
    bar(x + (w - Math.min(w - 14, 44)) / 2, y + h / 2 - 1.25, Math.min(w - 14, 44), 2.5, "#27272a")
  );
}

// ── Iconography helpers ──────────────────────────────────────────
function chevronDown(cx: number, cy: number, s: number = 3.5, color: string = TEXT_BODY): string {
  return `<path d="M${cx - s} ${cy - s / 2} L${cx} ${cy + s / 2} L${cx + s} ${cy - s / 2}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function chevronRight(cx: number, cy: number, s: number = 3.5, color: string = TEXT_BODY): string {
  return `<path d="M${cx - s / 2} ${cy - s} L${cx + s / 2} ${cy} L${cx - s / 2} ${cy + s}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function chevronLeft(cx: number, cy: number, s: number = 3.5, color: string = TEXT_BODY): string {
  return `<path d="M${cx + s / 2} ${cy - s} L${cx - s / 2} ${cy} L${cx + s / 2} ${cy + s}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function search(cx: number, cy: number, r: number = 3, color: string = ON_DARK): string {
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="1.3"/>` +
    `<path d="M${cx + r * 0.75} ${cy + r * 0.75} L${cx + r * 1.6} ${cy + r * 1.6}" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>`
  );
}

function playCircle(cx: number, cy: number, r: number = 16): string {
  return (
    circle(cx, cy, r, "rgba(255,255,255,0.95)") +
    `<path d="M${cx - r * 0.32} ${cy - r * 0.5} L${cx + r * 0.55} ${cy} L${cx - r * 0.32} ${cy + r * 0.5} Z" fill="#27272a"/>`
  );
}

function mapPin(cx: number, cy: number, color: string = ACCENT): string {
  return (
    `<path d="M${cx} ${cy - 12} C${cx - 7} ${cy - 12} ${cx - 10} ${cy - 6} ${cx - 10} ${cy - 2} C${cx - 10} ${cy + 5} ${cx} ${cy + 14} ${cx} ${cy + 14} C${cx} ${cy + 14} ${cx + 10} ${cy + 5} ${cx + 10} ${cy - 2} C${cx + 10} ${cy - 6} ${cx + 7} ${cy - 12} ${cx} ${cy - 12} Z" fill="${color}"/>` +
    circle(cx, cy - 3, 3, ON_DARK)
  );
}

// ═══════════════════════════════════════════════════════════════════
// SECTION PREVIEWS (240 × 160)
// ═══════════════════════════════════════════════════════════════════

const sectionPreviews: Record<string, string> = {
  // ── Hero & Bildspel ────────────────────────────────────────────

  "hero-fullscreen": svg(W, H,
    imgDark(0, 0, W, H, 6) +
    // Eyebrow
    bar(20, 48, 34, 2, ON_DARK_SOFT) +
    // Big heading
    bar(20, 60, 168, 5, ON_DARK) +
    bar(20, 72, 120, 5, ON_DARK) +
    // Sub
    bar(20, 90, 150, 2.5, ON_DARK_SOFT) +
    bar(20, 98, 110, 2.5, ON_DARK_SOFT) +
    // CTA
    btnOnDark(20, 116, 66, 18, 9)
  ),

  "hero-bottom-aligned": svg(W, H,
    imgDark(0, 0, W, H, 6) +
    // Content anchored to bottom
    bar(20, 102, 160, 5, ON_DARK) +
    bar(20, 114, 118, 5, ON_DARK) +
    bar(20, 130, 130, 2.5, ON_DARK_SOFT) +
    btnOnDark(170, 122, 52, 18, 9)
  ),

  "product-hero": svg(W, H,
    imgDark(0, 0, W, H, 6) +
    // Eyebrow / breadcrumb
    bar(20, 52, 48, 2, ON_DARK_SOFT) +
    bar(20, 66, 154, 5, ON_DARK) +
    bar(20, 78, 104, 5, ON_DARK) +
    bar(20, 96, 130, 2.5, ON_DARK_SOFT) +
    // Price + button row
    bar(20, 120, 44, 4, ON_DARK) +
    btnOnDark(76, 114, 68, 18, 9)
  ),

  "product-hero-split": svg(W, H,
    // Left copy
    bar(16, 24, 28, 2, TEXT_MUTED) +
    head(16, 36, 84) +
    head(16, 48, 60) +
    sub(16, 66, 90) +
    sub(16, 74, 74) +
    // Price
    bar(16, 92, 42, 5, TEXT_HEADING) +
    bar(62, 95, 22, 2.5, TEXT_MUTED) +
    divider(62, 96, 84, 96, TEXT_MUTED) +
    btnFilled(16, 110, 78, 18, 9) +
    // Right image
    img(116, 12, 112, 136, 10)
  ),

  "fullscreen-slideshow": svg(W, H,
    imgDark(0, 0, W, H, 6) +
    // Centered copy
    bar(70, 60, 100, 5, ON_DARK) +
    bar(88, 72, 64, 5, ON_DARK) +
    bar(60, 88, 120, 2.5, ON_DARK_SOFT) +
    btnOnDark(94, 104, 52, 18, 9) +
    // Pagination dots
    circle(W / 2 - 12, 140, 2.5, ON_DARK) +
    circle(W / 2, 140, 2, "rgba(255,255,255,0.55)") +
    circle(W / 2 + 12, 140, 2, "rgba(255,255,255,0.55)") +
    // Side nav circles
    circle(14, H / 2, 10, "rgba(255,255,255,0.18)") +
    chevronLeft(14, H / 2, 3.5, ON_DARK) +
    circle(226, H / 2, 10, "rgba(255,255,255,0.18)") +
    chevronRight(226, H / 2, 3.5, ON_DARK)
  ),

  "slideshow-card": svg(W, H,
    // Three slideable cards
    card(14, 18, 70, 124, 8) +
    img(18, 22, 62, 60, 6) +
    head(22, 94, 44) +
    sub(22, 104, 52) +
    bar(22, 120, 20, 4, ACCENT) +
    card(86, 18, 70, 124, 8) +
    img(90, 22, 62, 60, 6) +
    head(94, 94, 44) +
    sub(94, 104, 52) +
    bar(94, 120, 20, 4, ACCENT) +
    card(158, 18, 70, 124, 8) +
    img(162, 22, 62, 60, 6) +
    head(166, 94, 44) +
    sub(166, 104, 52) +
    bar(166, 120, 20, 4, ACCENT) +
    // Dots
    circle(W / 2 - 10, 152, 2, ACCENT) +
    circle(W / 2, 152, 1.75, TEXT_MUTED) +
    circle(W / 2 + 10, 152, 1.75, TEXT_MUTED)
  ),

  // ── Galleri & Karusell ─────────────────────────────────────────

  carousel: svg(W, H,
    // Section header
    head(18, 16, 80) +
    sub(18, 28, 110, TEXT_MUTED) +
    // Three cards visible
    card(14, 42, 68, 102, 8) +
    img(18, 46, 60, 52, 6) +
    head(22, 108, 42) +
    sub(22, 118, 36) +
    bar(22, 130, 18, 3.5, ACCENT) +
    card(86, 42, 68, 102, 8) +
    img(90, 46, 60, 52, 6) +
    head(94, 108, 42) +
    sub(94, 118, 36) +
    bar(94, 130, 18, 3.5, ACCENT) +
    card(158, 42, 68, 102, 8) +
    img(162, 46, 60, 52, 6) +
    head(166, 108, 42) +
    sub(166, 118, 36) +
    bar(166, 130, 18, 3.5, ACCENT) +
    // Nav buttons (top-right)
    circle(198, 22, 8, SURFACE) +
    stroke(190, 14, 16, 16, BORDER, 8) +
    chevronLeft(198, 22, 3, TEXT_HEADING) +
    circle(218, 22, 8, SURFACE) +
    stroke(210, 14, 16, 16, BORDER, 8) +
    chevronRight(218, 22, 3, TEXT_HEADING)
  ),

  slider: svg(W, H,
    card(12, 16, 108, 128, 8) +
    img(16, 20, 100, 72, 6) +
    head(20, 100, 62) +
    sub(20, 112, 80) +
    bar(20, 126, 28, 4, ACCENT) +
    card(124, 16, 108, 128, 8) +
    img(128, 20, 100, 72, 6) +
    head(132, 100, 62) +
    sub(132, 112, 80) +
    bar(132, 126, 28, 4, ACCENT) +
    // Progress track
    rect(90, 152, 60, 2, TEXT_MUTED, 1) +
    rect(90, 152, 28, 2, ACCENT, 1)
  ),

  "collection-grid": svg(W, H,
    img(14, 14, 104, 64, 8) +
    head(14, 86, 52) +
    sub(14, 96, 76) +
    img(122, 14, 104, 64, 8) +
    head(122, 86, 52) +
    sub(122, 96, 76) +
    img(14, 108, 104, 42, 8) +
    img(122, 108, 104, 42, 8)
  ),

  "collection-grid-v2": svg(W, H,
    card(12, 12, 108, 70, 8) +
    img(16, 16, 100, 44, 6) +
    head(20, 66, 56) +
    sub(20, 74, 40, ACCENT) +
    card(124, 12, 108, 70, 8) +
    img(128, 16, 100, 44, 6) +
    head(132, 66, 56) +
    sub(132, 74, 40, ACCENT) +
    card(12, 88, 108, 62, 8) +
    img(16, 92, 100, 38, 6) +
    head(20, 138, 56) +
    card(124, 88, 108, 62, 8) +
    img(128, 92, 100, 38, 6) +
    head(132, 138, 56)
  ),

  // ── Innehåll ───────────────────────────────────────────────────

  "text-blocks": svg(W, H,
    // Top label
    bar(20, 16, 30, 2, ACCENT) +
    // Left column
    head(20, 30, 68) +
    head(20, 42, 48) +
    sub(20, 60, 90) +
    sub(20, 70, 88) +
    sub(20, 80, 86) +
    sub(20, 90, 60) +
    btnOutline(20, 108, 60, 16, 8) +
    // Divider
    divider(120, 30, 120, 130) +
    // Right column
    head(132, 30, 68) +
    head(132, 42, 56) +
    sub(132, 60, 88) +
    sub(132, 70, 84) +
    sub(132, 80, 88) +
    sub(132, 90, 50) +
    btnOutline(132, 108, 60, 16, 8)
  ),

  accordion: svg(W, H,
    // Row 1 — collapsed
    stroke(16, 16, 208, 24, BORDER, 8) +
    head(24, 25, 92) +
    chevronDown(212, 28, 3.5, TEXT_BODY) +
    // Row 2 — expanded
    rect(16, 44, 208, 52, SURFACE, 8) +
    stroke(16, 44, 208, 52, BORDER, 8) +
    head(24, 53, 80, TEXT_HEADING) +
    chevronDown(212, 56, 3.5, TEXT_HEADING) +
    sub(24, 68, 180) +
    sub(24, 76, 160) +
    sub(24, 84, 130) +
    // Row 3 — collapsed
    stroke(16, 100, 208, 24, BORDER, 8) +
    head(24, 109, 104) +
    chevronDown(212, 112, 3.5, TEXT_BODY) +
    // Row 4
    stroke(16, 128, 208, 24, BORDER, 8) +
    head(24, 137, 74) +
    chevronDown(212, 140, 3.5, TEXT_BODY)
  ),

  tabs: svg(W, H,
    // Tab bar
    head(20, 20, 34, TEXT_HEADING) +
    head(72, 20, 34, TEXT_BODY) +
    head(124, 20, 34, TEXT_BODY) +
    head(176, 20, 34, TEXT_BODY) +
    divider(18, 34, 222, 34, BORDER) +
    // Active indicator
    rect(18, 33, 38, 2, ACCENT, 1) +
    // Content
    head(20, 50, 110) +
    sub(20, 66, 180) +
    sub(20, 76, 160) +
    sub(20, 86, 140) +
    img(20, 102, 200, 44, 8)
  ),

  // ── Navigation / produktserie ──────────────────────────────────

  produktserie: svg(W, H,
    // Section header
    bar(16, 16, 28, 2, ACCENT) +
    head(16, 28, 104) +
    sub(16, 40, 160) +
    // Cards row
    card(14, 58, 68, 86, 8) +
    img(18, 62, 60, 52, 6) +
    head(22, 120, 40) +
    bar(22, 130, 22, 4, ACCENT) +
    card(86, 58, 68, 86, 8) +
    img(90, 62, 60, 52, 6) +
    head(94, 120, 40) +
    bar(94, 130, 22, 4, ACCENT) +
    card(158, 58, 68, 86, 8) +
    img(162, 62, 60, 52, 6) +
    head(166, 120, 40) +
    bar(166, 130, 22, 4, ACCENT)
  ),

  // ── Search / Bokningar ────────────────────────────────────────

  search: svg(W, H,
    // Ambient label
    sub(20, 28, 30, TEXT_MUTED) +
    head(20, 42, 94) +
    // Airbnb-style pill
    rect(14, 68, 212, 50, CANVAS, 25) +
    stroke(14, 68, 212, 50, BORDER, 25, 1) +
    // Segment 1
    sub(26, 84, 40, TEXT_HEADING) +
    tiny(26, 94, 58, TEXT_BODY) +
    divider(92, 78, 92, 108) +
    // Segment 2
    sub(102, 84, 34, TEXT_HEADING) +
    tiny(102, 94, 52, TEXT_BODY) +
    divider(162, 78, 162, 108) +
    // Segment 3
    sub(172, 84, 30, TEXT_HEADING) +
    tiny(172, 94, 26, TEXT_BODY) +
    // Search button
    circle(210, 93, 14, ACCENT) +
    search(210, 93, 4, ON_DARK) +
    // Background ambient shapes
    bar(20, 138, 40, 2, TEXT_MUTED) +
    bar(66, 138, 30, 2, TEXT_MUTED)
  ),

  "search-results": svg(W, H,
    // Filter bar
    rect(14, 12, 40, 18, SURFACE, 9) +
    stroke(14, 12, 40, 18, BORDER, 9) +
    bar(22, 19, 20, 2.5, TEXT_HEADING) +
    rect(58, 12, 48, 18, SURFACE, 9) +
    stroke(58, 12, 48, 18, BORDER, 9) +
    bar(66, 19, 28, 2.5, TEXT_HEADING) +
    rect(110, 12, 36, 18, SURFACE, 9) +
    stroke(110, 12, 36, 18, BORDER, 9) +
    bar(118, 19, 16, 2.5, TEXT_HEADING) +
    // Result cards (stacked)
    card(14, 40, 212, 36, 8) +
    img(20, 44, 30, 28, 5) +
    head(58, 50, 92) +
    sub(58, 60, 118) +
    tiny(58, 68, 50) +
    bar(194, 52, 24, 4, ACCENT) +
    card(14, 82, 212, 36, 8) +
    img(20, 86, 30, 28, 5) +
    head(58, 92, 74) +
    sub(58, 102, 128) +
    tiny(58, 110, 44) +
    bar(194, 94, 24, 4, ACCENT) +
    card(14, 124, 212, 30, 8) +
    img(20, 128, 22, 22, 4) +
    head(50, 132, 100) +
    sub(50, 142, 120) +
    bar(194, 134, 24, 4, ACCENT)
  ),

  bokningar: svg(W, H,
    // Header
    head(18, 16, 78) +
    // Nav
    circle(196, 20, 8, SURFACE) +
    stroke(188, 12, 16, 16, BORDER, 8) +
    chevronLeft(196, 20, 3, TEXT_HEADING) +
    circle(218, 20, 8, SURFACE) +
    stroke(210, 12, 16, 16, BORDER, 8) +
    chevronRight(218, 20, 3, TEXT_HEADING) +
    // Weekdays
    bar(22, 42, 8, 2, TEXT_MUTED) +
    bar(52, 42, 8, 2, TEXT_MUTED) +
    bar(82, 42, 8, 2, TEXT_MUTED) +
    bar(112, 42, 8, 2, TEXT_MUTED) +
    bar(142, 42, 8, 2, TEXT_MUTED) +
    bar(172, 42, 8, 2, TEXT_MUTED) +
    bar(202, 42, 8, 2, TEXT_MUTED) +
    // Range background (week 2, Tue–Fri)
    rect(74, 80, 118, 20, "#f4f4f5", 10) +
    // Calendar cells — dates as tiny dot rows
    // Week 1
    circle(26, 62, 7, CANVAS) + stroke(19, 55, 14, 14, BORDER, 7) +
    circle(56, 62, 7, CANVAS) + stroke(49, 55, 14, 14, BORDER, 7) +
    circle(86, 62, 7, CANVAS) + stroke(79, 55, 14, 14, BORDER, 7) +
    circle(116, 62, 7, CANVAS) + stroke(109, 55, 14, 14, BORDER, 7) +
    circle(146, 62, 7, CANVAS) + stroke(139, 55, 14, 14, BORDER, 7) +
    circle(176, 62, 7, CANVAS) + stroke(169, 55, 14, 14, BORDER, 7) +
    circle(206, 62, 7, CANVAS) + stroke(199, 55, 14, 14, BORDER, 7) +
    // Week 2 with range (Tue–Fri selected)
    circle(26, 90, 7, CANVAS) + stroke(19, 83, 14, 14, BORDER, 7) +
    circle(56, 90, 7, CANVAS) + stroke(49, 83, 14, 14, BORDER, 7) +
    circle(86, 90, 9, ACCENT) +
    circle(116, 90, 7, "#e8e8ea") +
    circle(146, 90, 7, "#e8e8ea") +
    circle(176, 90, 9, ACCENT) +
    circle(206, 90, 7, CANVAS) + stroke(199, 83, 14, 14, BORDER, 7) +
    // Week 3
    circle(26, 118, 7, CANVAS) + stroke(19, 111, 14, 14, BORDER, 7) +
    circle(56, 118, 7, CANVAS) + stroke(49, 111, 14, 14, BORDER, 7) +
    circle(86, 118, 7, CANVAS) + stroke(79, 111, 14, 14, BORDER, 7) +
    circle(116, 118, 7, CANVAS) + stroke(109, 111, 14, 14, BORDER, 7) +
    circle(146, 118, 7, CANVAS) + stroke(139, 111, 14, 14, BORDER, 7) +
    circle(176, 118, 7, CANVAS) + stroke(169, 111, 14, 14, BORDER, 7) +
    circle(206, 118, 7, CANVAS) + stroke(199, 111, 14, 14, BORDER, 7) +
    // Bottom CTA summary
    rect(14, 140, 140, 12, SURFACE, 6) +
    bar(22, 144, 60, 3, TEXT_HEADING) +
    tiny(22, 152, 40, TEXT_BODY) +
    rect(162, 140, 64, 12, ACCENT, 6) +
    bar(180, 145, 28, 2.5, ON_DARK)
  ),

  // ── Product template sections ──────────────────────────────────

  "product-content": svg(W, H,
    // Section label
    bar(20, 16, 28, 2, ACCENT) +
    // Heading
    head(20, 28, 160) +
    head(20, 40, 104) +
    // Body
    sub(20, 58, 196) +
    sub(20, 68, 180) +
    sub(20, 78, 192) +
    sub(20, 88, 140) +
    // Divider
    divider(20, 104, 220, 104) +
    // Second block
    head(20, 114, 76) +
    sub(20, 128, 184) +
    sub(20, 138, 160) +
    sub(20, 148, 110)
  ),

  "product-gallery": svg(W, H,
    // Main image
    img(12, 12, 150, 136, 8) +
    // Thumbnails
    img(170, 12, 58, 42, 6) +
    stroke(170, 12, 58, 42, ACCENT, 6, 1.5) +
    img(170, 60, 58, 42, 6) +
    img(170, 108, 58, 40, 6)
  ),

  "purchase-block": svg(W, H,
    // Title
    bar(20, 14, 26, 2, TEXT_MUTED) +
    head(20, 26, 140) +
    // Price row
    bar(20, 46, 52, 6, TEXT_HEADING) +
    bar(78, 50, 28, 3, TEXT_MUTED) +
    divider(78, 51, 106, 51, TEXT_MUTED) +
    rect(114, 46, 30, 14, ACCENT, 4) +
    bar(120, 51, 18, 2, ON_DARK) +
    // Option selector label
    bar(20, 70, 32, 2, TEXT_HEADING) +
    // Option pills
    rect(20, 80, 50, 22, SURFACE, 6) +
    stroke(20, 80, 50, 22, ACCENT, 6, 1.5) +
    bar(36, 89, 18, 3, TEXT_HEADING) +
    rect(76, 80, 50, 22, CANVAS, 6) +
    stroke(76, 80, 50, 22, BORDER, 6, 1) +
    bar(92, 89, 18, 3, TEXT_BODY) +
    rect(132, 80, 50, 22, CANVAS, 6) +
    stroke(132, 80, 50, 22, BORDER, 6, 1) +
    bar(148, 89, 18, 3, TEXT_BODY) +
    // CTA
    btnFilled(20, 112, 200, 28, 8)
  ),
};

// ═══════════════════════════════════════════════════════════════════
// ELEMENT PREVIEWS (240 × 120)
// ═══════════════════════════════════════════════════════════════════

const elementPreviews: Record<string, string> = {
  heading: svg(EW, EH,
    bar(20, 40, 56, 2, TEXT_MUTED) +
    bar(20, 54, 184, 6, TEXT_HEADING) +
    bar(20, 66, 120, 6, TEXT_HEADING) +
    bar(20, 82, 80, 2.5, TEXT_BODY)
  ),

  text: svg(EW, EH,
    sub(20, 24, 196) +
    sub(20, 34, 188) +
    sub(20, 44, 194) +
    sub(20, 54, 180) +
    sub(20, 64, 190) +
    sub(20, 74, 150) +
    sub(20, 84, 110) +
    sub(20, 94, 170)
  ),

  richtext: svg(EW, EH,
    head(20, 18, 110) +
    sub(20, 32, 196) +
    sub(20, 42, 188) +
    // Bold line
    bar(20, 52, 48, 3, TEXT_HEADING) +
    sub(72, 52, 144) +
    sub(20, 62, 170) +
    // Bullets
    circle(26, 78, 1.5, TEXT_BODY) +
    sub(34, 77, 158) +
    circle(26, 90, 1.5, TEXT_BODY) +
    sub(34, 89, 140) +
    circle(26, 102, 1.5, TEXT_BODY) +
    sub(34, 101, 124)
  ),

  collapsible: svg(EW, EH,
    // Row 1 — collapsed
    stroke(20, 18, 200, 22, BORDER, 8) +
    head(30, 27, 104) +
    chevronDown(206, 29, 3.5, TEXT_BODY) +
    // Row 2 — expanded
    rect(20, 44, 200, 54, SURFACE, 8) +
    stroke(20, 44, 200, 54, BORDER, 8) +
    head(30, 53, 80, TEXT_HEADING) +
    chevronDown(206, 55, 3.5, TEXT_HEADING) +
    sub(30, 68, 166) +
    sub(30, 78, 140) +
    sub(30, 88, 118)
  ),

  image: svg(EW, EH,
    img(20, 10, 200, 100, 10)
  ),

  video: svg(EW, EH,
    imgDark(20, 10, 200, 100, 10) +
    playCircle(120, 60, 18)
  ),

  gallery: svg(EW, EH,
    img(14, 10, 108, 100, 8) +
    img(128, 10, 52, 48, 6) +
    img(184, 10, 42, 48, 6) +
    img(128, 62, 52, 48, 6) +
    img(184, 62, 42, 48, 6)
  ),

  button: svg(EW, EH,
    btnFilled(22, 40, 94, 32, 10) +
    stroke(128, 40, 94, 32, TEXT_HEADING, 10, 1.3) +
    bar(152, 54, 46, 3, TEXT_HEADING)
  ),

  map: svg(EW, EH,
    rect(14, 10, 212, 100, MAP_BG, 10) +
    // Grid suggesting streets
    divider(14, 36, 226, 36, MAP_LINE) +
    divider(14, 62, 226, 62, MAP_LINE) +
    divider(14, 88, 226, 88, MAP_LINE) +
    divider(62, 10, 62, 110, MAP_LINE) +
    divider(130, 10, 130, 110, MAP_LINE) +
    divider(186, 10, 186, 110, MAP_LINE) +
    // Diagonal road
    `<path d="M14 96 L80 50 L150 70 L226 30" stroke="${MAP_ROAD}" stroke-width="2" fill="none" stroke-linecap="round"/>` +
    // Parks (subtle green tint)
    rect(22, 68, 32, 18, "rgba(34,197,94,0.12)", 4) +
    rect(140, 14, 38, 20, "rgba(34,197,94,0.12)", 4) +
    // Pin
    mapPin(120, 58, ACCENT)
  ),

  menu: svg(EW, EH,
    head(22, 20, 100, TEXT_HEADING) +
    chevronRight(212, 22, 3, TEXT_BODY) +
    divider(22, 32, 218, 32) +
    head(22, 40, 76, TEXT_HEADING) +
    chevronRight(212, 42, 3, TEXT_BODY) +
    divider(22, 52, 218, 52) +
    head(22, 60, 124, TEXT_HEADING) +
    chevronRight(212, 62, 3, TEXT_BODY) +
    divider(22, 72, 218, 72) +
    head(22, 80, 92, TEXT_HEADING) +
    chevronRight(212, 82, 3, TEXT_BODY) +
    divider(22, 92, 218, 92) +
    head(22, 100, 68, TEXT_HEADING) +
    chevronRight(212, 102, 3, TEXT_BODY)
  ),

  logo: svg(EW, EH,
    // Mark (black rounded square with white dot)
    rect(EW / 2 - 54, EH / 2 - 16, 30, 30, ACCENT, 8) +
    circle(EW / 2 - 39, EH / 2 - 1, 6, ON_DARK) +
    // Wordmark
    bar(EW / 2 - 14, EH / 2 - 8, 62, 6, TEXT_HEADING) +
    bar(EW / 2 - 14, EH / 2 + 4, 42, 2.5, TEXT_BODY)
  ),

  icon: svg(EW, EH,
    circle(EW / 2, EH / 2, 26, SURFACE_2) +
    stroke(EW / 2 - 26, EH / 2 - 26, 52, 52, BORDER, 26) +
    // Abstract sparkle
    `<path d="M${EW / 2} ${EH / 2 - 14} L${EW / 2 + 4} ${EH / 2 - 2} L${EW / 2 + 14} ${EH / 2} L${EW / 2 + 4} ${EH / 2 + 2} L${EW / 2} ${EH / 2 + 14} L${EW / 2 - 4} ${EH / 2 + 2} L${EW / 2 - 14} ${EH / 2} L${EW / 2 - 4} ${EH / 2 - 2} Z" fill="${ACCENT}"/>`
  ),

  divider: svg(EW, 60,
    divider(24, 30, 108, 30, TEXT_MUTED) +
    circle(EW / 2, 30, 2, TEXT_MUTED) +
    divider(132, 30, 216, 30, TEXT_MUTED)
  ),

  // ── Product-specific ────────────────────────────────────────────

  "product-title": svg(EW, EH,
    bar(20, 36, 44, 2, TEXT_MUTED) +
    bar(20, 50, 176, 6, TEXT_HEADING) +
    bar(20, 62, 108, 6, TEXT_HEADING) +
    sub(20, 80, 80, TEXT_BODY)
  ),

  "product-description": svg(EW, EH,
    sub(20, 20, 196) +
    sub(20, 30, 180) +
    sub(20, 40, 194) +
    sub(20, 50, 172) +
    sub(20, 60, 188) +
    sub(20, 70, 148) +
    sub(20, 80, 176) +
    sub(20, 90, 60)
  ),

  "product-price": svg(EW, EH,
    bar(20, 48, 62, 8, TEXT_HEADING) +
    bar(90, 54, 36, 4, TEXT_MUTED) +
    divider(90, 56, 126, 56, TEXT_MUTED) +
    rect(134, 48, 36, 18, ACCENT, 4) +
    bar(142, 55, 20, 3, ON_DARK) +
    sub(20, 72, 92, TEXT_MUTED)
  ),

  "product-features": svg(EW, EH,
    // Row 1
    circle(30, 22, 8, SURFACE_2) +
    `<path d="M26 22 L29 25 L34 19" stroke="${ACCENT}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
    head(46, 18, 100) +
    sub(46, 28, 150) +
    // Row 2
    circle(30, 52, 8, SURFACE_2) +
    `<path d="M26 52 L29 55 L34 49" stroke="${ACCENT}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
    head(46, 48, 80) +
    sub(46, 58, 132) +
    // Row 3
    circle(30, 82, 8, SURFACE_2) +
    `<path d="M26 82 L29 85 L34 79" stroke="${ACCENT}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
    head(46, 78, 120) +
    sub(46, 88, 144)
  ),

  "product-highlights": svg(EW, EH,
    // Header
    head(20, 14, 84) +
    // 2×2 grid
    rect(20, 30, 98, 36, SURFACE, 8) +
    stroke(20, 30, 98, 36, BORDER, 8) +
    rect(28, 38, 14, 14, CANVAS, 4) +
    stroke(28, 38, 14, 14, BORDER, 4) +
    head(50, 38, 46) +
    sub(50, 50, 40, TEXT_MUTED) +
    rect(122, 30, 98, 36, SURFACE, 8) +
    stroke(122, 30, 98, 36, BORDER, 8) +
    rect(130, 38, 14, 14, CANVAS, 4) +
    stroke(130, 38, 14, 14, BORDER, 4) +
    head(152, 38, 46) +
    sub(152, 50, 40, TEXT_MUTED) +
    rect(20, 72, 98, 36, SURFACE, 8) +
    stroke(20, 72, 98, 36, BORDER, 8) +
    rect(28, 80, 14, 14, CANVAS, 4) +
    stroke(28, 80, 14, 14, BORDER, 4) +
    head(50, 80, 46) +
    sub(50, 92, 40, TEXT_MUTED) +
    rect(122, 72, 98, 36, SURFACE, 8) +
    stroke(122, 72, 98, 36, BORDER, 8) +
    rect(130, 80, 14, 14, CANVAS, 4) +
    stroke(130, 80, 14, 14, BORDER, 4) +
    head(152, 80, 46) +
    sub(152, 92, 40, TEXT_MUTED)
  ),

  "product-add-to-cart": svg(EW, EH,
    // Quantity stepper
    rect(20, 44, 64, 32, CANVAS, 10) +
    stroke(20, 44, 64, 32, BORDER, 10) +
    bar(28, 59, 6, 2, TEXT_HEADING) +
    bar(50, 57, 4, 6, TEXT_HEADING) +
    bar(48, 59, 8, 2, TEXT_HEADING) +
    bar(70, 57, 6, 2, TEXT_HEADING) +
    bar(72, 53, 2, 10, TEXT_HEADING) +
    // Add to cart button
    rect(92, 44, 128, 32, ACCENT, 10) +
    bar(124, 58, 64, 3, ON_DARK)
  ),

  "product-booking-form": svg(EW, EH,
    // Two date fields
    rect(20, 14, 94, 28, CANVAS, 8) +
    stroke(20, 14, 94, 28, BORDER, 8) +
    tiny(30, 20, 40, TEXT_MUTED) +
    head(30, 29, 54) +
    rect(126, 14, 94, 28, CANVAS, 8) +
    stroke(126, 14, 94, 28, BORDER, 8) +
    tiny(136, 20, 40, TEXT_MUTED) +
    head(136, 29, 54) +
    // Guests field
    rect(20, 48, 200, 28, CANVAS, 8) +
    stroke(20, 48, 200, 28, BORDER, 8) +
    tiny(30, 54, 40, TEXT_MUTED) +
    head(30, 63, 70) +
    chevronDown(206, 61, 3, TEXT_BODY) +
    // CTA
    rect(20, 84, 200, 28, ACCENT, 8) +
    bar(88, 97, 64, 3, ON_DARK)
  ),

  "add-to-cart": svg(EW, EH,
    rect(22, 40, 196, 32, ACCENT, 10) +
    bar(104, 54, 32, 3, ON_DARK) +
    // Subtle cart icon
    `<path d="M88 52 L94 52 L96 60 L110 60 L112 54 L95 54" fill="none" stroke="${ON_DARK}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>` +
    circle(100, 64, 1.5, ON_DARK) +
    circle(108, 64, 1.5, ON_DARK)
  ),

  // ── Accommodation-specific ──────────────────────────────────────

  "accommodation-capacity": svg(EW, EH,
    // 4 icon+label cells
    circle(38, 40, 14, SURFACE_2) +
    stroke(24, 26, 28, 28, BORDER, 14) +
    `<path d="M38 34 C35 34 33 36 33 39 C33 42 35 44 38 44 C41 44 43 42 43 39 C43 36 41 34 38 34 Z M30 52 C30 48 34 46 38 46 C42 46 46 48 46 52" stroke="${ACCENT}" stroke-width="1.3" fill="none" stroke-linecap="round"/>` +
    head(24, 64, 28, TEXT_HEADING) +
    sub(24, 74, 28, TEXT_MUTED) +

    circle(94, 40, 14, SURFACE_2) +
    stroke(80, 26, 28, 28, BORDER, 14) +
    rect(84, 38, 20, 6, ACCENT, 2) +
    rect(84, 44, 20, 2, ACCENT, 1) +
    head(82, 64, 24, TEXT_HEADING) +
    sub(82, 74, 24, TEXT_MUTED) +

    circle(150, 40, 14, SURFACE_2) +
    stroke(136, 26, 28, 28, BORDER, 14) +
    `<path d="M145 38 L155 38 L158 44 L142 44 Z M143 44 L143 46 M157 44 L157 46" stroke="${ACCENT}" stroke-width="1.3" fill="none" stroke-linecap="round"/>` +
    head(138, 64, 24, TEXT_HEADING) +
    sub(138, 74, 24, TEXT_MUTED) +

    circle(206, 40, 14, SURFACE_2) +
    stroke(192, 26, 28, 28, BORDER, 14) +
    `<path d="M200 42 Q206 36 212 42 M202 46 Q206 42 210 46" stroke="${ACCENT}" stroke-width="1.3" fill="none" stroke-linecap="round"/>` +
    circle(206, 49, 1.5, ACCENT) +
    head(194, 64, 24, TEXT_HEADING) +
    sub(194, 74, 24, TEXT_MUTED)
  ),

  "accommodation-facilities": svg(EW, EH,
    // Pill chips in two rows
    rect(20, 20, 54, 22, SURFACE, 11) +
    stroke(20, 20, 54, 22, BORDER, 11) +
    circle(30, 31, 3, ACCENT) +
    sub(38, 29, 30, TEXT_HEADING) +

    rect(80, 20, 46, 22, SURFACE, 11) +
    stroke(80, 20, 46, 22, BORDER, 11) +
    circle(90, 31, 3, ACCENT) +
    sub(98, 29, 22, TEXT_HEADING) +

    rect(132, 20, 60, 22, SURFACE, 11) +
    stroke(132, 20, 60, 22, BORDER, 11) +
    circle(142, 31, 3, ACCENT) +
    sub(150, 29, 36, TEXT_HEADING) +

    rect(198, 20, 30, 22, SURFACE, 11) +
    stroke(198, 20, 30, 22, BORDER, 11) +
    circle(206, 31, 3, ACCENT) +
    sub(214, 29, 8, TEXT_HEADING) +

    rect(20, 50, 48, 22, SURFACE, 11) +
    stroke(20, 50, 48, 22, BORDER, 11) +
    circle(30, 61, 3, ACCENT) +
    sub(38, 59, 24, TEXT_HEADING) +

    rect(74, 50, 58, 22, SURFACE, 11) +
    stroke(74, 50, 58, 22, BORDER, 11) +
    circle(84, 61, 3, ACCENT) +
    sub(92, 59, 34, TEXT_HEADING) +

    rect(138, 50, 42, 22, SURFACE, 11) +
    stroke(138, 50, 42, 22, BORDER, 11) +
    circle(148, 61, 3, ACCENT) +
    sub(156, 59, 18, TEXT_HEADING) +

    rect(186, 50, 42, 22, SURFACE, 11) +
    stroke(186, 50, 42, 22, BORDER, 11) +
    circle(196, 61, 3, ACCENT) +
    sub(204, 59, 18, TEXT_HEADING) +

    rect(20, 80, 56, 22, SURFACE, 11) +
    stroke(20, 80, 56, 22, BORDER, 11) +
    circle(30, 91, 3, ACCENT) +
    sub(38, 89, 32, TEXT_HEADING) +

    rect(82, 80, 50, 22, SURFACE, 11) +
    stroke(82, 80, 50, 22, BORDER, 11) +
    circle(92, 91, 3, ACCENT) +
    sub(100, 89, 26, TEXT_HEADING) +

    rect(138, 80, 54, 22, SURFACE, 11) +
    stroke(138, 80, 54, 22, BORDER, 11) +
    circle(148, 91, 3, ACCENT) +
    sub(156, 89, 30, TEXT_HEADING)
  ),

  "accommodation-highlights": svg(EW, EH,
    // Three rows with icon + key/value
    rect(20, 16, 20, 20, SURFACE_2, 6) +
    stroke(20, 16, 20, 20, BORDER, 6) +
    head(48, 18, 64) +
    sub(48, 28, 120, TEXT_MUTED) +

    rect(20, 46, 20, 20, SURFACE_2, 6) +
    stroke(20, 46, 20, 20, BORDER, 6) +
    head(48, 48, 80) +
    sub(48, 58, 100, TEXT_MUTED) +

    rect(20, 76, 20, 20, SURFACE_2, 6) +
    stroke(20, 76, 20, 20, BORDER, 6) +
    head(48, 78, 52) +
    sub(48, 88, 130, TEXT_MUTED)
  ),
};

// ═══════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════

const EL_PREFIX = "element:";

/** data-URI SVG for a picker item — section ID or `element:{type}` */
export function getPickerPreview(itemId: string): string | undefined {
  if (itemId.startsWith(EL_PREFIX)) {
    return elementPreviews[itemId.slice(EL_PREFIX.length)];
  }
  return sectionPreviews[itemId];
}

/** data-URI SVG for a raw element type (no prefix) */
export function getElementPreview(elementType: string): string | undefined {
  return elementPreviews[elementType];
}
