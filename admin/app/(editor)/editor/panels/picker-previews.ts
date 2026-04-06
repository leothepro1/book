/**
 * Picker Previews — SVG wireframe thumbnails for sections & elements
 * ══════════════════════════════════════════════════════════════════
 *
 * Returns data-URI SVGs shown in the PickerModal preview panel.
 * Each wireframe is a minimal, stylised representation of the
 * section/element layout — similar to Shopify's section picker.
 *
 * Colour palette uses neutral tones that work on the dark editor
 * surface (#1e1e1e background assumed).
 */

// ── Palette (light background — matches .pk-popup__presets #E2E2E2) ──
const BG = "#e2e2e2";
const FILL = "#d0d0d0";
const STROKE = "#bbb";
const TEXT = "#999";
const ACCENT = "#888";

function svg(w: number, h: number, body: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<rect width="${w}" height="${h}" fill="${BG}"/>` +
      body +
      `</svg>`
  )}`;
}

function rect(x: number, y: number, w: number, h: number, fill = FILL, rx = 4): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
}

function line(x1: number, y1: number, w: number, h = 3, fill = STROKE): string {
  return `<rect x="${x1}" y="${y1}" width="${w}" height="${h}" rx="1.5" fill="${fill}"/>`;
}

function circle(cx: number, cy: number, r: number, fill = STROKE): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
}

function textLine(x: number, y: number, w: number, fill = TEXT): string {
  return line(x, y, w, 2.5, fill);
}

function heading(x: number, y: number, w: number, fill = ACCENT): string {
  return line(x, y, w, 4, fill);
}

function btn(x: number, y: number, w: number, h = 10): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="none" stroke="${STROKE}" stroke-width="1"/>`;
}

function imgPlaceholder(x: number, y: number, w: number, h: number): string {
  // Rounded rect with mountain/sun icon
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (
    rect(x, y, w, h, FILL, 4) +
    // Mountain triangle
    `<path d="M${cx - w * 0.2} ${cy + h * 0.15} L${cx} ${cy - h * 0.15} L${cx + w * 0.2} ${cy + h * 0.15} Z" fill="${STROKE}"/>` +
    // Sun circle
    circle(cx + w * 0.15, cy - h * 0.15, Math.min(w, h) * 0.06, STROKE)
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION PREVIEWS
// ═══════════════════════════════════════════════════════════════

const W = 240;
const H = 160;

const sectionPreviews: Record<string, string> = {
  // ── Hero & Bildspel ──────────────────────────────────────────

  "hero-fullscreen": svg(W, H,
    imgPlaceholder(0, 0, W, H) +
    // Overlay text
    heading(30, 70, 100) +
    textLine(30, 82, 140) +
    textLine(30, 90, 100) +
    btn(30, 104, 60)
  ),

  "hero-bottom-aligned": svg(W, H,
    imgPlaceholder(0, 0, W, H) +
    // Bottom-aligned text
    heading(20, 110, 120) +
    textLine(20, 122, 160) +
    btn(20, 136, 60)
  ),

  "product-hero": svg(W, H,
    imgPlaceholder(0, 0, W, H) +
    heading(24, 60, 100) +
    textLine(24, 72, 140) +
    textLine(24, 80, 80) +
    heading(24, 96, 50, TEXT) +
    btn(24, 112, 70)
  ),

  "product-hero-split": svg(W, H,
    // Left text
    heading(16, 40, 80) +
    textLine(16, 54, 90) +
    textLine(16, 62, 70) +
    btn(16, 80, 55) +
    // Right image
    imgPlaceholder(125, 12, 103, 136)
  ),

  "fullscreen-slideshow": svg(W, H,
    imgPlaceholder(0, 0, W, H) +
    // Slide dots
    circle(W / 2 - 12, H - 16, 3, ACCENT) +
    circle(W / 2, H - 16, 3, STROKE) +
    circle(W / 2 + 12, H - 16, 3, STROKE) +
    // Center text
    heading(W / 2 - 50, 65, 100) +
    textLine(W / 2 - 60, 78, 120)
  ),

  "slideshow-card": svg(W, H,
    // Cards in a row
    rect(12, 20, 68, 120, FILL) +
    imgPlaceholder(14, 22, 64, 55) +
    textLine(18, 86, 50) +
    textLine(18, 94, 40) +
    rect(86, 20, 68, 120, FILL) +
    imgPlaceholder(88, 22, 64, 55) +
    textLine(92, 86, 50) +
    textLine(92, 94, 40) +
    rect(160, 20, 68, 120, FILL) +
    imgPlaceholder(162, 22, 64, 55) +
    textLine(166, 86, 50) +
    textLine(166, 94, 40)
  ),

  // ── Galleri & Karusell ───────────────────────────────────────

  carousel: svg(W, H,
    // Three visible cards
    rect(8, 24, 72, 112, FILL) +
    imgPlaceholder(12, 28, 64, 50) +
    heading(14, 88, 44) +
    textLine(14, 98, 60) +
    rect(84, 24, 72, 112, FILL) +
    imgPlaceholder(88, 28, 64, 50) +
    heading(90, 88, 44) +
    textLine(90, 98, 60) +
    rect(160, 24, 72, 112, FILL) +
    imgPlaceholder(164, 28, 64, 50) +
    heading(166, 88, 44) +
    textLine(166, 98, 60) +
    // Nav arrows
    `<path d="M4 80 L0 76 L0 84Z" fill="${STROKE}"/>` +
    `<path d="M236 80 L240 76 L240 84Z" fill="${STROKE}"/>`
  ),

  slider: svg(W, H,
    // Horizontal scrolling items
    rect(16, 30, 100, 100, FILL) +
    imgPlaceholder(20, 34, 92, 60) +
    heading(24, 104, 50) +
    textLine(24, 114, 72) +
    rect(124, 30, 100, 100, FILL) +
    imgPlaceholder(128, 34, 92, 60) +
    heading(132, 104, 50) +
    textLine(132, 114, 72)
  ),

  "collection-grid": svg(W, H,
    // 2×2 grid
    imgPlaceholder(12, 12, 104, 60) +
    textLine(14, 78, 70) +
    imgPlaceholder(124, 12, 104, 60) +
    textLine(126, 78, 70) +
    imgPlaceholder(12, 88, 104, 60) +
    textLine(14, 154, 70) +
    imgPlaceholder(124, 88, 104, 60) +
    textLine(126, 154, 70)
  ),

  "collection-grid-v2": svg(W, H,
    // 2×2 grid variant
    rect(12, 12, 104, 62, FILL) +
    imgPlaceholder(14, 14, 100, 40) +
    heading(16, 60, 60) +
    textLine(16, 70, 80) +
    rect(124, 12, 104, 62, FILL) +
    imgPlaceholder(126, 14, 100, 40) +
    heading(128, 60, 60) +
    textLine(128, 70, 80) +
    rect(12, 82, 104, 62, FILL) +
    imgPlaceholder(14, 84, 100, 40) +
    heading(16, 130, 60) +
    textLine(16, 140, 80) +
    rect(124, 82, 104, 62, FILL) +
    imgPlaceholder(126, 84, 100, 40) +
    heading(128, 130, 60) +
    textLine(128, 140, 80)
  ),

  // ── Innehåll ─────────────────────────────────────────────────

  "text-blocks": svg(W, H,
    // Two text columns
    heading(16, 24, 80) +
    textLine(16, 38, 100) +
    textLine(16, 46, 90) +
    textLine(16, 54, 95) +
    textLine(16, 62, 60) +
    heading(130, 24, 80) +
    textLine(130, 38, 95) +
    textLine(130, 46, 85) +
    textLine(130, 54, 90) +
    textLine(130, 62, 55) +
    // Divider
    `<line x1="120" y1="20" x2="120" y2="80" stroke="${STROKE}" stroke-width="1"/>`
  ),

  accordion: svg(W, H,
    // Accordion rows
    rect(20, 16, 200, 26, FILL) +
    heading(28, 26, 120) +
    `<path d="M204 26 L208 30 L212 26" stroke="${ACCENT}" stroke-width="1.5" fill="none"/>` +
    rect(20, 46, 200, 26, FILL) +
    heading(28, 56, 100) +
    `<path d="M204 56 L208 60 L212 56" stroke="${ACCENT}" stroke-width="1.5" fill="none"/>` +
    rect(20, 76, 200, 42, FILL) +
    heading(28, 86, 110) +
    `<path d="M204 82 L208 86 L212 82" stroke="${ACCENT}" stroke-width="1.5" fill="none"/>` +
    textLine(28, 98, 170) +
    textLine(28, 106, 150) +
    rect(20, 122, 200, 26, FILL) +
    heading(28, 132, 90) +
    `<path d="M204 132 L208 136 L212 132" stroke="${ACCENT}" stroke-width="1.5" fill="none"/>`
  ),

  tabs: svg(W, H,
    // Tab bar
    rect(20, 20, 200, 4, STROKE) +
    heading(28, 16, 40, ACCENT) +
    heading(78, 16, 40) +
    heading(128, 16, 40) +
    // Active tab indicator
    rect(28, 24, 40, 2, ACCENT) +
    // Tab content
    textLine(28, 40, 170) +
    textLine(28, 50, 160) +
    textLine(28, 60, 140) +
    textLine(28, 70, 150) +
    imgPlaceholder(28, 84, 180, 56)
  ),

  // ── Navigation ───────────────────────────────────────────────

  produktserie: svg(W, H,
    // Header
    heading(20, 20, 120) +
    textLine(20, 32, 180) +
    // Product cards in a row
    rect(16, 48, 66, 98, FILL) +
    imgPlaceholder(18, 50, 62, 46) +
    textLine(22, 104, 50) +
    textLine(22, 112, 34) +
    heading(22, 122, 30, TEXT) +
    rect(88, 48, 66, 98, FILL) +
    imgPlaceholder(90, 50, 62, 46) +
    textLine(94, 104, 50) +
    textLine(94, 112, 34) +
    heading(94, 122, 30, TEXT) +
    rect(160, 48, 66, 98, FILL) +
    imgPlaceholder(162, 50, 62, 46) +
    textLine(166, 104, 50) +
    textLine(166, 112, 34) +
    heading(166, 122, 30, TEXT)
  ),

  // ── Search / Bokningar ───────────────────────────────────────

  search: svg(W, H,
    // Search bar
    rect(20, 20, 200, 30, FILL) +
    textLine(30, 32, 60, TEXT) +
    // Vertical dividers
    `<line x1="90" y1="24" x2="90" y2="46" stroke="${STROKE}" stroke-width="1"/>` +
    textLine(100, 32, 50, TEXT) +
    `<line x1="160" y1="24" x2="160" y2="46" stroke="${STROKE}" stroke-width="1"/>` +
    // Search button
    rect(168, 26, 44, 18, ACCENT, 3) +
    // Results area hint
    textLine(20, 68, 200, STROKE) +
    textLine(20, 76, 200, STROKE) +
    textLine(20, 84, 200, STROKE)
  ),

  "search-results": svg(W, H,
    // Result cards
    rect(12, 10, 216, 42, FILL) +
    imgPlaceholder(16, 14, 34, 34) +
    heading(58, 20, 100) +
    textLine(58, 32, 140) +
    heading(178, 20, 40, TEXT) +
    rect(12, 58, 216, 42, FILL) +
    imgPlaceholder(16, 62, 34, 34) +
    heading(58, 68, 80) +
    textLine(58, 80, 130) +
    heading(178, 68, 40, TEXT) +
    rect(12, 106, 216, 42, FILL) +
    imgPlaceholder(16, 110, 34, 34) +
    heading(58, 116, 110) +
    textLine(58, 128, 120) +
    heading(178, 116, 40, TEXT)
  ),

  bokningar: svg(W, H,
    // Calendar/booking grid
    heading(20, 16, 100) +
    // Date row
    textLine(20, 34, 30, TEXT) +
    textLine(60, 34, 30, TEXT) +
    textLine(100, 34, 30, TEXT) +
    textLine(140, 34, 30, TEXT) +
    textLine(180, 34, 30, TEXT) +
    // Grid cells
    rect(20, 46, 40, 28, FILL) +
    rect(64, 46, 40, 28, FILL) +
    rect(108, 46, 40, 28, FILL) +
    rect(152, 46, 40, 28, FILL) +
    rect(196, 46, 30, 28, FILL) +
    rect(20, 78, 40, 28, FILL) +
    rect(64, 78, 40, 28, ACCENT) +
    rect(108, 78, 40, 28, ACCENT) +
    rect(152, 78, 40, 28, FILL) +
    rect(196, 78, 30, 28, FILL) +
    rect(20, 110, 40, 28, FILL) +
    rect(64, 110, 40, 28, FILL) +
    rect(108, 110, 40, 28, FILL) +
    rect(152, 110, 40, 28, FILL) +
    rect(196, 110, 30, 28, FILL)
  ),

  // ── Product template sections ────────────────────────────────

  "product-content": svg(W, H,
    heading(20, 24, 140) +
    textLine(20, 40, 200) +
    textLine(20, 50, 190) +
    textLine(20, 60, 180) +
    textLine(20, 70, 160) +
    // Divider
    `<line x1="20" y1="86" x2="220" y2="86" stroke="${STROKE}" stroke-width="1"/>` +
    // Features
    heading(20, 98, 80) +
    textLine(20, 112, 170) +
    textLine(20, 122, 150)
  ),

  "product-gallery": svg(W, H,
    // Main image
    imgPlaceholder(12, 12, 150, 136) +
    // Thumbnail strip
    imgPlaceholder(170, 12, 58, 42) +
    imgPlaceholder(170, 60, 58, 42) +
    imgPlaceholder(170, 108, 58, 40)
  ),

  "purchase-block": svg(W, H,
    heading(20, 20, 120) +
    heading(20, 34, 60, TEXT) +
    // Options
    rect(20, 52, 200, 28, FILL) +
    textLine(28, 62, 80) +
    circle(204, 66, 6, STROKE) +
    rect(20, 84, 200, 28, FILL) +
    textLine(28, 94, 70) +
    circle(204, 98, 6, ACCENT) +
    // Add to cart button
    rect(20, 122, 200, 26, ACCENT, 4) +
    textLine(85, 132, 70, BG)
  ),
};

// ═══════════════════════════════════════════════════════════════
// ELEMENT PREVIEWS
// ═══════════════════════════════════════════════════════════════

const EW = 240;
const EH = 120;

const elementPreviews: Record<string, string> = {
  heading: svg(EW, EH,
    heading(24, 30, 160) +
    line(24, 42, 80, 2, STROKE)
  ),

  text: svg(EW, EH,
    textLine(24, 28, 190) +
    textLine(24, 38, 180) +
    textLine(24, 48, 170) +
    textLine(24, 58, 185) +
    textLine(24, 68, 120)
  ),

  richtext: svg(EW, EH,
    heading(24, 20, 120) +
    textLine(24, 34, 190) +
    textLine(24, 44, 175) +
    // Bold emphasis
    line(24, 56, 50, 3, ACCENT) +
    textLine(80, 56, 130) +
    textLine(24, 66, 160) +
    // Bullet points
    circle(30, 80, 2, TEXT) +
    textLine(38, 79, 140) +
    circle(30, 90, 2, TEXT) +
    textLine(38, 89, 120)
  ),

  collapsible: svg(EW, EH,
    rect(20, 16, 200, 28, FILL) +
    heading(28, 27, 120) +
    `<path d="M204 27 L208 31 L212 27" stroke="${ACCENT}" stroke-width="1.5" fill="none"/>` +
    rect(20, 48, 200, 48, FILL) +
    heading(28, 58, 100) +
    `<path d="M204 54 L208 58 L212 54" stroke="${ACCENT}" stroke-width="1.5" fill="none"/>` +
    textLine(28, 72, 170) +
    textLine(28, 82, 150)
  ),

  image: svg(EW, EH,
    imgPlaceholder(24, 12, 192, 96)
  ),

  video: svg(EW, EH,
    rect(24, 12, 192, 96, FILL, 4) +
    // Play button
    circle(EW / 2, 60, 16, STROKE) +
    `<path d="M${EW / 2 - 5} ${60 - 8} L${EW / 2 + 7} 60 L${EW / 2 - 5} ${60 + 8} Z" fill="${TEXT}"/>`
  ),

  gallery: svg(EW, EH,
    // Mosaic of images
    imgPlaceholder(12, 12, 72, 96) +
    imgPlaceholder(90, 12, 72, 46) +
    imgPlaceholder(90, 62, 72, 46) +
    imgPlaceholder(168, 12, 60, 96)
  ),

  button: svg(EW, EH,
    // Primary button
    rect(24, 30, 90, 28, ACCENT, 4) +
    textLine(44, 42, 50, BG) +
    // Outline button
    btn(130, 30, 90, 28) +
    textLine(150, 42, 50)
  ),

  map: svg(EW, EH,
    rect(12, 8, 216, 104, FILL, 4) +
    // Map pin
    `<path d="M${EW / 2} 40 C${EW / 2} 40 ${EW / 2 - 8} 50 ${EW / 2 - 8} 56 C${EW / 2 - 8} 61 ${EW / 2 - 4} 65 ${EW / 2} 72 C${EW / 2 + 4} 65 ${EW / 2 + 8} 61 ${EW / 2 + 8} 56 C${EW / 2 + 8} 50 ${EW / 2} 40 ${EW / 2} 40 Z" fill="${ACCENT}"/>` +
    circle(EW / 2, 56, 3, FILL) +
    // Grid lines for map feel
    `<line x1="12" y1="40" x2="228" y2="40" stroke="${STROKE}" stroke-width="0.5"/>` +
    `<line x1="12" y1="70" x2="228" y2="70" stroke="${STROKE}" stroke-width="0.5"/>` +
    `<line x1="80" y1="8" x2="80" y2="112" stroke="${STROKE}" stroke-width="0.5"/>` +
    `<line x1="160" y1="8" x2="160" y2="112" stroke="${STROKE}" stroke-width="0.5"/>`
  ),

  menu: svg(EW, EH,
    // Link list
    textLine(24, 30, 100, ACCENT) +
    `<line x1="24" y1="40" x2="200" y2="40" stroke="${STROKE}" stroke-width="0.5"/>` +
    textLine(24, 50, 80, ACCENT) +
    `<line x1="24" y1="60" x2="200" y2="60" stroke="${STROKE}" stroke-width="0.5"/>` +
    textLine(24, 70, 120, ACCENT) +
    `<line x1="24" y1="80" x2="200" y2="80" stroke="${STROKE}" stroke-width="0.5"/>` +
    textLine(24, 90, 90, ACCENT)
  ),

  logo: svg(EW, EH,
    // Logo placeholder
    rect(EW / 2 - 40, EH / 2 - 20, 80, 40, FILL, 6) +
    heading(EW / 2 - 24, EH / 2 - 2, 48, ACCENT) +
    textLine(EW / 2 - 16, EH / 2 + 10, 32)
  ),

  icon: svg(EW, EH,
    // Icon placeholder (star shape)
    circle(EW / 2, EH / 2, 20, FILL) +
    `<path d="M${EW / 2} ${EH / 2 - 12} L${EW / 2 + 4} ${EH / 2 - 3} L${EW / 2 + 12} ${EH / 2 - 2} L${EW / 2 + 6} ${EH / 2 + 4} L${EW / 2 + 8} ${EH / 2 + 12} L${EW / 2} ${EH / 2 + 8} L${EW / 2 - 8} ${EH / 2 + 12} L${EW / 2 - 6} ${EH / 2 + 4} L${EW / 2 - 12} ${EH / 2 - 2} L${EW / 2 - 4} ${EH / 2 - 3} Z" fill="${ACCENT}"/>`
  ),

  divider: svg(EW, 50,
    `<line x1="24" y1="25" x2="${EW - 24}" y2="25" stroke="${STROKE}" stroke-width="1.5"/>`
  ),

  // ── Product-specific elements ────────────────────────────────

  "product-title": svg(EW, EH,
    heading(24, 40, 160) +
    textLine(24, 56, 80, TEXT)
  ),

  "product-description": svg(EW, EH,
    textLine(24, 24, 190) +
    textLine(24, 34, 175) +
    textLine(24, 44, 180) +
    textLine(24, 54, 160) +
    textLine(24, 64, 140)
  ),

  "product-price": svg(EW, EH,
    heading(24, 40, 60, ACCENT) +
    textLine(100, 42, 50, TEXT) +
    `<line x1="100" y1="42" x2="150" y2="42" stroke="${TEXT}" stroke-width="1"/>`
  ),

  "product-features": svg(EW, EH,
    // Feature list with icons
    circle(32, 24, 6, FILL) +
    textLine(46, 22, 120) +
    circle(32, 42, 6, FILL) +
    textLine(46, 40, 100) +
    circle(32, 60, 6, FILL) +
    textLine(46, 58, 130) +
    circle(32, 78, 6, FILL) +
    textLine(46, 76, 110)
  ),

  "product-highlights": svg(EW, EH,
    heading(24, 20, 100) +
    // Grid of highlight items
    rect(24, 34, 90, 36, FILL) +
    heading(30, 44, 40) +
    textLine(30, 56, 70) +
    rect(126, 34, 90, 36, FILL) +
    heading(132, 44, 40) +
    textLine(132, 56, 70) +
    rect(24, 76, 90, 36, FILL) +
    heading(30, 86, 40) +
    textLine(30, 98, 70) +
    rect(126, 76, 90, 36, FILL) +
    heading(132, 86, 40) +
    textLine(132, 98, 70)
  ),

  "product-add-to-cart": svg(EW, EH,
    // Quantity selector + button
    rect(24, 40, 30, 28, FILL, 4) +
    textLine(34, 52, 10) +
    rect(60, 40, 156, 28, ACCENT, 4) +
    textLine(100, 52, 70, BG)
  ),

  "product-booking-form": svg(EW, EH,
    // Date inputs
    rect(24, 14, 92, 24, FILL, 4) +
    textLine(32, 24, 50, TEXT) +
    rect(124, 14, 92, 24, FILL, 4) +
    textLine(132, 24, 50, TEXT) +
    // Guest selector
    rect(24, 46, 192, 24, FILL, 4) +
    textLine(32, 56, 70, TEXT) +
    // Book button
    rect(24, 80, 192, 28, ACCENT, 4) +
    textLine(80, 92, 80, BG)
  ),

  "add-to-cart": svg(EW, EH,
    rect(24, 40, 192, 32, ACCENT, 4) +
    textLine(75, 54, 90, BG)
  ),

  // ── Accommodation-specific elements ──────────────────────────

  "accommodation-capacity": svg(EW, EH,
    // Icons with labels
    circle(50, 40, 12, FILL) +
    textLine(38, 60, 24) +
    circle(100, 40, 12, FILL) +
    textLine(88, 60, 24) +
    circle(150, 40, 12, FILL) +
    textLine(138, 60, 24) +
    circle(200, 40, 12, FILL) +
    textLine(188, 60, 24)
  ),

  "accommodation-facilities": svg(EW, EH,
    // Tags/chips
    rect(24, 24, 60, 22, FILL, 11) +
    textLine(34, 33, 40) +
    rect(92, 24, 70, 22, FILL, 11) +
    textLine(102, 33, 50) +
    rect(170, 24, 50, 22, FILL, 11) +
    textLine(178, 33, 34) +
    rect(24, 54, 55, 22, FILL, 11) +
    textLine(34, 63, 35) +
    rect(87, 54, 65, 22, FILL, 11) +
    textLine(97, 63, 45) +
    rect(160, 54, 56, 22, FILL, 11) +
    textLine(168, 63, 40)
  ),

  "accommodation-highlights": svg(EW, EH,
    // Key-value pairs
    heading(24, 24, 70) +
    textLine(24, 38, 120) +
    heading(24, 56, 80) +
    textLine(24, 70, 100) +
    heading(24, 88, 60) +
    textLine(24, 102, 110)
  ),
};

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

/** Standalone-element prefix used in the picker */
const EL_PREFIX = "element:";

/**
 * Returns a data-URI SVG wireframe for the given picker item ID.
 * Works for both section IDs and `element:{type}` standalone items.
 */
export function getPickerPreview(itemId: string): string | undefined {
  // Element in standalone-picker format
  if (itemId.startsWith(EL_PREFIX)) {
    const elType = itemId.slice(EL_PREFIX.length);
    return elementPreviews[elType];
  }
  // Section
  return sectionPreviews[itemId];
}

/**
 * Returns a data-URI SVG wireframe for a raw element type.
 * Used by element pickers that don't have the `element:` prefix.
 */
export function getElementPreview(elementType: string): string | undefined {
  return elementPreviews[elementType];
}
