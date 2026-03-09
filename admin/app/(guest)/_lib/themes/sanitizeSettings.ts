/**
 * Settings Sanitizer
 *
 * Cleans up tenant section settings against the active theme manifest.
 * Removes orphaned keys that no longer exist in the manifest's schema,
 * preventing ghost settings from deleted/renamed slots or fields from
 * causing rendering issues.
 *
 * This is the schema-evolution safety net: when a theme updates its
 * manifest (renames a slot, removes a field, changes field type),
 * the sanitizer ensures stored settings match the current schema.
 *
 * Run on every read path (engine.tsx) — not on write path — so
 * stored data is preserved for potential rollback.
 */

import type { ThemeManifest, ThemeSectionSlot, TenantSectionSettings } from "./types";

/**
 * Sanitize section settings against a theme manifest.
 *
 * Returns a new object containing only settings that match
 * valid slots and valid field keys in the current manifest.
 *
 * Settings for other themes (different namespace prefix) are
 * passed through untouched — they belong to other themes.
 */
export function sanitizeSectionSettings(
  settings: TenantSectionSettings,
  manifest: ThemeManifest,
): TenantSectionSettings {
  const themeId = manifest.id;
  const prefix = `${themeId}:`;

  // Build lookup: slotId → Set of valid field keys
  const allSlots = collectSlots(manifest);
  const validFields = new Map<string, Set<string>>();
  for (const slot of allSlots) {
    const fieldKeys = new Set(slot.schema.map((f) => f.key));
    // Also include default keys (settings without schema are valid via defaults)
    for (const key of Object.keys(slot.defaults)) {
      fieldKeys.add(key);
    }
    validFields.set(slot.id, fieldKeys);
  }

  const sanitized: TenantSectionSettings = {};

  for (const [namespacedKey, slotSettings] of Object.entries(settings)) {
    // Pass through settings for other themes untouched
    if (!namespacedKey.startsWith(prefix) && namespacedKey.includes(":")) {
      sanitized[namespacedKey] = slotSettings;
      continue;
    }

    // Also pass through bare keys (legacy backwards-compat)
    const slotId = namespacedKey.startsWith(prefix)
      ? namespacedKey.slice(prefix.length)
      : namespacedKey;

    const allowed = validFields.get(slotId);
    if (!allowed) {
      // Slot no longer exists in manifest — drop its settings
      continue;
    }

    // Filter to only valid field keys
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(slotSettings)) {
      if (allowed.has(key)) {
        cleaned[key] = value;
      }
    }

    if (Object.keys(cleaned).length > 0) {
      sanitized[namespacedKey] = cleaned;
    }
  }

  return sanitized;
}

function collectSlots(manifest: ThemeManifest): ThemeSectionSlot[] {
  return [
    ...manifest.sectionGroups.header,
    ...manifest.sectionGroups.footer,
    ...Object.values(manifest.templates).flatMap((t) => t.sections),
  ];
}
