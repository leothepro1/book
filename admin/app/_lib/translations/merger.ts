// ── Config merger — applies translations to TenantConfig ─────
//
// Pure function. Takes a raw config + translation map, returns
// a new config with translatable strings replaced.
//
// Uses traverseConfigMutable from traversal.ts — the ONLY code
// that knows how to walk config. No duplicated traversal logic.
//
// Used in the guest portal path ONLY — the editor always shows
// primary locale values.

import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import { traverseConfig } from "./traversal";

type TranslationMap = Map<string, string>; // `${locale}:${resourceId}` → value

export function applyTranslationsToConfig(
  config: TenantConfig,
  translationMap: TranslationMap,
  locale: string,
  primaryLocale: string,
): TenantConfig {
  const result = structuredClone(config);

  traverseConfig(result, (field) => {
    const resolved = resolve(translationMap, field.resourceId, locale, primaryLocale);
    if (resolved !== undefined) {
      field.setValue(resolved);
    }
  });

  return result;
}

function resolve(
  translationMap: TranslationMap,
  resourceId: string,
  locale: string,
  primaryLocale: string,
): string | undefined {
  const translated = translationMap.get(`${locale}:${resourceId}`);
  if (translated !== undefined) return translated;

  if (locale !== primaryLocale) {
    const primary = translationMap.get(`${primaryLocale}:${resourceId}`);
    if (primary !== undefined) return primary;
  }

  return undefined; // no translation found — leave source value unchanged
}
