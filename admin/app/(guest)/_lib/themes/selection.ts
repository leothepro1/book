/**
 * Theme Selection Utilities
 *
 * Canonical source of truth for whether a tenant has selected a theme.
 * Use these functions everywhere instead of checking themeId directly —
 * this ensures consistent behaviour if the logic ever changes.
 *
 * Rules:
 *   themeId === null  → No theme selected (tenant uses platform default rendering)
 *   themeId === ""    → Treated as null (defensive)
 *   themeId === "xxx" → Theme "xxx" is explicitly active
 */

import type { TenantConfig } from "../tenant/types";

/**
 * Has the tenant explicitly selected a theme?
 *
 * This is the primary check. Use it to gate theme-dependent UI,
 * conditional rendering, feature flags, etc.
 *
 * @example
 *   if (hasSelectedTheme(config)) {
 *     // render ThemeRenderer
 *   } else {
 *     // render default / onboarding / theme picker prompt
 *   }
 */
export function hasSelectedTheme(config: Pick<TenantConfig, "themeId">): boolean {
  return config.themeId != null && config.themeId !== "";
}

/**
 * Get the active theme ID, or null if none selected.
 *
 * Unlike accessing config.themeId directly, this normalises
 * empty strings to null for consistent downstream handling.
 */
export function getActiveThemeId(config: Pick<TenantConfig, "themeId">): string | null {
  if (!config.themeId) return null;
  return config.themeId;
}

/**
 * Get the active theme ID with a fallback.
 *
 * Use this when you need a guaranteed theme ID (e.g. for rendering).
 * Falls back to the provided default (or "classic" if omitted).
 */
export function getActiveThemeIdOrDefault(
  config: Pick<TenantConfig, "themeId">,
  fallback = "classic",
): string {
  return config.themeId || fallback;
}
