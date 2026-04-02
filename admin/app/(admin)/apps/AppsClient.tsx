"use client";

import { useState } from "react";
import Link from "next/link";
import { EditorIcon } from "@/app/_components/EditorIcon";
import type { AppDefinition, AppCategory, SetupStatus, AppStatus, HealthStatus } from "@/app/_lib/apps/types";
import type { AppHealthSummary } from "@/app/_lib/apps/health";
import "./apps.css";
import "./[appId]/app-listing.css";

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

const CATEGORY_LABELS: Record<string, string> = {
  marketing: "Marknadsföring", sales: "Försäljning", analytics: "Analys",
  channels: "Kanaler", crm: "CRM", operations: "Drift", finance: "Ekonomi",
};

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
  const blocked = appRequiresSetup && !setupReady;
  return { label: "Installera", className: "admin-btn admin-btn--accent admin-btn--sm", disabled: blocked };
}

// ── Main Component ───────────────────────────────────────────────

export function AppsClient({ apps, installed, setup, healthStates }: Props) {
  const [search, setSearch] = useState("");

  // Build lookups
  const installMap = new Map(installed.map((a) => [a.appId, a]));
  const healthMap = new Map(healthStates.map((h) => [h.appId, h.status]));

  // Filter
  const filtered = apps.filter((app) => {
    if (search) {
      const q = search.toLowerCase();
      if (!app.name.toLowerCase().includes(q) && !app.tagline.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="apps-root">
      {/* Sticky header */}
      <div className="apps-topbar">
        <div className="apps-topbar__inner">
          <h1 className="apps-topbar__title">App Store</h1>
        </div>
      </div>

      <div className="apps-page">
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
                return (
                  <Link
                    key={app.id}
                    href={`/apps/${app.id}`}
                    className="app-card"
                  >
                    <div className="app-card__icon-wrap">
                      {app.iconUrl
                        ? <img src={app.iconUrl} alt="" className="app-card__icon-img" />
                        : <span className="material-symbols-rounded" style={{ fontSize: 24 }}>{app.icon}</span>
                      }
                    </div>
                    <div className="app-card__info">
                      <div className="app-card__name-row">
                        <h3 className="app-card__name">{app.name}</h3>
                        <span className="app-card__category-pill">{CATEGORY_LABELS[app.category] ?? app.category}</span>
                      </div>
                      <p className="app-card__tagline">{app.tagline}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
    </div>
  );
}
