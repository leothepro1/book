"use server";

import { getCurrentTenant } from "./getCurrentTenant";
import type { MapConfig } from "@/app/(guest)/_lib/tenant/types";

/**
 * Fetch saved maps from draft (or live) config.
 * Used by FieldMapPicker in the editor to populate the dropdown.
 */
export async function getMaps(): Promise<MapConfig[]> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  const { tenant } = tenantData;
  const config = (tenant.draftSettings || tenant.settings || {}) as Record<string, unknown>;
  const maps = config.maps as MapConfig[] | undefined;
  return Array.isArray(maps) ? maps : [];
}
