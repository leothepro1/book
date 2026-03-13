/**
 * Color Scheme Validation
 * ═══════════════════════
 *
 * Pure validation functions for color schemes and section references.
 * Used by both the editor (pre-save validation) and the resolve
 * pipeline (runtime safety).
 */

import type { ColorScheme, ColorSchemeId, ColorSchemeTokens } from "./types";
import { COLOR_SCHEME_TOKEN_KEYS } from "./types";

// ═══════════════════════════════════════════════════════════════
// VALIDATION RESULT
// ═══════════════════════════════════════════════════════════════

export type ColorSchemeValidationError = {
  path: string;
  message: string;
  severity: "error" | "warning";
};

export type ColorSchemeValidationResult = {
  valid: boolean;
  errors: ColorSchemeValidationError[];
  warnings: ColorSchemeValidationError[];
};

// ═══════════════════════════════════════════════════════════════
// TOKEN VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Validates that a string is a plausible CSS color value.
 *
 * Intentionally permissive — we validate structure, not aesthetics.
 * Accepts: hex (#rgb, #rrggbb, #rrggbbaa), rgb(), rgba(), hsl(), hsla(),
 * named colors, currentColor, transparent, inherit.
 *
 * We do NOT attempt full CSS color parsing. The browser is the
 * final arbiter. This catches obvious mistakes (empty, numeric, etc.).
 */
function isPlausibleCssColor(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;

  // Hex: #rgb, #rrggbb, #rrggbbaa
  if (/^#([0-9a-fA-F]{3,8})$/.test(trimmed)) return true;

  // Functional: rgb(), rgba(), hsl(), hsla()
  if (/^(rgb|rgba|hsl|hsla)\s*\(/.test(trimmed)) return true;

  // Named colors and CSS keywords (permissive: any lowercase alpha string)
  if (/^[a-zA-Z]+$/.test(trimmed)) return true;

  return false;
}

// ═══════════════════════════════════════════════════════════════
// SCHEME VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Validates a single color scheme definition.
 */
export function validateColorScheme(
  scheme: ColorScheme,
  path: string = "colorScheme"
): ColorSchemeValidationResult {
  const errors: ColorSchemeValidationError[] = [];
  const warnings: ColorSchemeValidationError[] = [];

  // ID
  if (!scheme.id || typeof scheme.id !== "string" || scheme.id.trim().length === 0) {
    errors.push({ path: `${path}.id`, message: "Scheme must have a non-empty ID", severity: "error" });
  }

  // Sequence
  if (typeof scheme.sequence !== "number" || !Number.isInteger(scheme.sequence) || scheme.sequence < 1) {
    errors.push({ path: `${path}.sequence`, message: "Scheme must have a positive integer sequence", severity: "error" });
  }

  // Tokens object
  if (!scheme.tokens || typeof scheme.tokens !== "object") {
    errors.push({ path: `${path}.tokens`, message: "Scheme must have a tokens object", severity: "error" });
    return { valid: false, errors, warnings };
  }

  // Each required token
  for (const key of COLOR_SCHEME_TOKEN_KEYS) {
    const value = scheme.tokens[key];
    if (value === undefined || value === null) {
      errors.push({
        path: `${path}.tokens.${key}`,
        message: `Required token "${key}" is missing`,
        severity: "error",
      });
    } else if (!isPlausibleCssColor(value)) {
      errors.push({
        path: `${path}.tokens.${key}`,
        message: `Token "${key}" has invalid color value: "${value}"`,
        severity: "error",
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ═══════════════════════════════════════════════════════════════
// COLLECTION VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Validates a complete collection of color schemes (tenant-level).
 * Checks for duplicate IDs and validates each scheme.
 */
export function validateColorSchemes(
  schemes: ColorScheme[]
): ColorSchemeValidationResult {
  const errors: ColorSchemeValidationError[] = [];
  const warnings: ColorSchemeValidationError[] = [];

  // Duplicate ID check
  const seenIds = new Set<string>();
  for (let i = 0; i < schemes.length; i++) {
    const scheme = schemes[i];
    if (seenIds.has(scheme.id)) {
      errors.push({
        path: `colorSchemes[${i}].id`,
        message: `Duplicate scheme ID "${scheme.id}"`,
        severity: "error",
      });
    }
    seenIds.add(scheme.id);

    // Validate individual scheme
    const result = validateColorScheme(scheme, `colorSchemes[${i}]`);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ═══════════════════════════════════════════════════════════════
// REFERENCE VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Validates that a section's color scheme reference points to
 * an existing scheme. Returns null if valid, error message if not.
 */
export function validateColorSchemeReference(
  schemeId: ColorSchemeId | undefined,
  schemes: ColorScheme[]
): string | null {
  if (schemeId === undefined || schemeId === null) return null; // no reference = valid (inherits page-level)
  if (typeof schemeId !== "string" || schemeId.trim().length === 0) {
    return "Color scheme reference must be a non-empty string";
  }
  const found = schemes.some((s) => s.id === schemeId);
  if (!found) {
    return `Color scheme "${schemeId}" not found. Available: ${schemes.map((s) => s.id).join(", ") || "(none)"}`;
  }
  return null;
}
