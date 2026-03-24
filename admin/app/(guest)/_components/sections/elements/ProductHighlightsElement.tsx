"use client";

import type { ResolvedElement } from "@/app/_lib/sections/types";
import { useProduct } from "@/app/(guest)/_lib/product-context/ProductContext";

/**
 * Product Highlights — vertical icon list.
 * Each item: icon + heading + subtitle stacked vertically.
 * Maps product facilities to Material Symbols icons.
 */

const FACILITY_ICONS: Record<string, string> = {
  frukost: "restaurant",
  städning: "cleaning_services",
  wifi: "wifi",
  kök: "kitchen",
  tv: "tv",
  terrass: "deck",
  badrum: "bathtub",
  uteplats: "yard",
  parkering: "local_parking",
  el: "bolt",
  servicehus: "other_houses",
  vatten: "water_drop",
  avlopp: "plumbing",
  kylskåp: "kitchen",
  micro: "microwave",
  altan: "deck",
  grill: "outdoor_grill",
  husdjur_ok: "pets",
  hårdgjord: "foundation",
};

const FACILITY_LABELS: Record<string, string> = {
  frukost: "Frukost ingår",
  städning: "Slutstädning ingår",
  wifi: "Gratis wifi",
  kök: "Kök",
  tv: "TV",
  terrass: "Terrass",
  badrum: "Eget badrum",
  uteplats: "Uteplats",
  parkering: "Parkering",
  el: "El ingår",
  servicehus: "Servicehus",
  vatten: "Vatten",
  avlopp: "Avlopp",
  kylskåp: "Kylskåp",
  micro: "Mikrovågsugn",
  altan: "Altan",
  grill: "Grillplats",
  husdjur_ok: "Husdjur tillåtna",
  hårdgjord: "Hårdgjord yta",
};

export function ProductHighlightsElement({ resolved }: { resolved: ResolvedElement }) {
  const product = useProduct();
  const { settings } = resolved;
  const iconSize = (settings.iconSize as number) || 24;

  const facilities: string[] = product?.facilities ?? [];

  if (facilities.length === 0) {
    return (
      <div style={{ fontSize: "0.8125rem", color: "color-mix(in srgb, var(--text, #000) 40%, transparent)" }}>
        Inga höjdpunkter
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {facilities.slice(0, 6).map((facility) => (
        <div key={facility} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            className="material-symbols-rounded"
            style={{
              fontSize: iconSize,
              color: "var(--text)",
              opacity: 0.7,
              flexShrink: 0,
            }}
          >
            {FACILITY_ICONS[facility] ?? "check_circle"}
          </span>
          <span style={{ fontSize: "0.875rem", color: "var(--text)", fontWeight: 500 }}>
            {FACILITY_LABELS[facility] ?? facility}
          </span>
        </div>
      ))}
    </div>
  );
}
