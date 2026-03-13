/**
 * Color Scheme Domain Model
 * ═════════════════════════
 *
 * Color schemes are tenant-level resources that define semantic color tokens.
 * Sections reference a scheme by ID. The resolve pipeline maps tokens to
 * CSS custom properties applied at section scope. All blocks/elements
 * inside that section inherit the scheme via CSS cascading.
 *
 * Architectural contract:
 *   - Schemes live on TenantConfig (tenant-level, survive theme switching)
 *   - Sections reference, never own, color data
 *   - Tokens are semantic (purpose-driven), not presentational
 *   - The CSS variable contract is stable and forward-compatible
 *   - Editor and guest portal share this single source of truth
 */

// ═══════════════════════════════════════════════════════════════
// IDENTIFIERS
// ═══════════════════════════════════════════════════════════════

/** Stable identifier for a color scheme. Lowercase kebab-case or short slug. */
export type ColorSchemeId = string;

// ═══════════════════════════════════════════════════════════════
// TOKENS
// ═══════════════════════════════════════════════════════════════

/**
 * Semantic color tokens within a scheme.
 *
 * Every token represents a *purpose*, not a visual attribute.
 * This makes the system forward-compatible: new purposes can be
 * added without breaking existing schemes (via defaults/fallbacks).
 *
 * All values are CSS color strings (hex, rgb, rgba, hsl, etc.).
 */
export type ColorSchemeTokens = {
  /** Section/card background color. */
  background: string;

  /** Primary text color for headings and body. */
  text: string;

  /** Background of solid (filled) buttons. */
  solidButtonBackground: string;

  /** Label/text color of solid (filled) buttons. */
  solidButtonLabel: string;

  /** Border/text color of outline buttons. */
  outlineButton: string;

  /** Label/text color of outline buttons. */
  outlineButtonLabel: string;
};

/**
 * Ordered list of all token keys.
 * Used by validation and UI to iterate tokens deterministically.
 */
export const COLOR_SCHEME_TOKEN_KEYS: readonly (keyof ColorSchemeTokens)[] = [
  "background",
  "text",
  "solidButtonBackground",
  "solidButtonLabel",
  "outlineButton",
  "outlineButtonLabel",
] as const;

// ═══════════════════════════════════════════════════════════════
// SCHEME
// ═══════════════════════════════════════════════════════════════

/**
 * A color scheme stored at tenant level.
 *
 * Tenants can define multiple schemes (e.g. "light", "dark", "accent").
 * Sections pick one via colorSchemeId.
 *
 * Display label is always derived from sequence: "Schema 1", "Schema 2", etc.
 * Sequence numbers are monotonically increasing and never reused after deletion.
 */
export type ColorScheme = {
  /** Unique identifier within the tenant. Stable, never changes. */
  id: ColorSchemeId;

  /**
   * Monotonically increasing sequence number, unique per tenant.
   * Used to derive the display label ("Schema N"). Never reused after deletion.
   */
  sequence: number;

  /** The semantic color tokens. */
  tokens: ColorSchemeTokens;
};

// ═══════════════════════════════════════════════════════════════
// RESOLVED OUTPUT
// ═══════════════════════════════════════════════════════════════

/**
 * The result of resolving a section's color scheme reference.
 *
 * Contains both the semantic tokens (for logic) and the
 * CSS variable map (for rendering). Produced by the resolve layer,
 * consumed by section renderers.
 */
export type ResolvedColorScheme = {
  /** The scheme that was resolved. */
  scheme: ColorScheme;

  /** CSS custom properties ready to apply as inline style on the section wrapper. */
  cssVariables: React.CSSProperties;
};
