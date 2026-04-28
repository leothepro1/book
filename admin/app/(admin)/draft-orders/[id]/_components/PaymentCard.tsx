"use client";

import { type CSSProperties } from "react";
import type { DraftOrder } from "@prisma/client";
import { formatSek } from "@/app/_lib/money/format";

const CARD: CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

const ROW: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: 13,
  marginTop: 8,
  color: "var(--admin-text)",
};

const LABEL: CSSProperties = {
  color: "var(--admin-text-muted)",
};

const TOTAL_ROW: CSSProperties = {
  ...ROW,
  borderTop: "1px solid var(--admin-border)",
  paddingTop: 10,
  marginTop: 12,
  fontSize: 14,
  fontWeight: 600,
};

type PaymentCardDraft = Pick<
  DraftOrder,
  | "subtotalCents"
  | "orderDiscountCents"
  | "shippingCents"
  | "totalTaxCents"
  | "totalCents"
  | "currency"
>;

interface PaymentCardProps {
  draft: PaymentCardDraft;
}

export function PaymentCard({ draft }: PaymentCardProps) {
  const showDiscount = draft.orderDiscountCents > BigInt(0);
  const showShipping = draft.shippingCents > BigInt(0);
  const showTax = draft.totalTaxCents > BigInt(0);

  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <span className="pf-card-title">Betalning</span>
      </div>

      <div style={ROW}>
        <span style={LABEL}>Delsumma</span>
        <span>{formatSek(draft.subtotalCents)}</span>
      </div>
      {showDiscount && (
        <div style={ROW}>
          <span style={LABEL}>Rabatt</span>
          <span>−{formatSek(draft.orderDiscountCents)}</span>
        </div>
      )}
      {showShipping && (
        <div style={ROW}>
          <span style={LABEL}>Frakt</span>
          <span>{formatSek(draft.shippingCents)}</span>
        </div>
      )}
      {showTax && (
        <div style={ROW}>
          <span style={LABEL}>Moms</span>
          <span>{formatSek(draft.totalTaxCents)}</span>
        </div>
      )}
      <div style={TOTAL_ROW}>
        <span>Totalt</span>
        <span>{formatSek(draft.totalCents)}</span>
      </div>
    </div>
  );
}
