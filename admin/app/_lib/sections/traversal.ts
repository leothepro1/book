/**
 * Section Traversal
 * ═════════════════
 *
 * Central entry point for collecting all SectionInstance[] arrays
 * from a TenantConfig. Delegates to the page config accessor which
 * owns the mapping from PageId → config path.
 *
 * Page discovery is driven by the page registry (layout contract),
 * not by config data presence. This means new section-bearing pages
 * are automatically picked up when added to the registry.
 */

import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import type { SectionInstance } from "./types";
import { getAllSectionBearingPageIds, getPageSections } from "@/app/_lib/pages/config";

/**
 * Returns all section instances across the entire tenant config.
 *
 * Iterates every page where the platform defines body === "sections"
 * and collects their section arrays via the config accessor.
 */
export function collectAllSections(config: TenantConfig): SectionInstance[] {
  const all: SectionInstance[] = [];
  for (const pageId of getAllSectionBearingPageIds()) {
    all.push(...getPageSections(config, pageId));
  }
  return all;
}
