/**
 * Section Traversal
 * ═════════════════
 *
 * Central entry point for collecting all SectionInstance[] arrays
 * from a TenantConfig. Every config path that carries sections
 * must be registered here.
 *
 * Consumers (e.g. color scheme reference detection, bulk validation)
 * call collectAllSections() instead of reaching into config paths
 * directly. This ensures a single place to update when new
 * section-bearing pages are added.
 */

import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import type { SectionInstance } from "./types";

/**
 * Returns all section instances across the entire tenant config.
 *
 * Currently supported section trees:
 *   - home.sections (guest portal home page)
 *
 * When a new page (e.g. "rooms", "dining") gains its own sections[],
 * add it here. This is the single source of truth for "where do
 * sections live in TenantConfig?".
 */
export function collectAllSections(config: TenantConfig): SectionInstance[] {
  const all: SectionInstance[] = [];

  // Home page sections
  if (config.home?.sections) {
    all.push(...config.home.sections);
  }

  // Future: add other section-bearing config paths here
  // if (config.rooms?.sections) all.push(...config.rooms.sections);

  return all;
}
