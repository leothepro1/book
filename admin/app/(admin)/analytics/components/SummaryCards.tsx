"use client";

import { formatPriceDisplay } from "@/app/_lib/products/pricing";

type Props = {
  summary: {
    revenue: number;
    sessions: number;
    orders: number;
    averageOrderValue: number;
    returningCustomerRate: number;
    visitors: number;
  } | null;
  currency: string;
  loading: boolean;
};

function formatAmount(oren: number, currency: string): string {
  if (oren === 0) return "–";
  return formatPriceDisplay(oren, currency) + (currency === "SEK" ? " kr" : "");
}

function formatRate(basisPoints: number): string {
  if (basisPoints === 0) return "–";
  return (basisPoints / 100).toFixed(1) + "%";
}

const CARDS = [
  { key: "revenue", label: "Omsättning", format: "currency" },
  { key: "sessions", label: "Sessioner", format: "number" },
  { key: "orders", label: "Ordrar", format: "number" },
  { key: "averageOrderValue", label: "Snittordervärde", format: "currency" },
  { key: "returningCustomerRate", label: "Återkommande kunder", format: "rate" },
  { key: "visitors", label: "Besökare", format: "number" },
] as const;

export function SummaryCards({ summary, currency, loading }: Props) {
  return (
    <div className="analytics-summary-grid">
      {CARDS.map((card) => {
        const value = summary ? summary[card.key] : 0;
        let display: string;

        if (loading || !summary) {
          display = "";
        } else if (card.format === "currency") {
          display = formatAmount(value, currency);
        } else if (card.format === "rate") {
          display = formatRate(value);
        } else {
          display = value === 0 ? "–" : String(value);
        }

        return (
          <div key={card.key} className="analytics-summary-card">
            <div className="analytics-summary-card__label">{card.label}</div>
            {loading ? (
              <div className="analytics-summary-card__skeleton" />
            ) : (
              <div className="analytics-summary-card__value">{display}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
