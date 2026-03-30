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

interface ReturningChartProps {
  data: Array<{ date: string; value: number }>;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

function basisPointsToPercent(bp: number): string {
  return (bp / 100).toFixed(1) + "%";
}

export function ReturningChart({ data }: ReturningChartProps) {
  if (!data || data.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <p style={{ color: "var(--admin-text-secondary)" }}>
          Ingen kunddata för perioden
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
            domain={[0, 10000]}
            tickFormatter={basisPointsToPercent}
            tick={{ fill: "var(--admin-text-secondary)", fontSize: "var(--font-xs)" }}
          />
          <Tooltip
            formatter={(value: unknown) => [basisPointsToPercent(Number(value)), "Återkommande"]}
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
