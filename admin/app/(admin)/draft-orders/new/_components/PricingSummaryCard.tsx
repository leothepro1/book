"use client";

import { type CSSProperties } from "react";
import { formatSek } from "@/app/_lib/money/format";
import type { PreviewResult } from "@/app/_lib/draft-orders";

const CARD: CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

interface PricingSummaryCardProps {
  preview: PreviewResult | null;
  isLoading: boolean;
  hasLines: boolean;
  error: string | null;
}

export function PricingSummaryCard({
  preview,
  isLoading,
  hasLines,
  error,
}: PricingSummaryCardProps) {
  // Cross-tenant fail-closed: service returns emptyResult shape (lineBreakdown=[])
  // when an accommodationId belongs to another tenant. Show error rather than 0 kr.
  const isCrossTenantFailClosed =
    hasLines && preview !== null && preview.lineBreakdown.length === 0;

  const showError = error !== null || isCrossTenantFailClosed;
  const displayError = error ?? "Kunde inte beräkna totaler";

  const showPlaceholder = !showError && (!hasLines || preview === null);

  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <span className="pf-card-title">Sammanfattning</span>
      </div>

      {showError ? (
        <div className="pf-error-banner">{displayError}</div>
      ) : showPlaceholder ? (
        <div className="ndr-pricing__placeholder">
          Lägg till boende för att se totalsumma
        </div>
      ) : preview ? (
        <div
          className={
            isLoading ? "ndr-pricing ndr-pricing--loading" : "ndr-pricing"
          }
          aria-busy={isLoading}
          aria-live="polite"
        >
          <div className="ndr-pricing__row">
            <span className="ndr-pricing__label">Delsumma</span>
            <span className="ndr-pricing__amount">
              {formatSek(preview.subtotal)}
            </span>
          </div>
          {preview.discountApplicable &&
          preview.discountAmount > BigInt(0) ? (
            <div className="ndr-pricing__row">
              <span className="ndr-pricing__label">Rabatt</span>
              <span className="ndr-pricing__amount">
                −{formatSek(preview.discountAmount)}
              </span>
            </div>
          ) : null}
          {preview.taxAmount > BigInt(0) ? (
            <div className="ndr-pricing__row">
              <span className="ndr-pricing__label">Moms</span>
              <span className="ndr-pricing__amount">
                {formatSek(preview.taxAmount)}
              </span>
            </div>
          ) : null}
          <div className="ndr-pricing__divider" />
          <div className="ndr-pricing__row ndr-pricing__row--total">
            <span className="ndr-pricing__label">Totalt</span>
            <span className="ndr-pricing__amount">
              {formatSek(preview.total)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
