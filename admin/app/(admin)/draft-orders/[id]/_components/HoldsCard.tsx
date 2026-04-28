"use client";

import { type CSSProperties } from "react";
import type {
  DraftHoldState,
  DraftLineItem,
  DraftReservation,
} from "@prisma/client";
import { BUCKET_STYLES } from "@/app/_lib/orders/badge";
import type { BadgeBucket } from "@/app/_lib/orders/badge";
import { formatDateRange } from "@/app/_lib/search/dates";

const CARD: CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

const LIST: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const ITEM: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: 10,
  border: "1px solid var(--admin-border)",
  borderRadius: 8,
};

const TITLE_ROW: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
};

const TITLE: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "var(--admin-text)",
};

const META: CSSProperties = {
  fontSize: 12,
  color: "var(--admin-text-muted)",
};

const EMPTY: CSSProperties = {
  fontSize: 13,
  color: "var(--admin-text-muted)",
};

const HOLD_LABELS: Record<DraftHoldState, string> = {
  NOT_PLACED: "Ej placerad",
  PLACING: "Placeras",
  PLACED: "Placerad",
  CONFIRMED: "Bekräftad",
  RELEASED: "Släppt",
  FAILED: "Misslyckades",
};

const HOLD_BUCKETS: Record<DraftHoldState, BadgeBucket> = {
  NOT_PLACED: "AVSLUTAD",
  PLACING: "PÅGÅENDE",
  PLACED: "VÄNTANDE",
  CONFIRMED: "AVSLUTAD",
  RELEASED: "AVSLUTAD",
  FAILED: "PROBLEM",
};

const BADGE: CSSProperties = {
  borderRadius: 8,
  padding: "2px 8px",
  fontSize: 11,
  fontWeight: 500,
  whiteSpace: "nowrap",
  display: "inline-block",
};

type LineItemRef = Pick<DraftLineItem, "id" | "title">;

interface HoldsCardProps {
  reservations: DraftReservation[];
  lineItems: LineItemRef[];
}

export function HoldsCard({ reservations, lineItems }: HoldsCardProps) {
  const titleByLineItemId = new Map(lineItems.map((l) => [l.id, l.title]));

  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <span className="pf-card-title">Reservationer</span>
      </div>

      {reservations.length === 0 ? (
        <p style={EMPTY}>Inga reservationer.</p>
      ) : (
        <div style={LIST}>
          {reservations.map((r) => {
            const title = titleByLineItemId.get(r.draftLineItemId) ?? "—";
            const bucket = HOLD_BUCKETS[r.holdState];
            const style = BUCKET_STYLES[bucket];
            return (
              <div key={r.id} style={ITEM}>
                <div style={TITLE_ROW}>
                  <span style={TITLE}>{title}</span>
                  <span
                    style={{
                      ...BADGE,
                      background: style.background,
                      color: style.color,
                    }}
                  >
                    {HOLD_LABELS[r.holdState]}
                  </span>
                </div>
                <div style={META}>
                  {formatDateRange(r.checkInDate, r.checkOutDate)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
