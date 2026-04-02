/**
 * Automatic Contrast Resolution
 * ══════════════════════════════
 *
 * Shopify-grade adaptive contrast system for checkout pages.
 * Given a background color, determines the optimal text and border
 * colors for accessibility and readability.
 *
 * Uses WCAG 2.1 relative luminance formula to classify backgrounds
 * as light or dark, then returns the appropriate foreground palette.
 *
 * This module is browser-safe and server-safe — no DOM, no Node APIs.
 */

// ═══════════════════════════════════════════════════════════════
// PALETTE
// ═══════════════════════════════════════════════════════════════

/** Foreground colors for light backgrounds (dark text). */
const LIGHT_BG = {
  text: "#202020",
  border: "#dadada",
} as const;

/** Foreground colors for dark backgrounds (light text). */
const DARK_BG = {
  text: "#ffffff",
  border: "#3B3E3B",
} as const;

export type ContrastPalette = { readonly text: string; readonly border: string };

// ═══════════════════════════════════════════════════════════════
// LUMINANCE CALCULATION (WCAG 2.1)
// ═══════════════════════════════════════════════════════════════

/**
 * Parse a hex color string to RGB components (0–255).
 * Supports #RGB, #RRGGBB, with or without leading #.
 */
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace(/^#/, "");

  // Expand shorthand (#RGB → #RRGGBB)
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }

  // Invalid → treat as white (safe fallback)
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) {
    return [255, 255, 255];
  }

  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * Linearize an sRGB channel value (0–255) for luminance calculation.
 * WCAG 2.1 spec: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function linearize(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * Calculate the relative luminance of a color (0–1).
 * 0 = pure black, 1 = pure white.
 */
function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

/**
 * Determine whether a background color is "light" or "dark".
 *
 * Threshold 0.5 on relative luminance — same as Shopify's checkout
 * adaptive contrast system. Values above 0.5 get dark text,
 * values at or below get light text.
 */
export function isLightBackground(bgHex: string): boolean {
  const [r, g, b] = hexToRgb(bgHex);
  return relativeLuminance(r, g, b) > 0.5;
}

/**
 * Given a background color, return the optimal text and border colors.
 *
 * Usage:
 *   const { text, border } = resolveContrastPalette("#1a1a1a");
 *   // → { text: "#ffffff", border: "#3B3E3B" }
 *
 *   const { text, border } = resolveContrastPalette("#FFFFFF");
 *   // → { text: "#202020", border: "#dadada" }
 */
export function resolveContrastPalette(bgHex: string): ContrastPalette {
  return isLightBackground(bgHex) ? LIGHT_BG : DARK_BG;
}
