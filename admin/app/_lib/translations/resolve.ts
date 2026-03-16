// ── Translation resolution — fallback chain ──────────────────
//
// Used in the guest portal renderer. Called per-string, per-request.
// Translations are pre-loaded as a Map — no per-string queries.
//
// Fallback chain:
//   1. Tenant translation for (requestedLocale, resourceId)
//   2. Platform default for (requestedLocale, resourceId)    [PLATFORM NS only]
//   3. Tenant translation for (primaryLocale, resourceId)
//   4. Platform default for (primaryLocale, resourceId)      [PLATFORM NS only]
//   5. Raw sourceValue from TenantConfig                     [always exists]

import type { ResourceId, PlatformStringMap } from "./types";

export function resolveTranslation(
  resourceId: ResourceId,
  requestedLocale: string,
  primaryLocale: string,
  tenantTranslations: Map<string, string>, // `${locale}:${resourceId}` → value
  platformStrings: PlatformStringMap,
  sourceValue: string,
): string {
  // 1. Tenant translation for requested locale
  const tenantRequested = tenantTranslations.get(`${requestedLocale}:${resourceId}`);
  if (tenantRequested !== undefined) return tenantRequested;

  // 2. Platform default for requested locale (PLATFORM namespace only)
  const platformDef = platformStrings.get(resourceId);
  if (platformDef) {
    const platformRequested = platformDef.defaultTranslations[requestedLocale as keyof typeof platformDef.defaultTranslations];
    if (platformRequested !== undefined) return platformRequested;
  }

  // 3. Tenant translation for primary locale
  if (requestedLocale !== primaryLocale) {
    const tenantPrimary = tenantTranslations.get(`${primaryLocale}:${resourceId}`);
    if (tenantPrimary !== undefined) return tenantPrimary;
  }

  // 4. Platform default for primary locale
  if (platformDef && requestedLocale !== primaryLocale) {
    const platformPrimary = platformDef.defaultTranslations[primaryLocale as keyof typeof platformDef.defaultTranslations];
    if (platformPrimary !== undefined) return platformPrimary;
  }

  // 5. Raw source value (always exists)
  return sourceValue;
}
