"use client";

import { type CSSProperties } from "react";
import type { DraftLineItem } from "@prisma/client";
import { formatSek } from "@/app/_lib/money/format";
import { formatDateRange } from "@/app/_lib/search/dates";

const CARD: CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

const TABLE: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const TH: CSSProperties = {
  textAlign: "left",
  padding: "8px 8px",
  borderBottom: "1px solid var(--admin-border)",
  color: "var(--admin-text-muted)",
  fontWeight: 500,
};

const TH_RIGHT: CSSProperties = { ...TH, textAlign: "right" };

const TD: CSSProperties = {
  padding: "10px 8px",
  borderBottom: "1px solid var(--admin-border)",
  color: "var(--admin-text)",
  verticalAlign: "top",
};

const TD_RIGHT: CSSProperties = { ...TD, textAlign: "right" };

const EMPTY: CSSProperties = {
  fontSize: 13,
  color: "var(--admin-text-muted)",
};

type LineItemView = Pick<
  DraftLineItem,
  | "id"
  | "title"
  | "checkInDate"
  | "checkOutDate"
  | "quantity"
  | "unitPriceCents"
  | "totalCents"
>;

interface LineItemsCardProps {
  lines: LineItemView[];
}

function formatLineDates(line: LineItemView): string {
  if (line.checkInDate && line.checkOutDate) {
    return formatDateRange(line.checkInDate, line.checkOutDate);
  }
  return "—";
}

export function LineItemsCard({ lines }: LineItemsCardProps) {
  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <span className="pf-card-title">Bokning</span>
      </div>

      {lines.length === 0 ? (
        <p style={EMPTY}>Inga rader.</p>
      ) : (
        <table style={TABLE}>
          <thead>
            <tr>
              <th style={TH}>Boende</th>
              <th style={TH}>Datum</th>
              <th style={TH_RIGHT}>Antal</th>
              <th style={TH_RIGHT}>À pris</th>
              <th style={TH_RIGHT}>Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td style={TD}>{line.title}</td>
                <td style={TD}>{formatLineDates(line)}</td>
                <td style={TD_RIGHT}>{line.quantity}</td>
                <td style={TD_RIGHT}>{formatSek(line.unitPriceCents)}</td>
                <td style={TD_RIGHT}>{formatSek(line.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
