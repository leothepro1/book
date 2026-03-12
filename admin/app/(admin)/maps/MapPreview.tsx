"use client";

/**
 * MapPreview — Admin preview that renders the exact same MapModalBody
 * as the guest portal, always in "opened" state (interactive map +
 * marker sheets on pin click).
 *
 * No close button, no title pill — those are part of MapMorphModal
 * which wraps the guest portal version.
 *
 * The preview container uses CSS containment so that the MarkerSheet
 * (position: fixed) stays within the preview panel instead of
 * covering the whole page.
 */

import type { MapConfig } from "./maps-constants";
import { MapModalBody } from "@/app/(guest)/_components/sections/elements/MapElement";
import "@/app/(guest)/_components/cards/cards.css";

export function MapPreview({ map }: { map: MapConfig }) {
  return <MapModalBody mapConfig={map} />;
}
