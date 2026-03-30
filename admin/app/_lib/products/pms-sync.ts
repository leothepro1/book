/**
 * PMS Product Sync (DEPRECATED)
 * ═════════════════════════════
 *
 * This module previously created Product records for PMS accommodations.
 * Accommodation sync now uses syncAccommodations() from @/app/_lib/accommodations.
 * This stub is kept so existing imports don't break.
 */

import { log } from "@/app/_lib/logger";

export interface PmsSyncResult {
  created: number;
  updated: number;
  unchanged: number;
  errors: Array<{ pmsSourceId: string; error: string }>;
  collections: { created: number; updated: number };
}

/**
 * @deprecated Use syncAccommodations() from @/app/_lib/accommodations instead.
 */
export async function syncPmsProducts(
  tenantId: string,
  _provider: string,
): Promise<PmsSyncResult> {
  log("warn", "pms_sync.deprecated", {
    tenantId,
    message: "syncPmsProducts is deprecated — use syncAccommodations()",
  });
  return {
    created: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
    collections: { created: 0, updated: 0 },
  };
}
