"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";

interface ChannelChartProps {
  data: Array<{ channel: string; value: number }>;
  currency: string;
}

function formatChannelLabel(channel: string): string {
  if (channel.toLowerCase() === "direct") return "Direkt";
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

function abbreviateCurrency(value: number, currency: string): string {
  const major = value / 100;
  const suffix = currency === "SEK" ? " kr" : ` ${currency}`;
  if (major >= 1000) {
    return `${Math.round(major / 1000)}k${suffix}`;
  }
  return `${Math.round(major)}${suffix}`;
}

export function ChannelChart({ data, currency }: ChannelChartProps) {
  if (!data || data.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <p style={{ color: "var(--admin-text-secondary)" }}>
          Ingen kanaldata för perioden
        </p>
      </div>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    channelLabel: formatChannelLabel(d.channel),
  }));

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis
            dataKey="channelLabel"
            tick={{ fill: "var(--admin-text-secondary)", fontSize: "var(--font-xs)" }}
          />
          <YAxis
            tickFormatter={(v: number) => abbreviateCurrency(v, currency)}
            tick={{ fill: "var(--admin-text-secondary)", fontSize: "var(--font-xs)" }}
          />
          <Tooltip
            formatter={(value: unknown) => [
              formatPriceDisplay(Number(value), currency) + (currency === "SEK" ? " kr" : ` ${currency}`),
              "Omsättning",
            ]}
          />
          <Bar dataKey="value" fill="#0075DE" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
