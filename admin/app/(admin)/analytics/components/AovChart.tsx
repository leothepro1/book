"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";

interface AovChartProps {
  data: Array<{ date: string; value: number }>;
  currency: string;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

function abbreviateCurrency(value: number, currency: string): string {
  const major = value / 100;
  const suffix = currency === "SEK" ? " kr" : ` ${currency}`;
  if (major >= 1000) {
    return `${Math.round(major / 1000)}k${suffix}`;
  }
  return `${Math.round(major)}${suffix}`;
}

export function AovChart({ data, currency }: AovChartProps) {
  if (!data || data.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <p style={{ color: "var(--admin-text-secondary)" }}>
          Ingen AOV-data för perioden
        </p>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDateShort}
            tick={{ fill: "var(--admin-text-secondary)", fontSize: "var(--font-xs)" }}
          />
          <YAxis
            tickFormatter={(v: number) => abbreviateCurrency(v, currency)}
            tick={{ fill: "var(--admin-text-secondary)", fontSize: "var(--font-xs)" }}
          />
          <Tooltip
            formatter={(value: unknown) => [
              formatPriceDisplay(Number(value), currency) + (currency === "SEK" ? " kr" : ` ${currency}`),
              "Snittorder",
            ]}
            labelFormatter={(label: unknown) => formatDateShort(String(label))}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#0075DE"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, fill: "#0075DE" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
