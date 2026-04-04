/**
 * Apply translations to DB-backed resources at render time.
 *
 * Unlike config-based translations (handled by merger.ts via traverseConfig),
 * DB-backed resources (products, accommodations, etc.) need translations
 * applied after they're loaded from Prisma.
 *
 * This module provides a simple, generic function that takes any object
 * with translatable fields and applies matching translations from the
 * TenantTranslation table.
 *
 * Usage (in a server component or API route):
 *   const product = await prisma.product.findUnique(...);
 *   const translated = await applyTranslations(tenantId, locale, "product", product.id, product, ["title", "description"]);
 */

import { prisma } from "@/app/_lib/db/prisma";
import { PRIMARY_LOCALE } from "./locales";

/**
 * Apply translations to a single DB-backed resource.
 *
 * @param tenantId     Tenant ID
 * @param locale       Requested locale (e.g. "de")
 * @param segment      ResourceId segment (e.g. "product", "collection", "accommodation")
 * @param itemId       Item's DB ID
 * @param data         The object to translate (mutated in place for performance)
 * @param fields       Field keys to translate (e.g. ["title", "description"])
 * @returns            The same object with translated fields applied
 */
export async function applyTranslations<T extends Record<string, unknown>>(
  tenantId: string,
  locale: string,
  segment: string,
  itemId: string,
  data: T,
  fields: string[],
): Promise<T> {
  // Primary locale = source language, no translations needed
  if (locale === PRIMARY_LOCALE) return data;

  // Build resourceId patterns for all fields
  const resourceIds = fields.map((f) => `tenant:${segment}:${itemId}:${f}`);

  // One bulk query — fetch all translations for this item + locale
  const rows = await prisma.tenantTranslation.findMany({
    where: {
      tenantId,
      locale,
      resourceId: { in: resourceIds },
    },
    select: { resourceId: true, value: true },
  });

  // Apply translations to data object
  for (const row of rows) {
    // Extract field key from resourceId: "tenant:product:abc123:title" → "title"
    const fieldKey = row.resourceId.split(":").pop();
    if (fieldKey && row.value && fieldKey in data) {
      (data as Record<string, unknown>)[fieldKey] = row.value;
    }
  }

  return data;
}

/**
 * Apply translations to an array of DB-backed resources.
 * Batches all translations into a single query for performance.
 *
 * @param tenantId     Tenant ID
 * @param locale       Requested locale
 * @param segment      ResourceId segment
 * @param items        Array of { id, ...fields } objects
 * @param fields       Field keys to translate
 * @returns            Same array with translations applied
 */
export async function applyTranslationsBatch<T extends Record<string, unknown> & { id: string }>(
  tenantId: string,
  locale: string,
  segment: string,
  items: T[],
  fields: string[],
): Promise<T[]> {
  if (locale === PRIMARY_LOCALE || items.length === 0) return items;

  // Build all resourceIds for all items × all fields
  const resourceIds = items.flatMap((item) =>
    fields.map((f) => `tenant:${segment}:${item.id}:${f}`),
  );

  // One bulk query for ALL items
  const rows = await prisma.tenantTranslation.findMany({
    where: {
      tenantId,
      locale,
      resourceId: { in: resourceIds },
    },
    select: { resourceId: true, value: true },
  });

  // Index by resourceId for O(1) lookup
  const translationMap = new Map(rows.map((r) => [r.resourceId, r.value]));

  // Apply to each item
  for (const item of items) {
    for (const field of fields) {
      const rid = `tenant:${segment}:${item.id}:${field}`;
      const translated = translationMap.get(rid);
      if (translated) {
        (item as Record<string, unknown>)[field] = translated;
      }
    }
  }

  return items;
}
