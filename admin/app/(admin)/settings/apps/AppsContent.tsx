"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { getInstalledAppsForSettings, getAppDetailForSettings } from "./actions";
import type { SettingsAppRow, SettingsAppDetail } from "./actions";
import { uninstallApp, pauseApp, resumeApp } from "@/app/_lib/apps/actions";
import { useSettings } from "@/app/(admin)/_components/SettingsContext";
import "@/app/(admin)/orders/orders.css";
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

const PERMISSION_AREAS: Record<string, string> = {
  orders: "Ordrar",
  bookings: "Bokningar",
  guests: "Gästprofiler",
  products: "Produkter",
  analytics: "Analys",
  accommodations: "Boenden",
};

function groupPermissions(permissions: string[]): { area: string; label: string; read: boolean; write: boolean }[] {
  const map = new Map<string, { read: boolean; write: boolean }>();
  for (const p of permissions) {
    const [area, scope] = p.split(":");
    if (!map.has(area)) map.set(area, { read: false, write: false });
    const entry = map.get(area)!;
    if (scope === "read") entry.read = true;
    if (scope === "write") entry.write = true;
  }
  return Array.from(map.entries()).map(([area, flags]) => ({
    area,
    label: PERMISSION_AREAS[area] ?? area,
    ...flags,
  }));
}

const EVENT_ICONS: Record<string, string> = {
  INSTALLED: "download",
  SETUP_STARTED: "play_arrow",
  SETUP_COMPLETED: "task_alt",
  ACTIVATED: "check_circle",
  PAUSED: "pause_circle",
  ERROR_OCCURRED: "error",
  ERROR_RESOLVED: "check_circle",
  UNINSTALLED: "delete",
  SETTINGS_UPDATED: "settings",
  TIER_CHANGED: "upgrade",
};

function formatConfigValue(val: unknown): string {
  if (typeof val === "boolean") return val ? "Ja" : "Nej";
  if (typeof val === "number") return String(val);
  if (typeof val === "string") return val || "—";
  return "—";
}

function findStepFieldLabel(step: { configFields?: { key: string; label: string }[]; apiKeyConfig?: { fields: { key: string; label: string }[] } }, key: string): string {
  if (step.configFields) {
    const f = step.configFields.find((cf) => cf.key === key);
    if (f) return f.label;
  }
  if (step.apiKeyConfig?.fields) {
    const f = step.apiKeyConfig.fields.find((af) => af.key === key);
    if (f) return f.label;
  }
  return key;
}

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
  onHeaderExtraChange?: (extra: React.ReactNode) => void;
};

type View = { type: "list" } | { type: "detail"; appId: string };

// ── Component ───────────────────────────────────────────────────

export function AppsContent({ onSubTitleChange, onHeaderExtraChange }: AppsContentProps) {
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
    onHeaderExtraChange?.(null);
  }

  function setDetailHeaderButtons(app: SettingsAppRow) {
    onHeaderExtraChange?.(
      <div className="sa-header-actions">
        <button
          className="sa-header-actions__store-btn"
          onClick={() => {
            close();
            router.push(`/apps`);
          }}
        >
          Visa i App Store
        </button>
        <button
          className="admin-btn admin-btn--accent admin-btn--sm"
          onClick={() => handleOpenApp(app)}
        >
          Öppna app
        </button>
      </div>,
    );
  }

  function goToDetail(app: SettingsAppRow) {
    setOpenMenuId(null);
    setView({ type: "detail", appId: app.appId });
    setDetailLoading(true);
    onSubTitleChange?.([
      { label: "Appar", onClick: goToList },
      { label: app.name },
    ]);
    setDetailHeaderButtons(app);
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
    const settings = detail.settings as Record<string, Record<string, unknown>>;
    const configSteps = app.setupSteps.filter((s) => s.type !== "review" && s.type !== "webhook");

    return (
      <div className="sa-detail">
        {/* Error banner */}
        {detail.status === "ERROR" && detail.errorMessage && (
          <div className="sa-detail__error-banner">
            <EditorIcon name="error" size={16} />
            <span>{detail.errorMessage}</span>
          </div>
        )}

        {/* Om */}
        <div className="sa-card">
          <h4 className="sa-card__label">Om</h4>
          <p className="sa-detail__desc">{app.description}</p>
        </div>

        {/* Aktivitet och behörigheter */}
        {app.permissions.length > 0 && (
          <div className="sa-card">
            <h4 className="sa-card__label">Aktivitet och behörigheter</h4>
            <div className="sa-perm-table">
              <div className="sa-perm-table__header">
                <span className="sa-perm-table__col sa-perm-table__col--area">Område</span>
                <span className="sa-perm-table__col sa-perm-table__col--check">Visa</span>
                <span className="sa-perm-table__col sa-perm-table__col--check">Redigera</span>
              </div>
              {groupPermissions(app.permissions).map((row) => (
                <div key={row.area} className="sa-perm-table__row">
                  <span className="sa-perm-table__col sa-perm-table__col--area">{row.label}</span>
                  <span className="sa-perm-table__col sa-perm-table__col--check">
                    {row.read && <EditorIcon name="check" size={16} style={{ color: "#047B5D" }} />}
                  </span>
                  <span className="sa-perm-table__col sa-perm-table__col--check">
                    {row.write && <EditorIcon name="check" size={16} style={{ color: "#047B5D" }} />}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Aktivitet */}
        {events.length > 0 && (
          <div className="sa-card">
            <h4 className="sa-card__label">Aktivitet</h4>
            <div className="ord-tl sa-detail__tl">
              <div className="ord-tl-track">
                {(() => {
                  const groups: { date: string; label: string; events: typeof events }[] = [];
                  for (const event of events) {
                    const d = new Date(event.createdAt);
                    const dateKey = d.toISOString().slice(0, 10);
                    const label = d.toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });
                    const last = groups[groups.length - 1];
                    if (last && last.date === dateKey) {
                      last.events.push(event);
                    } else {
                      groups.push({ date: dateKey, label, events: [event] });
                    }
                  }

                  return groups.map((group) => (
                    <div key={group.date} className="ord-tl-group">
                      <div className="ord-tl-group__date">{group.label}</div>
                      {group.events.map((event) => {
                        const isDiagnostic = event.type === "ERROR_RESOLVED";
                        const time = new Date(event.createdAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

                        return (
                          <div key={event.id} className={`ord-tl-event${isDiagnostic ? " ord-tl-event--diagnostic" : ""}`}>
                            <div className={`ord-tl-event__dot${isDiagnostic ? " ord-tl-event__dot--diagnostic" : ""}`} />
                            <div className="ord-tl-event__body">
                              <span>{EVENT_LABELS[event.type] ?? event.type}</span>
                              {event.message && (
                                <span style={{ color: "var(--admin-text-secondary)" }}> — {event.message}</span>
                              )}
                            </div>
                            <span className="ord-tl-event__time">{time}</span>
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Avinstallera */}
        <div className="sa-detail__uninstall-row">
          <button
            className="admin-btn admin-btn--danger admin-btn--sm"
            disabled={isPending}
            onClick={() => {
              const row = apps.find((a) => a.appId === app.id);
              if (row) handleUninstall(row);
            }}
          >
            Avinstallera app
          </button>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className={view.type === "detail" ? "sa-detail-wrap" : "sa-list-wrap"}>
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
    </div>
  );
}
