"use client";

import type { DiscountStatus } from "@prisma/client";

const STATUS_STYLES: Record<DiscountStatus, { background: string; color: string }> = {
  ACTIVE:    { background: "#C8F4D6", color: "#0D5626" },
  SCHEDULED: { background: "#D6E8FF", color: "#1A4B8E" },
  EXPIRED:   { background: "#E8E8E8", color: "#616161" },
  DISABLED:  { background: "#FED1D7", color: "#8E0B21" },
};

const STATUS_LABELS: Record<DiscountStatus, string> = {
  ACTIVE:    "Aktiv",
  SCHEDULED: "Schemalagd",
  EXPIRED:   "Utgången",
  DISABLED:  "Avaktiverad",
};

export function DiscountStatusBadge({ status }: { status: DiscountStatus }) {
  const style = STATUS_STYLES[status];
  const label = STATUS_LABELS[status];

  return (
    <span
      style={{
        background: style.background,
        color: style.color,
        borderRadius: 8,
        padding: "2px 8px",
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: "nowrap",
        display: "inline-block",
      }}
    >
      {label}
    </span>
  );
}
