"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface CityChartProps {
  data: Array<{ city: string; sessions: number }>;
}

export function CityChart({ data }: CityChartProps) {
  if (!data || data.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <p style={{ color: "var(--admin-text-secondary)" }}>
          Inga platsdata — geo-databasen kan behöva konfigureras
        </p>
      </div>
    );
  }

  const top10 = data.slice(0, 10);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={top10} layout="vertical">
          <XAxis
            type="number"
            tick={{ fill: "var(--admin-text-secondary)", fontSize: "var(--font-xs)" }}
          />
          <YAxis
            type="category"
            dataKey="city"
            width={120}
            tick={{ fill: "var(--admin-text-secondary)", fontSize: "var(--font-xs)" }}
          />
          <Tooltip
            formatter={(value: unknown) => [Number(value).toLocaleString("sv-SE"), "Sessioner"]}
          />
          <Bar dataKey="sessions" fill="#0075DE" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
