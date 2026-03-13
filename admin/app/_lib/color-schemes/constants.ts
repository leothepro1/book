/**
 * Color Scheme Constants
 * ══════════════════════
 *
 * Canonical CSS variable names and default scheme definitions.
 * These are the stable contracts between the resolve layer and renderers.
 */

import type { ColorSchemeTokens } from "./types";

// ═══════════════════════════════════════════════════════════════
// CSS VARIABLE CONTRACT
// ═══════════════════════════════════════════════════════════════

/**
 * Maps each semantic token to the CSS custom property it controls.
 *
 * These variable names are the stable API between the color scheme
 * system and the rendering layer. Renderers and elements consume
 * these variables — they never read tokens directly.
 *
 * Design decisions:
 *   - `background` and `text` reuse existing global vars so that
 *     all current elements (HeadingElement, TextElement, etc.)
 *     automatically inherit scheme colors via CSS cascading.
 *   - `solidButton*` maps to existing `--button-bg` / `--button-fg`
 *     so ButtonElement works without modification.
 *   - `outlineButton*` introduces new variables for future outline
 *     button support.
 */
export const TOKEN_TO_CSS_VAR: Record<keyof ColorSchemeTokens, string> = {
  background:            "--scheme-background",
  text:                  "--scheme-text",
  solidButtonBackground: "--scheme-solid-button-bg",
  solidButtonLabel:      "--scheme-solid-button-label",
  outlineButton:         "--scheme-outline-button",
  outlineButtonLabel:    "--scheme-outline-button-label",
} as const;

/**
 * Maps scheme CSS variables to the existing global CSS variables
 * that elements already consume. Applied at section scope so that
 * children inherit scheme colors through normal CSS cascading.
 *
 * This bridge layer means existing elements (HeadingElement uses
 * `color: var(--text)`, ButtonElement uses `var(--button-bg)`)
 * automatically pick up scheme colors without modification.
 */
export const SCHEME_TO_INHERITED_VARS: Record<string, string> = {
  "--scheme-background":          "--background",
  "--scheme-text":                "--text",
  "--scheme-solid-button-bg":     "--button-bg",
  "--scheme-solid-button-label":  "--button-fg",
  "--scheme-outline-button":      "--outline-button",
  "--scheme-outline-button-label": "--outline-button-label",
} as const;

// ═══════════════════════════════════════════════════════════════
// DEFAULT TOKENS
// ═══════════════════════════════════════════════════════════════

/**
 * Fallback token values used when a token is missing or when
 * generating a default scheme. Matches the existing guest-tokens.css
 * root defaults so the visual result is identical.
 */
export const DEFAULT_TOKENS: ColorSchemeTokens = {
  background:            "#ffffff",
  text:                  "#171717",
  solidButtonBackground: "#111827",
  solidButtonLabel:      "#ffffff",
  outlineButton:         "#171717",
  outlineButtonLabel:    "#171717",
} as const;
