// ── Translation scanner ───────────────────────────────────────
//
// Traverses a TenantConfig and emits all translatable fields with
// their current status (TRANSLATED / OUTDATED / MISSING).
//
// Synchronous. Browser-safe — no Node.js APIs.

import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import type {
  TranslatableField,
  TranslationStatus,
  StoredTranslation,
} from "./types";
import { computeDigest } from "./digest";
import { traverseConfig } from "./traversal";

// ── Status resolution ────────────────────────────────────────

function resolveStatus(
  sourceDigest: string,
  existing?: StoredTranslation,
): TranslationStatus {
  if (!existing) return "MISSING";
  if (existing.sourceDigest !== sourceDigest) return "OUTDATED";
  return "TRANSLATED";
}

// ── Scanner ──────────────────────────────────────────────────

export function scanTranslatableStrings(
  config: TenantConfig,
  existingTranslations: Map<string, StoredTranslation>,
  targetLocale: string,
): TranslatableField[] {
  const fields: TranslatableField[] = [];

  traverseConfig(config, (raw) => {
    const sourceDigest = computeDigest(raw.sourceValue);
    const lookupKey = `${targetLocale}:${raw.resourceId}`;
    const existing = existingTranslations.get(lookupKey);
    const status = resolveStatus(sourceDigest, existing);

    fields.push({
      resourceId: raw.resourceId,
      namespace: raw.namespace,
      sourceValue: raw.sourceValue,
      sourceDigest,
      translatedValue: existing?.value,
      translationDigest: existing?.sourceDigest,
      status,
      context: {
        pageId: raw.pageId,
        pageName: raw.pageName,
        sectionId: raw.sectionId,
        sectionName: raw.sectionName,
        blockId: raw.blockId,
        elementId: raw.elementId,
        fieldLabel: raw.fieldLabel,
      },
    });
  });

  return fields;
}
