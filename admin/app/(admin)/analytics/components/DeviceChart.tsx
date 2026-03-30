"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DeviceChartProps {
  data: Array<{ device: string; sessions: number }>;
}

const DEVICE_LABELS: Record<string, string> = {
  DESKTOP: "Dator",
  MOBILE: "Mobil",
  TABLET: "Surfplatta",
};

const COLORS = ["#0075DE", "#00BFA5", "#FF6B6B"];

export function DeviceChart({ data }: DeviceChartProps) {
  if (!data || data.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <p style={{ color: "var(--admin-text-secondary)" }}>
          Ingen enhetsdata för perioden
        </p>
      </div>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    name: DEVICE_LABELS[d.device] ?? d.device,
  }));

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={formatted}
            dataKey="sessions"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="60%"
            outerRadius="80%"
          >
            {formatted.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: unknown) => [Number(value).toLocaleString("sv-SE"), "Sessioner"]}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
