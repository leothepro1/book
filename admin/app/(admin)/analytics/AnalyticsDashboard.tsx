"use client";

import { useState, useEffect, useCallback } from "react";
import { DateRangePicker } from "./components/DateRangePicker";
import { SummaryCards } from "./components/SummaryCards";
import { RevenueChart } from "./components/RevenueChart";
import { SessionsChart } from "./components/SessionsChart";
import { OrdersChart } from "./components/OrdersChart";
import { ChannelChart } from "./components/ChannelChart";
import { AovChart } from "./components/AovChart";
import { ReturningChart } from "./components/ReturningChart";
import { CityChart } from "./components/CityChart";
import { DeviceChart } from "./components/DeviceChart";

type DashboardData = {
  ok: boolean;
  summary: {
    revenue: number;
    sessions: number;
    orders: number;
    averageOrderValue: number;
    returningCustomerRate: number;
    visitors: number;
  };
  charts: {
    revenueOverTime: Array<{ date: string; value: number }>;
    sessionsOverTime: Array<{ date: string; value: number }>;
    ordersOverTime: Array<{ date: string; value: number }>;
    aovOverTime: Array<{ date: string; value: number }>;
    returningRateOverTime: Array<{ date: string; value: number }>;
  };
  breakdowns: {
    revenueByChannel: Array<{ channel: string; value: number }>;
    sessionsByCity: Array<{ city: string; sessions: number }>;
    sessionsByDevice: Array<{ device: string; sessions: number }>;
  };
};

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function AnalyticsDashboard({ tenantId }: { tenantId: string }) {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/dashboard?from=${from}&to=${to}`);
      if (!res.ok) throw new Error("Failed");
      setData(await res.json());
    } catch {
      setError("Kunde inte ladda analysdata");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDateChange = (newFrom: string, newTo: string) => {
    setFrom(newFrom);
    setTo(newTo);
  };

  return (
    <div className="analytics-dashboard">
      {/* Header row */}
      <div className="analytics-header-row">
        <DateRangePicker from={from} to={to} onChange={handleDateChange} />
      </div>

      {/* Summary cards */}
      <SummaryCards
        summary={data?.summary ?? null}
        currency="SEK"
        loading={loading}
      />

      {error && (
        <div className="analytics-chart-empty" style={{ margin: "24px 0" }}>
          {error}
        </div>
      )}

      {/* Charts grid */}
      <div className="analytics-charts-grid">
        {/* Row 1: Revenue (full) */}
        <div className="analytics-chart-card analytics-chart-card--full">
          <div className="analytics-chart-card__title">Omsättning över tid</div>
          <div className="analytics-chart-card__body analytics-chart-card__body--tall">
            <RevenueChart data={data?.charts.revenueOverTime ?? []} currency="SEK" />
          </div>
        </div>

        {/* Row 2: Sessions | Orders */}
        <div className="analytics-chart-card analytics-chart-card--half">
          <div className="analytics-chart-card__title">Sessioner över tid</div>
          <div className="analytics-chart-card__body">
            <SessionsChart data={data?.charts.sessionsOverTime ?? []} />
          </div>
        </div>
        <div className="analytics-chart-card analytics-chart-card--half">
          <div className="analytics-chart-card__title">Ordrar över tid</div>
          <div className="analytics-chart-card__body">
            <OrdersChart data={data?.charts.ordersOverTime ?? []} />
          </div>
        </div>

        {/* Row 3: Channel (full) */}
        <div className="analytics-chart-card analytics-chart-card--full">
          <div className="analytics-chart-card__title">Omsättning per försäljningskanal</div>
          <div className="analytics-chart-card__body analytics-chart-card__body--tall">
            <ChannelChart data={data?.breakdowns.revenueByChannel ?? []} currency="SEK" />
          </div>
        </div>

        {/* Row 4: AOV | Returning */}
        <div className="analytics-chart-card analytics-chart-card--half">
          <div className="analytics-chart-card__title">Genomsnittligt ordervärde</div>
          <div className="analytics-chart-card__body">
            <AovChart data={data?.charts.aovOverTime ?? []} currency="SEK" />
          </div>
        </div>
        <div className="analytics-chart-card analytics-chart-card--half">
          <div className="analytics-chart-card__title">Andel återkommande kunder</div>
          <div className="analytics-chart-card__body">
            <ReturningChart data={data?.charts.returningRateOverTime ?? []} />
          </div>
        </div>

        {/* Row 5: City | Device */}
        <div className="analytics-chart-card analytics-chart-card--half">
          <div className="analytics-chart-card__title">Sessioner per plats</div>
          <div className="analytics-chart-card__body">
            <CityChart data={data?.breakdowns.sessionsByCity ?? []} />
          </div>
        </div>
        <div className="analytics-chart-card analytics-chart-card--half">
          <div className="analytics-chart-card__title">Sessioner per enhetstyp</div>
          <div className="analytics-chart-card__body">
            <DeviceChart data={data?.breakdowns.sessionsByDevice ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
}
