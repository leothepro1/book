/**
 * SEO save-boundary normalization
 * ═══════════════════════════════
 *
 * Strip keys whose trimmed string value is empty from a partial
 * `SeoMetadata` payload. Used at the save boundary so `seo.title =
 * ""` is never persisted — "no override" is represented by the
 * absence of the key, matching Shopify's SERP-panel semantic.
 *
 * Why this matters:
 *   - Stored shape stays canonical. A merchant who types "New
 *     title" then clears it produces the same stored JSON as a
 *     merchant who never set the field.
 *   - Diffing + dirty-tracking ("has this row been edited?")
 *     doesn't have to special-case `{ title: "" }` vs
 *     `{ title: undefined }`.
 *   - The resolver's `if (override) { ... }` truthy check at
 *     `resolver.ts:150` already treats `""` as falsy at read
 *     time, so stripping at write time does not change rendered
 *     output — just the stored representation.
 *
 * Non-string values (booleans like `noindex`, arrays like
 * `structuredDataExtensions`, object refs like structured-data
 * extension entries) are preserved verbatim. Null and undefined
 * values are stripped.
 */

import type { SeoMetadata } from "./types";

export function stripEmptySeoKeys(
  seo: Partial<SeoMetadata>,
): Partial<SeoMetadata> {
  const out: Partial<SeoMetadata> = {};

  for (const [key, value] of Object.entries(seo)) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string") {
      if (value.trim().length > 0) {
        // Cast limited to "this exact partial shape" — `Object.entries`
        // loses per-key type precision but the outer signature is
        // already `Partial<SeoMetadata>`, so the narrowing is safe.
        (out as Record<string, unknown>)[key] = value;
      }
      continue;
    }

    // Booleans, arrays, objects — preserved verbatim.
    (out as Record<string, unknown>)[key] = value;
  }

  return out;
}
