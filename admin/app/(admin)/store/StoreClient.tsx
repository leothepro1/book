"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoreThemeData, type StoreThemeData } from "./actions";
import { ScreenshotPreview } from "../_components/ScreenshotPreview/ScreenshotPreview";
import { PerformanceWidget } from "../_components/PerformanceWidget/PerformanceWidget";
import type { PerformanceResult } from "@/app/_lib/rum/performance";
import "../_components/ScreenshotPreview/screenshot-preview.css";
import "../_components/PerformanceWidget/performance-widget.css";
import "../products/_components/product-form.css";
import "./store.css";

function formatPublishDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const day = d.getDate();
  const month = d.toLocaleDateString("sv-SE", { month: "long" });
  const time = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${month} kl. ${time}`;
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just nu";
  if (diffMin < 60) return `${diffMin} min sedan`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? "timme" : "timmar"} sedan`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} ${diffDays === 1 ? "dag" : "dagar"} sedan`;
  return d.toLocaleDateString("sv-SE");
}

export function StoreClient({ initialPerformance }: { initialPerformance: PerformanceResult | null }) {
  const router = useRouter();
  const [data, setData] = useState<StoreThemeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStoreThemeData().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading || !data) return null;

  return (
    <div className="admin-page admin-page--no-preview products-page">
      <div className="admin-editor">
        {/* Header */}
        <div className="admin-header" style={{ padding: "16px 16px 10px", borderBottom: "none" }}>
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>storefront</span>
            Webbshop
          </h1>
        </div>

        <div style={{ padding: "0 16px 110px", maxWidth: 1000, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>

          {/* Screenshot preview + theme info — shared parent */}
          <PerformanceWidget performance={initialPerformance} />

          <div className="store-card">
            <ScreenshotPreview
              tenantId={data.tenantId}
              initialStatus={data.screenshot}
              portalUrl={data.portalUrl}
            />
            <div className="store-card__info">
              <div className="store-card__thumb">
                {data.screenshot.desktopUrl ? (
                  <img src={data.screenshot.desktopUrl} alt="" className="store-card__thumb-img" />
                ) : (
                  <span className="material-symbols-rounded" style={{ fontSize: 20, color: "var(--admin-text-tertiary)" }}>desktop_windows</span>
                )}
              </div>
              <div className="store-card__meta">
                <div className="store-card__name">{data.tenantName}</div>
                <div className="store-card__saved">
                  Senast sparad: {formatPublishDate(data.lastPublishedAt)}
                </div>
              </div>
              <div className="store-card__actions">
                {data.portalUrl && (
                  <a
                    href={data.portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="store-card__view"
                    aria-label="Visa webbshop"
                  >
                    <span className="material-symbols-rounded" style={{ fontSize: 18 }}>visibility</span>
                  </a>
                )}
                <button
                  type="button"
                  className="store-card__cta"
                  onClick={() => router.push("/editor")}
                >
                  Redigera tema
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
