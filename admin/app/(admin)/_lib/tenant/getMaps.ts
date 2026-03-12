"use server";

import { getCurrentTenant } from "./getCurrentTenant";
import type { MapConfig } from "@/app/(guest)/_lib/tenant/types";

/** Summary type for picker dropdowns — excludes heavy marker content/description */
export type MapSummary = {
  id: string;
  name: string;
  style: string;
  markerCount: number;
};

/**
 * Fetch saved maps from draft (or live) config.
 * Used by admin /maps page and anywhere that needs full map data.
 */
export async function getMaps(): Promise<MapConfig[]> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  const { tenant } = tenantData;
  const config = (tenant.draftSettings || tenant.settings || {}) as Record<string, unknown>;
  const maps = config.maps as MapConfig[] | undefined;
  return Array.isArray(maps) ? maps : [];
}

/**
 * Lightweight map list for picker dropdowns (FieldMapPicker).
 * Returns only id, name, style, and marker count — no content/coordinates/markers.
 * Reduces payload from ~5-20KB per map to ~100 bytes per map.
 */
export async function getMapSummaries(): Promise<MapSummary[]> {
  const maps = await getMaps();
  return maps.map((m) => ({
    id: m.id,
    name: m.name,
    style: m.style,
    markerCount: m.markers?.length ?? 0,
  }));
}
