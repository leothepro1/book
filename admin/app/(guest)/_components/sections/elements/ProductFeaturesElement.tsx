"use client";

import type { ResolvedElement } from "@/app/_lib/sections/types";
import { useProduct } from "@/app/(guest)/_lib/product-context/ProductContext";

/**
 * Product Features — 3×2 icon grid.
 * 6 items with icon + title, 3 per row.
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
  frukost: "Frukost",
  städning: "Städning",
  wifi: "Wifi",
  kök: "Kök",
  tv: "TV",
  terrass: "Terrass",
  badrum: "Badrum",
  uteplats: "Uteplats",
  parkering: "Parkering",
  el: "El",
  servicehus: "Servicehus",
  vatten: "Vatten",
  avlopp: "Avlopp",
  kylskåp: "Kylskåp",
  micro: "Mikro",
  altan: "Altan",
  grill: "Grill",
  husdjur_ok: "Husdjur OK",
  hårdgjord: "Hårdgjord",
};

export function ProductFeaturesElement({ resolved }: { resolved: ResolvedElement }) {
  const product = useProduct();
  const { settings } = resolved;
  const columns = (settings.columns as string) || "3";
  const iconSize = (settings.iconSize as number) || 20;

  const facilities: string[] = product?.facilities ?? [];

  if (facilities.length === 0) {
    return (
      <div style={{ fontSize: "0.8125rem", color: "color-mix(in srgb, var(--text, #000) 40%, transparent)" }}>
        Inga egenskaper
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: "12px 16px",
      }}
    >
      {facilities.slice(0, 6).map((facility) => (
        <div key={facility} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className="material-symbols-rounded"
            style={{
              fontSize: iconSize,
              color: "var(--text)",
              opacity: 0.6,
              flexShrink: 0,
            }}
          >
            {FACILITY_ICONS[facility] ?? "check_circle"}
          </span>
          <span style={{ fontSize: "0.8125rem", color: "var(--text)", opacity: 0.8 }}>
            {FACILITY_LABELS[facility] ?? facility}
          </span>
        </div>
      ))}
    </div>
  );
}
