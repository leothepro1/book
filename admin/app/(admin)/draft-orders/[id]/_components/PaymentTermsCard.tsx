"use client";

import { type CSSProperties } from "react";

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

const FROZEN_BADGE: CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  background: "#E8E8E8",
  color: "#616161",
  borderRadius: 8,
  fontSize: 11,
  fontWeight: 500,
};

interface PaymentTermsCardProps {
  paymentTermsId: string;
  name: string | null;
  depositPercent: number | null;
  frozen: boolean;
}

export function PaymentTermsCard({
  paymentTermsId,
  name,
  depositPercent,
  frozen,
}: PaymentTermsCardProps) {
  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <span className="pf-card-title">Betalningsvillkor</span>
      </div>
      <div style={ROW}>
        <span style={LABEL}>Villkor</span>
        <span>{name ?? paymentTermsId}</span>
      </div>
      {depositPercent !== null && (
        <div style={ROW}>
          <span style={LABEL}>Deposition</span>
          <span>{depositPercent.toLocaleString("sv-SE")} %</span>
        </div>
      )}
      {frozen && (
        <div style={ROW}>
          <span style={LABEL}>Status</span>
          <span style={FROZEN_BADGE}>Låst</span>
        </div>
      )}
    </div>
  );
}
