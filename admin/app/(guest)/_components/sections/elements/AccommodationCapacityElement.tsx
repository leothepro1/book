"use client";

/**
 * Accommodation Capacity element.
 * Renders: "4 gäster · 2 sovrum · 1 badrum · 45 m²"
 * Dot-separated inline list from ProductContext capacity fields.
 */

import type { ResolvedElement } from "@/app/_lib/sections/types";
import { useProduct } from "@/app/(guest)/_lib/product-context/ProductContext";

export function AccommodationCapacityElement({ resolved }: { resolved: ResolvedElement }) {
  const product = useProduct();
  if (!product || product.productType !== "ACCOMMODATION") return null;

  const items: string[] = [];

  if (product.maxGuests != null && product.maxGuests > 0) {
    items.push(`${product.maxGuests} gäster`);
  }
  if (product.bedrooms != null && product.bedrooms > 0) {
    items.push(`${product.bedrooms} sovrum`);
  }
  if (product.bathrooms != null && product.bathrooms > 0) {
    items.push(`${product.bathrooms} badrum`);
  }
  if (product.roomSizeSqm != null && product.roomSizeSqm > 0) {
    items.push(`${product.roomSizeSqm} m²`);
  }
  if (product.extraBeds > 0) {
    items.push(`${product.extraBeds} extrasängar`);
  }

  if (items.length === 0) {
    return (
      <div style={{ fontSize: "0.8125rem", color: "color-mix(in srgb, var(--text, #000) 40%, transparent)" }}>
        Ingen kapacitet angiven
      </div>
    );
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "0.5rem",
      fontSize: "0.875rem",
      color: "color-mix(in srgb, var(--text, #000) 70%, transparent)",
      lineHeight: "1.5",
    }}>
      {items.map((item, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {i > 0 && <span style={{ fontSize: "0.5rem", opacity: 0.5 }}>●</span>}
          <span>{item}</span>
        </span>
      ))}
    </div>
  );
}
