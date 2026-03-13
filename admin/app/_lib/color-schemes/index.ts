/**
 * Color Scheme System — Public API
 * ═════════════════════════════════
 *
 * Single entry point for the color scheme infrastructure.
 * Both the editor and the guest portal import from here.
 *
 * Usage:
 *   import { resolveColorScheme, validateColorSchemes, ... } from "@/app/_lib/color-schemes";
 */

// Types
export type {
  ColorSchemeId,
  ColorSchemeTokens,
  ColorScheme,
  ResolvedColorScheme,
} from "./types";

export { COLOR_SCHEME_TOKEN_KEYS } from "./types";

// Constants
export {
  TOKEN_TO_CSS_VAR,
  SCHEME_TO_INHERITED_VARS,
  DEFAULT_TOKENS,
} from "./constants";

// Validation
export type {
  ColorSchemeValidationError,
  ColorSchemeValidationResult,
} from "./validation";

export {
  validateColorScheme,
  validateColorSchemes,
  validateColorSchemeReference,
} from "./validation";

// Resolution
export {
  resolveColorScheme,
  colorSchemeToStyleVars,
  colorSchemeFromThemeColors,
} from "./resolve";

// References
export {
  collectReferencedSchemeIds,
  nextSchemeSequence,
} from "./references";
