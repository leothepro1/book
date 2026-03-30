"use client";

import { useState, useEffect, useRef } from "react";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { GlobeRenderer } from "./GlobeRenderer";

type GlobePoint = { lat: number; lng: number; city: string; country: string; count: number };

type LiveData = {
  ok: boolean;
  updatedAt: string;
  now: { visitorsNow: number; globePoints: GlobePoint[] };
  today: { revenue: number; sessions: number; orders: number; visitors: number };
  funnel: { cartsActive: number; inCheckout: number; purchased: number };
  map: { sessionsByCity: Array<{ city: string; sessions: number }> };
  products: { revenueByProduct: Array<{ productId: string; title: string; revenue: number }> };
};

function formatAmount(oren: number, currency: string): string {
  return formatPriceDisplay(oren, currency) + (currency === "SEK" ? " kr" : "");
}

export default function LiveViewClient({ tenantId, currency }: { tenantId: string; currency: string }) {
  const [data, setData] = useState<LiveData | null>(null);
  const [pinTooltip, setPinTooltip] = useState<{ city: string; country: string; visitors: number; x: number; y: number } | null>(null);
  const globeContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/analytics/live");
        if (res.ok && !cancelled) {
          setData(await res.json());
        }
      } catch {}
      if (!cancelled) setTimeout(poll, 5000);
    };

    poll();
    return () => { cancelled = true; };
  }, [tenantId]);

  const maxSessions = data?.map.sessionsByCity.length
    ? Math.max(...data.map.sessionsByCity.map((c) => c.sessions))
    : 1;

  const globePoints = data?.now.globePoints ?? [];

  return (
    <div className="live-layout">
      {/* Left panel — metrics */}
      <div className="live-metrics">
        {/* Top stats — 2×2 grid */}
        <div className="live-stat-grid">
          <div className="live-stat">
            <div className="live-stat__label">Besökare just nu</div>
            <div className="live-stat__value-row">
              <span className="live-stat__value">{data?.now.visitorsNow ?? 0}</span>
            </div>
          </div>
          <div className="live-stat">
            <div className="live-stat__label">Omsättning idag</div>
            <div className="live-stat__value-row">
              <span className="live-stat__value">{data ? formatAmount(data.today.revenue, currency) : "0 kr"}</span>
              <span className="live-stat__trend">—</span>
            </div>
          </div>
          <div className="live-stat">
            <div className="live-stat__label">Sessioner idag</div>
            <div className="live-stat__value-row">
              <span className="live-stat__value">{data?.today.sessions ?? 0}</span>
            </div>
          </div>
          <div className="live-stat">
            <div className="live-stat__label">Ordrar idag</div>
            <div className="live-stat__value-row">
              <span className="live-stat__value">{data?.today.orders ?? 0}</span>
              <span className="live-stat__trend">—</span>
            </div>
          </div>
        </div>

        {/* Funnel — Kundbeteende */}
        <div className="live-section">
          <div className="live-section__title">Kundbeteende</div>
          <div className="live-funnel">
            <div className="live-funnel__item">
              <div className="live-funnel__label">Aktiva varukorgar</div>
              <div className="live-funnel__value">{data?.funnel.cartsActive ?? 0}</div>
            </div>
            <div className="live-funnel__item">
              <div className="live-funnel__label">I kassan</div>
              <div className="live-funnel__value">{data?.funnel.inCheckout ?? 0}</div>
            </div>
            <div className="live-funnel__item">
              <div className="live-funnel__label">Köpt</div>
              <div className="live-funnel__value">{data?.funnel.purchased ?? 0}</div>
            </div>
          </div>
        </div>

        {/* Sessions by city — horizontal bars */}
        <div className="live-section">
          <div className="live-section__title">Besökare per plats</div>
          {(!data || data.map.sessionsByCity.length === 0) ? (
            <div className="live-empty">Inga data</div>
          ) : (
            <div className="live-location-list">
              {data.map.sessionsByCity.slice(0, 10).map((c) => (
                <div key={c.city} className="live-location-item">
                  <div className="live-location-item__header">
                    <span className="live-location-item__city">{c.city}</span>
                    <span className="live-location-item__count">{c.sessions}</span>
                  </div>
                  <div className="live-location-bar">
                    <div
                      className="live-location-bar__fill"
                      style={{ width: `${(c.sessions / maxSessions) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* New vs returning */}
        <div className="live-section">
          <div className="live-section__title live-section__title--dotted">
            Nya kontra återkommande kunder
          </div>
          <div className="live-empty">Inga data för det här datumintervallet</div>
        </div>

        {/* Revenue by product */}
        <div className="live-section">
          <div className="live-section__title">Omsättning per produkt</div>
          {(!data || data.products.revenueByProduct.length === 0) ? (
            <div className="live-empty">Inga data</div>
          ) : (
            <div className="live-product-list">
              {data.products.revenueByProduct.map((p) => (
                <div key={p.productId} className="live-product-item">
                  <span className="live-product-item__title">{p.title}</span>
                  <span className="live-product-item__revenue">{formatAmount(p.revenue, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel — globe */}
      <div className="live-globe" ref={globeContainerRef}>
        <GlobeRenderer points={globePoints} onPinHover={setPinTooltip} />

        {/* Pin tooltip */}
        {pinTooltip && (
          <div
            style={{
              position: "fixed",
              left: pinTooltip.x,
              top: pinTooltip.y,
              transform: "translate(-50%, -100%)",
              background: "#fff",
              color: "#202223",
              fontSize: 12,
              fontWeight: 500,
              padding: "6px 10px",
              borderRadius: 8,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              zIndex: 10,
            }}
          >
            <div style={{ textAlign: "center" }}>{pinTooltip.city}, {pinTooltip.country}</div>
            <div style={{ textAlign: "center", color: "#6d7175", marginTop: 3 }}>
              {pinTooltip.visitors} besökare
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="live-globe-legend">
          <div className="live-globe-legend__item">
            <span className="live-globe-legend__dot live-globe-legend__dot--order" />
            Ordrar
          </div>
          <div className="live-globe-legend__item">
            <span className="live-globe-legend__dot live-globe-legend__dot--visitor" />
            Besökare just nu
          </div>
        </div>

        {/* Zoom controls */}
        <div className="live-globe-zoom">
          <button className="live-globe-zoom__btn" onClick={() => {}} type="button">+</button>
          <button className="live-globe-zoom__btn" onClick={() => {}} type="button">−</button>
        </div>
      </div>
    </div>
  );
}
