"use client";

import { type CSSProperties } from "react";
import type { CustomerSearchResult } from "@/app/_lib/draft-orders";

const CARD: CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

interface CustomerCardProps {
  customer: CustomerSearchResult | null;
  onChangeClick: () => void;
  onClear: () => void;
}

function buildSelectedMeta(c: CustomerSearchResult): string | null {
  const parts: string[] = [];
  if (c.name) parts.push(c.email);
  if (c.orderCount > 0) {
    parts.push(`${c.orderCount} ${c.orderCount === 1 ? "order" : "ordrar"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function CustomerCard({
  customer,
  onChangeClick,
  onClear,
}: CustomerCardProps) {
  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <span className="pf-card-title">Kund</span>
      </div>

      {customer === null ? (
        <button
          type="button"
          className="admin-btn admin-btn--ghost"
          onClick={onChangeClick}
        >
          + Lägg till kund
        </button>
      ) : (
        <div className="ndr-customer-card__row">
          <div className="ndr-customer-card__main">
            <div className="ndr-customer-card__name">
              {customer.name ?? customer.email}
            </div>
            {(() => {
              const meta = buildSelectedMeta(customer);
              return meta ? (
                <div className="ndr-customer-card__meta">{meta}</div>
              ) : null;
            })()}
          </div>
          <div className="ndr-customer-card__actions">
            <button
              type="button"
              className="ndr-customer-card__change-link"
              onClick={onChangeClick}
            >
              Byt
            </button>
            <button
              type="button"
              className="ndr-customer-card__remove"
              onClick={onClear}
              aria-label="Ta bort kund"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
