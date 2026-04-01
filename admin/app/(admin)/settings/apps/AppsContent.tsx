"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { getInstalledAppsForSettings, getAppDetailForSettings } from "./actions";
import type { SettingsAppRow, SettingsAppDetail } from "./actions";
import { uninstallApp, pauseApp, resumeApp } from "@/app/_lib/apps/actions";
import { useSettings } from "@/app/(admin)/_components/SettingsContext";
import "./apps-settings.css";

// ── Constants ───────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Aktiv", cls: "sa-badge--active" },
  PAUSED: { label: "Pausad", cls: "sa-badge--paused" },
  ERROR: { label: "Fel", cls: "sa-badge--error" },
};

const EVENT_LABELS: Record<string, string> = {
  INSTALLED: "Installerad",
  SETUP_STARTED: "Installation startad",
  SETUP_COMPLETED: "Installation slutförd",
  ACTIVATED: "Aktiverad",
  PAUSED: "Pausad",
  ERROR_OCCURRED: "Fel uppstod",
  ERROR_RESOLVED: "Fel åtgärdat",
  UNINSTALLED: "Avinstallerad",
  SETTINGS_UPDATED: "Inställningar ändrade",
  TIER_CHANGED: "Plan ändrad",
};

const CATEGORY_LABELS: Record<string, string> = {
  marketing: "Marknadsföring",
  sales: "Försäljning",
  analytics: "Analys",
  channels: "Kanaler",
  crm: "CRM",
  operations: "Drift",
  finance: "Ekonomi",
};

const PERMISSION_LABELS: Record<string, string> = {
  "orders:read": "Läsa ordrar",
  "orders:write": "Skriva ordrar",
  "bookings:read": "Läsa bokningar",
  "bookings:write": "Skriva bokningar",
  "guests:read": "Läsa gästprofiler",
  "guests:write": "Skriva gästprofiler",
  "products:read": "Läsa produkter",
  "analytics:read": "Läsa analys",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "precis nu";
  if (mins < 60) return `${mins} min sedan`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "timme" : "timmar"} sedan`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "dag" : "dagar"} sedan`;
  return new Date(iso).toLocaleDateString("sv-SE");
}

// ── Types ───────────────────────────────────────────────────────

type BreadcrumbSegment = { label: string; onClick?: () => void };
type AppsContentProps = {
  onSubTitleChange?: (title: string | BreadcrumbSegment[] | null) => void;
};

type View = { type: "list" } | { type: "detail"; appId: string };

// ── Component ───────────────────────────────────────────────────

export function AppsContent({ onSubTitleChange }: AppsContentProps) {
  const [apps, setApps] = useState<SettingsAppRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>({ type: "list" });
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmApp, setConfirmApp] = useState<SettingsAppRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const [detailData, setDetailData] = useState<SettingsAppDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { close } = useSettings();

  useEffect(() => {
    getInstalledAppsForSettings().then((rows) => {
      setApps(rows);
      setLoaded(true);
    });
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!openMenuId) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openMenuId]);

  function goToList() {
    setView({ type: "list" });
    setDetailData(null);
    onSubTitleChange?.(null);
  }

  function goToDetail(app: SettingsAppRow) {
    setOpenMenuId(null);
    setView({ type: "detail", appId: app.appId });
    setDetailLoading(true);
    onSubTitleChange?.([
      { label: "Appar", onClick: goToList },
      { label: app.name },
    ]);
    getAppDetailForSettings(app.appId).then((data) => {
      setDetailData(data);
      setDetailLoading(false);
    });
  }

  function handleOpenApp(app: SettingsAppRow) {
    setOpenMenuId(null);
    close();
    router.push(`/apps/${app.appId}`);
  }

  function handleUninstall(app: SettingsAppRow) {
    setOpenMenuId(null);
    setConfirmApp(app);
  }

  function confirmUninstall() {
    if (!confirmApp) return;
    const appId = confirmApp.appId;
    startTransition(async () => {
      const result = await uninstallApp(appId);
      if (result.ok) {
        setApps((prev) => prev.filter((a) => a.appId !== appId));
        if (view.type === "detail" && view.appId === appId) {
          goToList();
        }
      }
      setConfirmApp(null);
    });
  }

  // ── List view ─────────────────────────────────────────────────

  function renderList() {
    if (!loaded) {
      return (
        <div className="sa-list">
          {[1, 2, 3].map((i) => (
            <div key={i} className="sa-row sa-row--skeleton">
              <div className="skel skel--circle sa-row__icon-wrap" />
              <div className="skel skel--text" style={{ width: 120, height: 14 }} />
              <div style={{ flex: 1 }} />
              <div className="skel skel--text" style={{ width: 20, height: 20, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      );
    }

    if (apps.length === 0) {
      return (
        <div className="sa-empty">
          <EditorIcon name="home_storage" size={32} style={{ color: "var(--admin-text-tertiary)", marginBottom: 8 }} />
          <p className="sa-empty__title">Inga appar installerade</p>
          <p className="sa-empty__desc">Besök App Store för att utforska tillgängliga appar.</p>
        </div>
      );
    }

    return (
      <div className="sa-list">
        {apps.map((app) => (
          <div key={app.appId} className="sa-row sa-row--clickable" onClick={() => goToDetail(app)}>
            <div className="sa-row__icon-wrap">
              {app.iconUrl
                ? <img src={app.iconUrl} alt="" className="sa-row__icon-img" />
                : <span className="material-symbols-rounded sa-row__icon-fallback">{app.icon}</span>
              }
            </div>
            <span className="sa-row__name">{app.name}</span>
            <div style={{ flex: 1 }} />
            <div className="sa-row__menu-anchor" ref={openMenuId === app.appId ? menuRef : undefined} onClick={(e) => e.stopPropagation()}>
              <button
                className="sa-row__more"
                aria-label={`Alternativ för ${app.name}`}
                onClick={() => setOpenMenuId(openMenuId === app.appId ? null : app.appId)}
              >
                <EditorIcon name="more_horiz" size={20} />
              </button>
              {openMenuId === app.appId && (
                <div className="admin-dropdown__list sa-row__dropdown">
                  <button className="admin-dropdown__item" onClick={() => handleOpenApp(app)}>
                    Öppna app
                  </button>
                  <button className="admin-dropdown__item" onClick={() => goToDetail(app)}>
                    Visa detaljer
                  </button>
                  <button className="admin-dropdown__item sa-row__dropdown-danger" onClick={() => handleUninstall(app)}>
                    Avinstallera
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Detail view ───────────────────────────────────────────────

  function renderDetail() {
    if (detailLoading || !detailData) {
      return (
        <div>
          <div className="skel skel--text" style={{ width: 200, height: 18, marginBottom: 12 }} />
          <div className="skel skel--text" style={{ width: "100%", height: 13, marginBottom: 8 }} />
          <div className="skel skel--text" style={{ width: "80%", height: 13, marginBottom: 24 }} />
          <div className="skel skel--text" style={{ width: 140, height: 16, marginBottom: 12 }} />
          <div className="skel skel--text" style={{ width: "100%", height: 40, borderRadius: 8 }} />
        </div>
      );
    }

    const { app, detail, events } = detailData;
    const statusInfo = STATUS_MAP[detail.status] ?? { label: detail.status, cls: "" };
    const currentPricing = app.pricing.find((p) => p.tier === detail.pricingTier);

    return (
      <div className="sa-detail">
        {/* Header */}
        <div className="sa-detail__header">
          <div className="sa-detail__icon-wrap">
            {app.iconUrl
              ? <img src={app.iconUrl} alt="" className="sa-detail__icon-img" />
              : <span className="material-symbols-rounded" style={{ fontSize: 24, color: "var(--admin-text-secondary)" }}>{app.icon}</span>
            }
          </div>
          <div className="sa-detail__header-info">
            <div className="sa-detail__name">{app.name}</div>
            <div className="sa-detail__meta">
              <span className={`sa-badge ${statusInfo.cls}`}>{statusInfo.label}</span>
              {currentPricing && (
                <span className="sa-detail__tier">
                  {currentPricing.pricePerMonth === 0 ? "Gratis" : `${Math.round(currentPricing.pricePerMonth / 100)} kr/mån`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="sa-detail__desc">{app.description}</p>

        {/* Info grid */}
        <div className="sa-detail__info">
          <div className="sa-detail__info-row">
            <span className="sa-detail__info-label">Utvecklare</span>
            <span className="sa-detail__info-value">{app.developer === "bedfront" ? "Bedfront" : "Partner"}</span>
          </div>
          <div className="sa-detail__info-row">
            <span className="sa-detail__info-label">Kategori</span>
            <span className="sa-detail__info-value">{CATEGORY_LABELS[app.category] ?? app.category}</span>
          </div>
          {detail.installedAt && (
            <div className="sa-detail__info-row">
              <span className="sa-detail__info-label">Installerad</span>
              <span className="sa-detail__info-value">{new Date(detail.installedAt).toLocaleDateString("sv-SE")}</span>
            </div>
          )}
        </div>

        {/* Permissions */}
        {app.permissions.length > 0 && (
          <div className="sa-detail__section">
            <h4 className="sa-detail__section-title">Behörigheter</h4>
            <div className="sa-detail__permissions">
              {app.permissions.map((p) => (
                <div key={p} className="sa-detail__permission">
                  <EditorIcon name="check" size={14} style={{ color: "var(--admin-accent)" }} />
                  <span>{PERMISSION_LABELS[p] ?? p}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity */}
        {events.length > 0 && (
          <div className="sa-detail__section">
            <h4 className="sa-detail__section-title">Aktivitet</h4>
            <div className="sa-detail__events">
              {events.map((event) => (
                <div key={event.id} className="sa-detail__event">
                  <span className="sa-detail__event-label">{EVENT_LABELS[event.type] ?? event.type}</span>
                  {event.message && <span className="sa-detail__event-msg">{event.message}</span>}
                  <span className="sa-detail__event-time">{relativeTime(event.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="sa-detail__section sa-detail__danger">
          <h4 className="sa-detail__section-title">Farlig zon</h4>

          {detail.status === "ACTIVE" && (
            <div className="sa-detail__danger-card">
              <div>
                <div className="sa-detail__danger-title">Pausa app</div>
                <div className="sa-detail__danger-desc">Appen inaktiveras men dina inställningar sparas.</div>
              </div>
              <button
                className="admin-btn admin-btn--danger-secondary admin-btn--sm"
                disabled={isPending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await pauseApp(app.id);
                    if (result.ok) {
                      const refreshed = await getAppDetailForSettings(app.id);
                      setDetailData(refreshed);
                      setApps((prev) => prev.map((a) => a.appId === app.id ? { ...a, status: "PAUSED" } : a));
                    }
                  });
                }}
              >
                Pausa
              </button>
            </div>
          )}

          {detail.status === "PAUSED" && (
            <div className="sa-detail__danger-card">
              <div>
                <div className="sa-detail__danger-title">Återaktivera app</div>
                <div className="sa-detail__danger-desc">Appen aktiveras igen med befintliga inställningar.</div>
              </div>
              <button
                className="admin-btn admin-btn--accent admin-btn--sm"
                disabled={isPending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await resumeApp(app.id);
                    if (result.ok) {
                      const refreshed = await getAppDetailForSettings(app.id);
                      setDetailData(refreshed);
                      setApps((prev) => prev.map((a) => a.appId === app.id ? { ...a, status: "ACTIVE" } : a));
                    }
                  });
                }}
              >
                Återaktivera
              </button>
            </div>
          )}

          <div className="sa-detail__danger-card">
            <div>
              <div className="sa-detail__danger-title">Avinstallera app</div>
              <div className="sa-detail__danger-desc">Tar bort appen och alla dess inställningar permanent.</div>
            </div>
            <button
              className="admin-btn admin-btn--danger admin-btn--sm"
              disabled={isPending}
              onClick={() => {
                const row = apps.find((a) => a.appId === app.id);
                if (row) handleUninstall(row);
              }}
            >
              Avinstallera
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <>
      {view.type === "list" ? renderList() : renderDetail()}

      {confirmApp && createPortal(
        <div className="sa-confirm__overlay" onClick={() => { if (!isPending) setConfirmApp(null); }}>
          <div className="sa-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="sa-confirm__header">
              <h3 className="sa-confirm__title">Avinstallera {confirmApp.name}?</h3>
              <button
                className="sa-confirm__close"
                onClick={() => { if (!isPending) setConfirmApp(null); }}
                aria-label="Stäng"
              >
                <EditorIcon name="close" size={20} />
              </button>
            </div>
            <p className="sa-confirm__desc">
              Appen och alla dess inställningar tas bort permanent. Denna åtgärd kan inte ångras.
            </p>
            <div className="sa-confirm__actions">
              <button
                className="admin-btn admin-btn--outline"
                onClick={() => setConfirmApp(null)}
                disabled={isPending}
              >
                Avbryt
              </button>
              <button
                className="admin-btn admin-btn--danger"
                onClick={confirmUninstall}
                disabled={isPending}
              >
                {isPending ? "Tar bort..." : "Ta bort"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
