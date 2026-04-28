"use client";

import { type CSSProperties } from "react";
import type { DiscountValueType } from "@prisma/client";
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

const CODE_CHIP: CSSProperties = {
  display: "inline-block",
  padding: "3px 8px",
  background: "var(--admin-surface-muted)",
  border: "1px solid var(--admin-border)",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.02em",
  color: "var(--admin-text)",
};

const EMPTY: CSSProperties = {
  fontSize: 13,
  color: "var(--admin-text-muted)",
};

interface DiscountCardProps {
  appliedDiscountCode: string | null;
  appliedDiscountAmount: bigint | null;
  appliedDiscountType: DiscountValueType | null;
}

const TYPE_LABELS: Record<DiscountValueType, string> = {
  PERCENTAGE: "Procent",
  FIXED_AMOUNT: "Fast belopp",
};

export function DiscountCard({
  appliedDiscountCode,
  appliedDiscountAmount,
  appliedDiscountType,
}: DiscountCardProps) {
  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <span className="pf-card-title">Rabatt</span>
      </div>
      {appliedDiscountCode === null ? (
        <p style={EMPTY}>Ingen rabatt tillämpad.</p>
      ) : (
        <>
          <div style={ROW}>
            <span style={LABEL}>Kod</span>
            <span style={CODE_CHIP}>{appliedDiscountCode}</span>
          </div>
          {appliedDiscountAmount !== null && (
            <div style={ROW}>
              <span style={LABEL}>Belopp</span>
              <span>−{formatSek(appliedDiscountAmount)}</span>
            </div>
          )}
          {appliedDiscountType !== null && (
            <div style={ROW}>
              <span style={LABEL}>Typ</span>
              <span>{TYPE_LABELS[appliedDiscountType]}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
