"use client";

/**
 * Accommodation Highlights element — vertical icon list.
 * Each row: icon (left) + title & description stacked vertically (right).
 * Reads from ProductContext.highlights.
 */

import type { ResolvedElement } from "@/app/_lib/sections/types";
import { useProduct } from "@/app/(guest)/_lib/product-context/ProductContext";
import "./accommodation-highlights-element.css";

export function AccommodationHighlightsElement({ resolved }: { resolved: ResolvedElement }) {
  const product = useProduct();
  const { settings } = resolved;
  const iconSize = (settings.iconSize as number) || 28;
  const gap = (settings.gap as number) || 20;
  const highlights = product?.highlights ?? [];

  if (highlights.length === 0) {
    return (
      <div className="ah-el__empty">
        Inga höjdpunkter
      </div>
    );
  }

  return (
    <div className="ah-el" style={{ gap }}>
      {highlights.map((h, i) => (
        <div key={i} className="ah-el__item">
          <span
            className="material-symbols-rounded ah-el__icon"
            style={{ fontSize: iconSize }}
          >
            {h.icon || "check_circle"}
          </span>
          <div className="ah-el__content">
            <span className="ah-el__title">{h.text}</span>
            {h.description && (
              <span className="ah-el__desc">{h.description}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
