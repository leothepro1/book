/**
 * Color Scheme Reference Detection
 * ═════════════════════════════════
 *
 * Shared helper that finds which color scheme IDs are actively
 * referenced by sections in a TenantConfig.
 *
 * Delegates section collection to the sections module's central
 * traversal entry point — no manually maintained extractor list.
 *
 * Used by:
 *   - Editor (deletion guard: block delete when scheme is in use)
 *   - Validation (orphan detection, reference integrity)
 */

import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import { collectAllSections } from "@/app/_lib/sections/traversal";
import { getPageHeader, getPageFooter } from "@/app/_lib/pages/config";

/**
 * Collects all color scheme IDs referenced anywhere in the tenant
 * configuration: body sections, page header, and page footer.
 *
 * Returns a Set for O(1) lookup in deletion guards.
 */
export function collectReferencedSchemeIds(config: TenantConfig): Set<string> {
  const ids = new Set<string>();

  // Body sections
  for (const section of collectAllSections(config)) {
    if (section.colorSchemeId) {
      ids.add(section.colorSchemeId);
    }
  }

  // Global header + footer
  const header = getPageHeader(config);
  if (header?.colorSchemeId) ids.add(header.colorSchemeId);
  const footer = getPageFooter(config);
  if (footer?.colorSchemeId) ids.add(footer.colorSchemeId);

  return ids;
}

/**
 * Computes the next sequence number for a new scheme.
 * Returns max(existing sequences) + 1, or 1 if no schemes exist.
 * Never reuses deleted sequence numbers.
 */
export function nextSchemeSequence(
  schemes: { sequence: number }[],
): number {
  if (schemes.length === 0) return 1;
  return Math.max(...schemes.map((s) => s.sequence)) + 1;
}
