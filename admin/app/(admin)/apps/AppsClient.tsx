"use client";

import { useState } from "react";
import Link from "next/link";
import { EditorIcon } from "@/app/_components/EditorIcon";
import type { AppDefinition, AppCategory, SetupStatus, AppStatus, HealthStatus } from "@/app/_lib/apps/types";
import type { AppHealthSummary } from "@/app/_lib/apps/health";
import "./apps.css";

// ── Types ────────────────────────────────────────────────────────

type InstalledApp = {
  id: string;
  appId: string;
  status: AppStatus;
  installedAt: string;
  activatedAt: string | null;
  errorMessage: string | null;
  pricingTier: string | null;
  settings: Record<string, unknown>;
};

type Props = {
  apps: AppDefinition[];
  installed: InstalledApp[];
  setup: SetupStatus;
  healthStates: AppHealthSummary[];
};

// ── Category tabs ────────────────────────────────────────────────

const CATEGORIES: Array<{ key: AppCategory | "all"; label: string }> = [
  { key: "all", label: "Alla" },
  { key: "marketing", label: "Marknadsföring" },
  { key: "sales", label: "Försäljning" },
  { key: "analytics", label: "Analys" },
  { key: "channels", label: "Kanaler" },
  { key: "crm", label: "CRM" },
  { key: "operations", label: "Drift" },
  { key: "finance", label: "Ekonomi" },
];

// ── Helpers ──────────────────────────────────────────────────────

function getPriceLabel(app: AppDefinition): string {
  if (app.pricing.length === 0) return "Gratis";
  const freeTier = app.pricing.find((p) => p.pricePerMonth === 0);
  if (freeTier) return "Gratis";
  const cheapest = Math.min(...app.pricing.map((p) => p.pricePerMonth));
  return `Från ${Math.round(cheapest / 100)} kr/mån`;
}

function getStatusBadge(status: AppStatus): { label: string; className: string } | null {
  switch (status) {
    case "ACTIVE": return { label: "Installerad", className: "app-card__status--active" };
    case "PENDING_SETUP": return { label: "Kräver inställning", className: "app-card__status--pending" };
    case "ERROR": return { label: "Fel", className: "app-card__status--error" };
    case "PAUSED": return { label: "Pausad", className: "app-card__status--pending" };
    default: return null;
  }
}

function getStatusBadgeWithHealth(
  status: AppStatus | null,
  healthStatus: HealthStatus | undefined,
): { label: string; className: string } | null {
  if (!status) return null;
  // Override badge for ACTIVE apps with health issues
  if (status === "ACTIVE" && healthStatus === "UNHEALTHY") {
    return { label: "Anslutningsfel", className: "app-card__status--error" };
  }
  if (status === "ACTIVE" && healthStatus === "DEGRADED") {
    return { label: "Långsam", className: "app-card__status--pending" };
  }
  return getStatusBadge(status);
}

function getCtaProps(
  status: AppStatus | null,
  setupReady: boolean,
  appRequiresSetup: boolean,
): { label: string; className: string; disabled: boolean } {
  if (status === "ACTIVE") return { label: "Hantera", className: "admin-btn admin-btn--outline admin-btn--sm", disabled: false };
  if (status === "PENDING_SETUP") return { label: "Slutför inställning", className: "admin-btn admin-btn--accent admin-btn--sm", disabled: false };
  if (status === "ERROR") return { label: "Åtgärda", className: "admin-btn admin-btn--danger admin-btn--sm", disabled: false };
  if (status === "PAUSED") return { label: "Aktivera", className: "admin-btn admin-btn--accent admin-btn--sm", disabled: false };
  // Not installed
  const blocked = appRequiresSetup && !setupReady;
  return { label: "Installera", className: "admin-btn admin-btn--accent admin-btn--sm", disabled: blocked };
}

// ── Component ────────────────────────────────────────────────────

export function AppsClient({ apps, installed, setup, healthStates }: Props) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<AppCategory | "all">("all");

  // Build lookups
  const installMap = new Map(installed.map((a) => [a.appId, a]));
  const healthMap = new Map(healthStates.map((h) => [h.appId, h.status]));

  // Filter
  const filtered = apps.filter((app) => {
    if (category !== "all" && app.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!app.name.toLowerCase().includes(q) && !app.tagline.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const setupReady = setup.isReadyForApps;

  return (
    <div className="admin-page admin-page--no-preview">
      <div className="admin-editor">
        <div className="apps-page">
          {/* Header */}
          <div className="apps-header">
            <h1 className="apps-header__title">App Store</h1>
            <p className="apps-header__tagline">Utöka din bokningsmotor med appar och integrationer</p>
          </div>

          {/* Setup banner */}
          {!setupReady && (
            <div className="apps-setup-banner">
              <EditorIcon name="info" size={22} className="apps-setup-banner__icon" />
              <div className="apps-setup-banner__text">
                <p className="apps-setup-banner__title">Slutför grundinstallationen för att installera appar</p>
                <p className="apps-setup-banner__desc">
                  {!setup.pms.complete && !setup.payments.complete
                    ? "Anslut ditt PMS och konfigurera betalningar för att komma igång."
                    : !setup.pms.complete
                      ? "Anslut ditt PMS under Integrationer."
                      : "Konfigurera betalningar under Betalningar."}
                </p>
                <div className="apps-setup-banner__links">
                  {!setup.pms.complete && <Link href="/settings/integrations" className="apps-setup-banner__link">Integrationer →</Link>}
                  {!setup.payments.complete && <Link href="/settings/payments" className="apps-setup-banner__link">Betalningar →</Link>}
                </div>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="apps-search">
            <EditorIcon name="search" size={18} className="apps-search__icon" />
            <input
              type="text"
              className="apps-search__input"
              placeholder="Sök appar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Category tabs */}
          <div className="apps-tabs">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                type="button"
                className={`apps-tab${category === cat.key ? " apps-tab--active" : ""}`}
                onClick={() => setCategory(cat.key)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Grid */}
          {filtered.length === 0 ? (
            <div className="apps-empty">
              <div className="apps-empty__icon">
                <EditorIcon name="search_off" size={48} />
              </div>
              <h2 className="apps-empty__title">Inga appar hittades</h2>
              <p className="apps-empty__desc">Prova att ändra sökning eller kategori.</p>
            </div>
          ) : (
            <div className="apps-grid">
              {filtered.map((app) => {
                const inst = installMap.get(app.id);
                const status = (inst?.status ?? null) as AppStatus | null;
                const healthStatus = healthMap.get(app.id) as HealthStatus | undefined;
                const badge = getStatusBadgeWithHealth(status, healthStatus);
                const appRequiresSetup = app.requiredSetup.length > 0;
                const cta = getCtaProps(status, setupReady, appRequiresSetup);

                return (
                  <Link key={app.id} href={`/apps/${app.id}`} className="app-card" style={{ textDecoration: "none", color: "inherit" }}>
                    <div className="app-card__top">
                      <div className="app-card__icon-wrap">
                        <span className="material-symbols-rounded" style={{ fontSize: 24 }}>
                          {app.icon}
                        </span>
                      </div>
                      <div className="app-card__info">
                        <h3 className="app-card__name">{app.name}</h3>
                        <p className="app-card__tagline">{app.tagline}</p>
                      </div>
                    </div>

                    {app.highlights.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                        {app.highlights.slice(0, 2).map((h, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--font-xs)", color: "var(--admin-text-secondary)" }}>
                            <EditorIcon name={h.icon} size={14} style={{ color: "var(--admin-accent)", flexShrink: 0 }} />
                            {h.title}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="app-card__meta">
                      <span className={`app-card__developer app-card__developer--${app.developer}`}>
                        {app.developer === "bedfront" ? "Bedfront" : "Partner"}
                      </span>
                      <span className="app-card__price">{getPriceLabel(app)}</span>
                    </div>

                    <div className="app-card__footer">
                      <div>
                        {badge && (
                          <span className={`app-card__status ${badge.className}`}>
                            {badge.label}
                          </span>
                        )}
                      </div>
                      <span className={`app-card__cta ${cta.className}`} style={{ pointerEvents: "none" }}>
                        {cta.label}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
