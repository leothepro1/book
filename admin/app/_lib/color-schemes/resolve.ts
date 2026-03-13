/**
 * Color Scheme Resolution
 * ═══════════════════════
 *
 * Pure functions that resolve a section's color scheme reference
 * into renderable CSS custom properties.
 *
 * Pipeline:
 *   1. Section has colorSchemeId (optional)
 *   2. resolveColorScheme() looks it up in the tenant's schemes
 *   3. colorSchemeToStyleVars() maps tokens → CSS variables
 *   4. Section renderer applies vars as inline style on wrapper
 *   5. All child elements inherit via CSS cascading
 *
 * If no scheme is referenced or the reference is invalid,
 * the section inherits page-level tokens (current behavior).
 */

import type { ColorScheme, ColorSchemeId, ColorSchemeTokens, ResolvedColorScheme } from "./types";
import { COLOR_SCHEME_TOKEN_KEYS } from "./types";
import { TOKEN_TO_CSS_VAR, SCHEME_TO_INHERITED_VARS, DEFAULT_TOKENS } from "./constants";

// ═══════════════════════════════════════════════════════════════
// SCHEME LOOKUP
// ═══════════════════════════════════════════════════════════════

/**
 * Resolves a color scheme reference to a full ResolvedColorScheme.
 *
 * Resolution order:
 *   1. Explicit schemeId on the section
 *   2. defaultSchemeId (fallback for legacy sections without colorSchemeId)
 *   3. null (no scheme, section inherits page-level tokens)
 *
 * This is a pure function with no side effects.
 */
export function resolveColorScheme(
  schemeId: ColorSchemeId | undefined | null,
  schemes: ColorScheme[],
  defaultSchemeId?: string | null,
): ResolvedColorScheme | null {
  // Use explicit reference, or fall back to default
  const effectiveId = schemeId || defaultSchemeId;
  if (!effectiveId) return null;

  const scheme = schemes.find((s) => s.id === effectiveId);
  if (!scheme) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[color-scheme] Scheme "${effectiveId}" not found — section inherits page-level tokens`);
    }
    return null;
  }

  return {
    scheme,
    cssVariables: colorSchemeToStyleVars(scheme.tokens),
  };
}

// ═══════════════════════════════════════════════════════════════
// TOKEN → CSS VARIABLE MAPPING
// ═══════════════════════════════════════════════════════════════

/**
 * Converts semantic color tokens into a CSS custom property map.
 *
 * Produces two layers of variables:
 *   1. Scheme-scoped vars (--scheme-background, etc.) for explicit access
 *   2. Inherited vars (--background, --text, --button-bg, etc.) so that
 *      existing elements automatically consume scheme colors
 *
 * The result is applied as inline style on the section wrapper <div>.
 * CSS cascading ensures all children inherit these values.
 */
export function colorSchemeToStyleVars(tokens: ColorSchemeTokens): React.CSSProperties {
  const vars: Record<string, string> = {};

  for (const key of COLOR_SCHEME_TOKEN_KEYS) {
    const value = tokens[key] ?? DEFAULT_TOKENS[key];
    const schemeVar = TOKEN_TO_CSS_VAR[key];

    // 1. Set the scheme-scoped variable
    vars[schemeVar] = value;

    // 2. Set the inherited global variable (so existing elements work)
    const inheritedVar = SCHEME_TO_INHERITED_VARS[schemeVar];
    if (inheritedVar) {
      vars[inheritedVar] = value;
    }
  }

  return vars as React.CSSProperties;
}

// ═══════════════════════════════════════════════════════════════
// UTILITY: GENERATE SCHEME FROM EXISTING THEME
// ═══════════════════════════════════════════════════════════════

/**
 * Creates a ColorScheme from existing ThemeConfig.colors.
 *
 * Useful for:
 *   - Auto-generating a "Default" scheme from the tenant's current theme
 *   - Migration: converting existing per-tenant colors to a scheme
 *
 * The outline button tokens default to the text color when not
 * explicitly set, which matches standard outline button behavior.
 */
export function colorSchemeFromThemeColors(
  id: ColorSchemeId,
  sequence: number,
  colors: { background: string; text: string; buttonBg: string; buttonText: string }
): ColorScheme {
  return {
    id,
    sequence,
    tokens: {
      background:            colors.background,
      text:                  colors.text,
      solidButtonBackground: colors.buttonBg,
      solidButtonLabel:      colors.buttonText,
      outlineButton:         colors.text,
      outlineButtonLabel:    colors.text,
    },
  };
}
