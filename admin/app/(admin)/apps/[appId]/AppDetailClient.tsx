"use client";

import { useState, useCallback, useTransition, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { uninstallApp, pauseApp, resumeApp, retryDelivery, revokeOAuthAccess } from "@/app/_lib/apps/actions";
import type { WebhookDeliveryItem } from "@/app/_lib/apps/actions";
import { triggerHealthCheck } from "@/app/_lib/apps/health";
import { selectPlan, reconfigureStep } from "@/app/_lib/apps/wizard";
import type { AppDefinition, SetupStep, ConfigField } from "@/app/_lib/apps/types";
import type { AppDetail, AppEvent } from "@/app/_lib/apps/actions";
import type { AppHealthState, HealthHistoryDay } from "@/app/_lib/apps/health";
import "./detail.css";

// ── Constants ────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Aktiv", cls: "detail-badge--active" },
  PAUSED: { label: "Pausad", cls: "detail-badge--paused" },
  ERROR: { label: "Fel", cls: "detail-badge--error" },
};

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

const CATEGORY_LABELS: Record<string, string> = {
  marketing: "Marknadsföring",
  sales: "Försäljning",
  analytics: "Analys",
  channels: "Kanaler",
  crm: "CRM",
  operations: "Drift",
  finance: "Ekonomi",
};

// ── Helpers ──────────────────────────────────────────────────────

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

function formatReviewValue(val: unknown): string {
  if (typeof val === "boolean") return val ? "Ja" : "Nej";
  if (typeof val === "number") return String(val);
  if (typeof val === "string") return val || "—";
  return "—";
}

function findFieldLabel(step: SetupStep, key: string): string | null {
  if (step.configFields) {
    const f = step.configFields.find((cf) => cf.key === key);
    if (f) return f.label;
  }
  if (step.apiKeyConfig?.fields) {
    const f = step.apiKeyConfig.fields.find((af) => af.key === key);
    if (f) return f.label;
  }
  if (key === "connected") return "Ansluten";
  if (key === "provider") return "Leverantör";
  if (key === "selectedLabel") return "Valt konto";
  if (key === "selectedValue") return "Konto-ID";
  if (key === "registered") return "Webhooks";
  return null;
}

// ── Main Component ───────────────────────────────────────────────

type AppBillingInfo = {
  currentAmount: number;
  daysRemaining: number;
  daysInPeriod: number;
  isProrated: boolean;
} | null;

export function AppDetailClient({
  app, detail, events, health, healthHistory, deliveries, billingInfo,
}: {
  app: AppDefinition;
  detail: AppDetail;
  events: AppEvent[];
  health: AppHealthState | null;
  healthHistory: HealthHistoryDay[];
  deliveries: WebhookDeliveryItem[];
  billingInfo: AppBillingInfo;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showActions, setShowActions] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"pause" | "uninstall" | null>(null);
  const [uninstallInput, setUninstallInput] = useState("");
  const [planModal, setPlanModal] = useState(false);
  const [reconfigStep, setReconfigStep] = useState<SetupStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const status = detail.status;
  const statusInfo = STATUS_MAP[status] ?? { label: status, cls: "" };
  const settings = detail.settings as Record<string, Record<string, unknown>>;
  const currentPricing = app.pricing.find((p) => p.tier === detail.pricingTier);
  const hasPaidTiers = app.pricing.some((p) => p.pricePerMonth > 0);
  const visibleEvents = showAllEvents ? events : events.slice(0, 20);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showActions) return;
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowActions(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showActions]);

  // ── Actions ──────────────────────────────────────────────────

  const handlePause = useCallback(() => {
    setConfirmAction(null);
    startTransition(async () => {
      const result = await pauseApp(app.id);
      if (!result.ok) { setError(result.error); return; }
      router.refresh();
    });
  }, [app.id, router]);

  const handleResume = useCallback(() => {
    startTransition(async () => {
      const result = await resumeApp(app.id);
      if (!result.ok) { setError(result.error); return; }
      router.refresh();
    });
  }, [app.id, router]);

  const handleUninstall = useCallback(() => {
    setConfirmAction(null);
    startTransition(async () => {
      const result = await uninstallApp(app.id);
      if (!result.ok) { setError(result.error); return; }
      router.push("/apps");
    });
  }, [app.id, router]);

  const handlePlanChange = useCallback((tier: string) => {
    startTransition(async () => {
      const result = await selectPlan(app.id, tier);
      if (!result.ok) { setError(result.error); return; }
      setPlanModal(false);
      router.refresh();
    });
  }, [app.id, router]);

  const handleReconfigSave = useCallback((stepId: string, data: Record<string, unknown>) => {
    startTransition(async () => {
      const result = await reconfigureStep(app.id, stepId, data);
      if (!result.ok) { setError(result.error); return; }
      setReconfigStep(null);
      router.refresh();
    });
  }, [app.id, router]);

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="admin-page admin-page--no-preview">
      <div className="admin-editor">
        <div className="detail-page" style={{ padding: "var(--space-6)" }}>
          {/* Back link */}
          <Link href="/apps" style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)", textDecoration: "none", marginBottom: "var(--space-5)" }}>
            <EditorIcon name="arrow_back" size={16} />
            App Store
          </Link>

          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-3) var(--space-4)", background: "var(--admin-danger-tint)", borderRadius: "var(--radius-md)", fontSize: "var(--font-sm)", color: "var(--admin-danger)", marginBottom: "var(--space-4)" }}>
              <EditorIcon name="error" size={16} />
              {error}
              <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setError(null)} style={{ marginLeft: "auto" }}>Stäng</button>
            </div>
          )}

          {/* Error recovery banner */}
          {status === "ERROR" && detail.errorMessage && (
            <ErrorRecoveryBanner
              app={app}
              errorMessage={detail.errorMessage}
              onReconnect={() => {
                startTransition(async () => {
                  await revokeOAuthAccess(app.id);
                  router.push(`/apps/${app.id}/setup`);
                });
              }}
              onReconfigure={(stepId) => {
                const step = app.setupSteps.find((s) => s.id === stepId);
                if (step) setReconfigStep(step);
              }}
              isPending={isPending}
            />
          )}

          {/* Header */}
          <div className="detail-header">
            <div className="detail-header__left">
              <div className="detail-header__icon">
                <span className="material-symbols-rounded" style={{ fontSize: 28 }}>{app.icon}</span>
              </div>
              <div className="detail-header__info">
                <h1 className="detail-header__name">{app.name}</h1>
                <div className="detail-header__meta">
                  <span className={`detail-badge ${statusInfo.cls}`}>{statusInfo.label}</span>
                  {detail.pricingTier && (
                    <span style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", textTransform: "capitalize" }}>
                      {detail.pricingTier === "free" ? "Gratis" : detail.pricingTier}
                    </span>
                  )}
                </div>
                {status === "ERROR" && detail.errorMessage && (
                  <div className="detail-header__error">{detail.errorMessage}</div>
                )}
              </div>
            </div>

            {/* Actions dropdown */}
            <div className="detail-actions admin-dropdown" ref={dropdownRef}>
              <button
                className="admin-dropdown__trigger"
                onClick={() => setShowActions(!showActions)}
              >
                <span style={{ fontSize: "var(--font-sm)" }}>Åtgärder</span>
                <EditorIcon name="expand_more" size={18} className="admin-dropdown__chevron" />
              </button>
              {showActions && (
                <div className="admin-dropdown__list" style={{ right: 0, left: "auto", minWidth: 200 }}>
                  {status === "ACTIVE" && (
                    <button className="admin-dropdown__item" onClick={() => { setShowActions(false); setConfirmAction("pause"); }}>
                      <EditorIcon name="pause_circle" size={16} />
                      <span className="admin-dropdown__text">Pausa app</span>
                    </button>
                  )}
                  {status === "PAUSED" && (
                    <button className="admin-dropdown__item" onClick={() => { setShowActions(false); handleResume(); }}>
                      <EditorIcon name="play_circle" size={16} />
                      <span className="admin-dropdown__text">Återaktivera</span>
                    </button>
                  )}
                  {hasPaidTiers && (
                    <>
                      <div className="detail-actions__separator" />
                      <button className="admin-dropdown__item" onClick={() => { setShowActions(false); setPlanModal(true); }}>
                        <EditorIcon name="upgrade" size={16} />
                        <span className="admin-dropdown__text">Byt plan</span>
                      </button>
                    </>
                  )}
                  <div className="detail-actions__separator" />
                  <button className="admin-dropdown__item" style={{ color: "var(--admin-danger)" }} onClick={() => { setShowActions(false); setConfirmAction("uninstall"); }}>
                    <EditorIcon name="delete" size={16} />
                    <span className="admin-dropdown__text">Avinstallera</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="detail-body">
            {/* Main column */}
            <div>
              {/* Overview */}
              <div className="detail-card">
                <div className="detail-card__header">
                  <h3 className="detail-card__title">Översikt</h3>
                  <Link href="/apps" style={{ fontSize: "var(--font-xs)", color: "var(--admin-accent)", textDecoration: "none", fontWeight: 500 }}>
                    Öppna i App Store
                  </Link>
                </div>
                <div className="detail-card__body">
                  <p className="detail-overview__desc">{app.description}</p>
                  <div className="detail-overview__meta">
                    <span className="detail-overview__chip">
                      {app.developer === "bedfront" ? "Bedfront" : "Partner"}
                    </span>
                    <span className="detail-overview__chip">
                      {CATEGORY_LABELS[app.category] ?? app.category}
                    </span>
                  </div>
                </div>
              </div>

              {/* App-specific stats panel */}
              {(app.id === "google-ads" || app.id === "meta-ads") && (
                <AppStatsPanel app={app} settings={settings} health={health} detail={detail} />
              )}

              {/* Configuration */}
              {app.setupSteps.filter((s) => s.type !== "review" && s.type !== "webhook").length > 0 && (
                <div className="detail-card">
                  <div className="detail-card__header">
                    <h3 className="detail-card__title">Konfiguration</h3>
                  </div>
                  <div className="detail-card__body">
                    {app.setupSteps
                      .filter((s) => s.type !== "review" && s.type !== "webhook")
                      .map((step) => {
                        const data = (settings[step.id] ?? {}) as Record<string, unknown>;
                        return (
                          <div key={step.id} className="detail-config__section">
                            <div className="detail-config__section-header">
                              <span className="detail-config__section-title">{step.title}</span>
                              <button className="detail-config__edit-btn" onClick={() => setReconfigStep(step)}>Ändra</button>
                            </div>
                            {Object.entries(data).length > 0 ? (
                              Object.entries(data).map(([key, val]) => {
                                const isSecret = step.apiKeyConfig?.fields?.some((f) => f.key === key && f.secret);
                                return (
                                  <div key={key} className="detail-config__row">
                                    <span className="detail-config__key">{findFieldLabel(step, key) ?? key}</span>
                                    <span className="detail-config__value">{isSecret ? "••••••••••••••••" : formatReviewValue(val)}</span>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="detail-config__row">
                                <span className="detail-config__key">Standardinställningar</span>
                                <span className="detail-config__value">Inga ändringar</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div className="detail-card">
                <div className="detail-card__header">
                  <h3 className="detail-card__title">Aktivitet</h3>
                </div>
                <div className="detail-card__body">
                  {events.length === 0 ? (
                    <p style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-tertiary)" }}>Ingen aktivitet ännu.</p>
                  ) : (
                    <>
                      <div className="detail-timeline__list">
                        {visibleEvents.map((event) => (
                          <div key={event.id} className="detail-timeline__item">
                            <div className="detail-timeline__icon-col">
                              <div className="detail-timeline__icon">
                                <EditorIcon name={EVENT_ICONS[event.type] ?? "info"} size={14} />
                              </div>
                              <div className="detail-timeline__line" />
                            </div>
                            <div className="detail-timeline__content">
                              <div className="detail-timeline__label">{EVENT_LABELS[event.type] ?? event.type}</div>
                              {event.message && <div className="detail-timeline__message">{event.message}</div>}
                              <div className="detail-timeline__time">{relativeTime(event.createdAt)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {!showAllEvents && events.length > 20 && (
                        <div className="detail-timeline__more">
                          <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setShowAllEvents(true)}>
                            Visa alla ({events.length})
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Webhook deliveries */}
              {app.webhooks.length > 0 && (
                <WebhookLog deliveries={deliveries} appId={app.id} router={router} />
              )}

              {/* Danger zone */}
              <div className="detail-danger">
                <h3 className="detail-danger__title">Farlig zon</h3>

                {/* Pause / Resume */}
                <div className="detail-danger__card">
                  {status === "ACTIVE" ? (
                    <>
                      <h4 className="detail-danger__card-title">Pausa app</h4>
                      <p className="detail-danger__card-desc">Appen inaktiveras men dina inställningar sparas.</p>
                      <button className="admin-btn admin-btn--danger-secondary admin-btn--sm" onClick={() => setConfirmAction("pause")} disabled={isPending}>
                        Pausa
                      </button>
                    </>
                  ) : status === "PAUSED" ? (
                    <>
                      <h4 className="detail-danger__card-title">Återaktivera app</h4>
                      <p className="detail-danger__card-desc">Appen aktiveras igen med befintliga inställningar.</p>
                      <button className="admin-btn admin-btn--accent admin-btn--sm" onClick={handleResume} disabled={isPending}>
                        {isPending ? "Aktiverar..." : "Återaktivera"}
                      </button>
                    </>
                  ) : null}
                </div>

                {/* Uninstall */}
                <div className="detail-danger__card">
                  <h4 className="detail-danger__card-title">Avinstallera app</h4>
                  <p className="detail-danger__card-desc">Tar bort appen och alla dess inställningar permanent.</p>
                  <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => setConfirmAction("uninstall")} disabled={isPending}>
                    Avinstallera
                  </button>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="detail-sidebar">
              {/* Health card — only if app has healthCheck config */}
              {app.healthCheck && health && (
                <HealthCard health={health} history={healthHistory} appId={app.id} router={router} />
              )}

              {/* Plan card */}
              <div className="detail-card">
                <div className="detail-card__header">
                  <h3 className="detail-card__title">Plan</h3>
                </div>
                <div className="detail-card__body">
                  {currentPricing ? (
                    <>
                      <div className="detail-plan__current">
                        <span className="detail-plan__tier">
                          {currentPricing.tier === "free" ? "Gratis" : currentPricing.tier}
                        </span>
                        <span className="detail-plan__price">
                          {currentPricing.pricePerMonth === 0 ? "0 kr/mån" : `${Math.round(currentPricing.pricePerMonth / 100)} kr/mån`}
                        </span>
                      </div>
                      <ul className="detail-plan__features">
                        {currentPricing.features.map((f, i) => (
                          <li key={i} className="detail-plan__feature">
                            <EditorIcon name="check" size={14} style={{ color: "var(--admin-accent)" }} />
                            {f}
                          </li>
                        ))}
                      </ul>
                      {billingInfo && billingInfo.currentAmount > 0 && (
                        <div style={{
                          fontSize: "var(--font-xs)", color: "var(--admin-text-secondary)",
                          padding: "var(--space-2) 0", borderTop: "1px solid color-mix(in srgb, var(--admin-text) 6%, transparent)",
                          marginBottom: "var(--space-2)",
                        }}>
                          <div>Faktureras {Math.round(billingInfo.currentAmount / 100)} kr denna period</div>
                          {billingInfo.isProrated && (
                            <div style={{ color: "var(--admin-text-tertiary)", marginTop: 1 }}>
                              Proraterat — {billingInfo.daysRemaining} {billingInfo.daysRemaining === 1 ? "dag" : "dagar"} kvar
                            </div>
                          )}
                        </div>
                      )}
                      {hasPaidTiers && (
                        <button className="admin-btn admin-btn--outline admin-btn--sm" onClick={() => setPlanModal(true)} style={{ width: "100%" }}>
                          Byt plan
                        </button>
                      )}
                    </>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <EditorIcon name="check_circle" size={16} style={{ color: "var(--admin-accent)" }} />
                      <span style={{ fontSize: "var(--font-sm)", color: "var(--admin-text)" }}>Gratis</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Developer info */}
              <div className="detail-card">
                <div className="detail-card__header">
                  <h3 className="detail-card__title">Information</h3>
                </div>
                <div className="detail-card__body">
                  <div className="detail-info__row">
                    <span className="detail-info__label">Utvecklare</span>
                    <span className="detail-info__value">{app.developer === "bedfront" ? "Bedfront" : "Partner"}</span>
                  </div>
                  <div className="detail-info__row">
                    <span className="detail-info__label">Kategori</span>
                    <span className="detail-info__value">{CATEGORY_LABELS[app.category] ?? app.category}</span>
                  </div>
                  <div className="detail-info__row">
                    <span className="detail-info__label">Installerad</span>
                    <span className="detail-info__value">{new Date(detail.installedAt).toLocaleDateString("sv-SE")}</span>
                  </div>
                </div>
              </div>

              {/* Permissions */}
              <div className="detail-card">
                <div className="detail-card__header">
                  <h3 className="detail-card__title">Behörigheter</h3>
                </div>
                <div className="detail-card__body">
                  <div className="detail-permissions__list">
                    {app.permissions.map((perm) => (
                      <div key={perm} className="detail-permissions__item">
                        <EditorIcon name="lock" size={14} className="detail-permissions__icon" />
                        {PERMISSION_LABELS[perm] ?? perm}
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: "var(--admin-text-tertiary)", marginTop: "var(--space-3)" }}>
                    Dessa behörigheter beviljades vid installation.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}

      {/* Pause confirmation */}
      {confirmAction === "pause" && createPortal(
        <ConfirmModal
          title={`Pausa ${app.name}?`}
          message="Appen inaktiveras men dina inställningar sparas. Du kan återaktivera den när som helst."
          confirmLabel="Pausa"
          confirmClass="admin-btn admin-btn--danger-secondary"
          onConfirm={handlePause}
          onCancel={() => setConfirmAction(null)}
          isPending={isPending}
        />,
        document.body,
      )}

      {/* Uninstall confirmation with name input */}
      {confirmAction === "uninstall" && createPortal(
        <div className="am-overlay am-overlay--visible" onClick={() => setConfirmAction(null)}>
          <div className="am-modal" onClick={(e) => e.stopPropagation()}>
            <div className="am-modal__header">
              <h3 className="am-modal__title">Avinstallera {app.name}</h3>
              <button className="am-modal__close" onClick={() => setConfirmAction(null)}>
                <EditorIcon name="close" size={18} />
              </button>
            </div>
            <div className="am-modal__body">
              <p style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)", lineHeight: 1.6, marginBottom: "var(--space-4)" }}>
                Detta tar bort appen och alla dess inställningar permanent. Denna åtgärd kan inte ångras.
              </p>
              <p className="detail-danger__confirm-hint">
                Skriv <strong>{app.name}</strong> för att bekräfta:
              </p>
              <input
                type="text"
                className="admin-input--sm detail-danger__confirm-input"
                value={uninstallInput}
                onChange={(e) => setUninstallInput(e.target.value)}
                placeholder={app.name}
              />
            </div>
            <div className="am-modal__footer">
              <button className="admin-btn admin-btn--ghost" onClick={() => { setConfirmAction(null); setUninstallInput(""); }}>Avbryt</button>
              <button
                className="admin-btn admin-btn--danger"
                disabled={uninstallInput !== app.name || isPending}
                onClick={handleUninstall}
              >
                {isPending ? "Avinstallerar..." : "Avinstallera"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Plan change modal */}
      {planModal && createPortal(
        <div className="am-overlay am-overlay--visible" onClick={() => setPlanModal(false)}>
          <div className="am-modal" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
            <div className="am-modal__header">
              <h3 className="am-modal__title">Byt plan</h3>
              <button className="am-modal__close" onClick={() => setPlanModal(false)}>
                <EditorIcon name="close" size={18} />
              </button>
            </div>
            <div className="am-modal__body">
              <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
                {app.pricing.map((p) => {
                  const isCurrent = detail.pricingTier === p.tier;
                  return (
                    <div
                      key={p.tier}
                      style={{
                        flex: 1,
                        minWidth: 160,
                        padding: "var(--space-4)",
                        border: `2px solid ${isCurrent ? "var(--admin-accent)" : "var(--admin-border)"}`,
                        borderRadius: "var(--radius-lg)",
                        background: isCurrent ? "color-mix(in srgb, var(--admin-accent) 4%, var(--admin-surface))" : "var(--admin-surface)",
                      }}
                    >
                      <div style={{ fontSize: "var(--font-lg)", fontWeight: 600, textTransform: "capitalize", marginBottom: "var(--space-1)" }}>
                        {p.tier === "free" ? "Gratis" : p.tier}
                      </div>
                      <div style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)", marginBottom: "var(--space-3)" }}>
                        {p.pricePerMonth === 0 ? "0 kr/mån" : `${Math.round(p.pricePerMonth / 100)} kr/mån`}
                      </div>
                      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                        {p.features.map((f, i) => (
                          <li key={i} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--font-xs)", color: "var(--admin-text-secondary)" }}>
                            <EditorIcon name="check" size={12} style={{ color: "var(--admin-accent)" }} />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <button
                        className={`admin-btn admin-btn--sm ${isCurrent ? "admin-btn--outline" : "admin-btn--accent"}`}
                        disabled={isCurrent || isPending}
                        onClick={() => handlePlanChange(p.tier)}
                        style={{ width: "100%" }}
                      >
                        {isCurrent ? "Nuvarande" : isPending ? "Byter..." : "Välj"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Reconfigure panel */}
      {reconfigStep && createPortal(
        <ReconfigurePanel
          step={reconfigStep}
          existingData={(settings[reconfigStep.id] ?? {}) as Record<string, unknown>}
          onSave={(data) => handleReconfigSave(reconfigStep.id, data)}
          onClose={() => setReconfigStep(null)}
          isPending={isPending}
        />,
        document.body,
      )}
    </div>
  );
}

// ── Confirm Modal ────────────────────────────────────────────────

function ConfirmModal({
  title, message, confirmLabel, confirmClass, onConfirm, onCancel, isPending,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmClass: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className="am-overlay am-overlay--visible" onClick={onCancel}>
      <div className="am-modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <div className="am-modal__header">
          <h3 className="am-modal__title">{title}</h3>
          <button className="am-modal__close" onClick={onCancel}>
            <EditorIcon name="close" size={18} />
          </button>
        </div>
        <div className="am-modal__body">
          <p style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)", lineHeight: 1.6 }}>{message}</p>
        </div>
        <div className="am-modal__footer">
          <button className="admin-btn admin-btn--ghost" onClick={onCancel}>Avbryt</button>
          <button className={confirmClass} onClick={onConfirm} disabled={isPending}>
            {isPending ? "Vänta..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reconfigure Panel ────────────────────────────────────────────

function ReconfigurePanel({
  step, existingData, onSave, onClose, isPending,
}: {
  step: SetupStep;
  existingData: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    if (step.configFields) {
      for (const f of step.configFields) init[f.key] = existingData[f.key] ?? f.default;
    }
    if (step.apiKeyConfig?.fields) {
      for (const f of step.apiKeyConfig.fields) init[f.key] = f.secret ? "" : (existingData[f.key] ?? "");
    }
    return init;
  });

  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  return (
    <div className="detail-reconfig-overlay">
      <div className="detail-reconfig-backdrop detail-reconfig-backdrop--visible" onClick={onClose} />
      <div className="detail-reconfig-panel detail-reconfig-panel--open">
        <div className="detail-reconfig-panel__header">
          <h3 className="detail-reconfig-panel__title">{step.title}</h3>
          <button className="am-modal__close" onClick={onClose}>
            <EditorIcon name="close" size={18} />
          </button>
        </div>
        <div className="detail-reconfig-panel__body">
          <p style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)", marginBottom: "var(--space-5)", lineHeight: 1.5 }}>
            {step.description}
          </p>

          {/* Config fields */}
          {step.configFields?.map((field) => (
            <ReconfigField key={field.key} field={field} value={values[field.key]} onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))} />
          ))}

          {/* API key fields */}
          {step.apiKeyConfig?.fields?.map((field) => (
            <div key={field.key} style={{ marginBottom: "var(--space-4)" }}>
              <label style={{ display: "block", fontSize: "var(--font-sm)", fontWeight: 500, marginBottom: "var(--space-1)", color: "var(--admin-text)" }}>{field.label}</label>
              {field.secret ? (
                <div style={{ position: "relative" }}>
                  <input
                    type={showSecrets[field.key] ? "text" : "password"}
                    className="admin-input--sm"
                    placeholder={field.placeholder ?? (existingData[field.key] ? "••••••••••••••••" : "")}
                    value={String(values[field.key] ?? "")}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    style={{ width: "100%", paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    style={{ position: "absolute", right: "var(--space-2)", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--admin-text-tertiary)", padding: "var(--space-1)" }}
                    onClick={() => setShowSecrets((s) => ({ ...s, [field.key]: !s[field.key] }))}
                  >
                    <EditorIcon name={showSecrets[field.key] ? "visibility_off" : "visibility"} size={16} />
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  className="admin-input--sm"
                  value={String(values[field.key] ?? "")}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  style={{ width: "100%" }}
                />
              )}
            </div>
          ))}
        </div>
        <div className="detail-reconfig-panel__footer">
          <button className="admin-btn admin-btn--ghost" onClick={onClose}>Avbryt</button>
          <button className="admin-btn admin-btn--accent" onClick={() => onSave(values)} disabled={isPending}>
            {isPending ? "Sparar..." : "Spara"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Error Recovery Banner ────────────────────────────────────────

function ErrorRecoveryBanner({
  app, errorMessage, onReconnect, onReconfigure, isPending,
}: {
  app: AppDefinition;
  errorMessage: string;
  onReconnect: () => void;
  onReconfigure: (stepId: string) => void;
  isPending: boolean;
}) {
  const msg = errorMessage.toLowerCase();
  const isTokenError = msg.includes("token") || msg.includes("oauth") || msg.includes("session");
  const isPermissionError = msg.includes("permission") || msg.includes("behörighet") || msg.includes("403");
  const isAccountError = msg.includes("account") || msg.includes("konto");

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: "var(--space-3)",
      padding: "var(--space-4) var(--space-5)",
      background: "var(--admin-danger-tint)", borderRadius: "var(--radius-lg)",
      border: "1px solid color-mix(in srgb, var(--admin-danger) 20%, transparent)",
      marginBottom: "var(--space-5)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <EditorIcon name="error" size={20} style={{ color: "var(--admin-danger)", flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--admin-danger)", marginBottom: 2 }}>
            {app.name} — fel upptäckt
          </div>
          <div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-secondary)" }}>{errorMessage}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)", marginLeft: 32 }}>
        {isTokenError && (
          <button className="admin-btn admin-btn--danger-secondary admin-btn--sm" onClick={onReconnect} disabled={isPending}>
            Återanslut konto
          </button>
        )}
        {isPermissionError && (
          <button className="admin-btn admin-btn--danger-secondary admin-btn--sm" onClick={onReconnect} disabled={isPending}>
            Granska behörigheter
          </button>
        )}
        {isAccountError && (
          <button className="admin-btn admin-btn--danger-secondary admin-btn--sm" onClick={() => onReconfigure("select-account")} disabled={isPending}>
            Byt konto
          </button>
        )}
        {!isTokenError && !isPermissionError && !isAccountError && (
          <a href="mailto:support@bedfront.com" style={{ fontSize: "var(--font-xs)", color: "var(--admin-accent)", fontWeight: 500 }}>
            Kontakta support →
          </a>
        )}
      </div>
    </div>
  );
}

// ── App Stats Panel ─────────────────────────────────────────────

function AppStatsPanel({
  app, settings,
}: {
  app: AppDefinition;
  settings: Record<string, Record<string, unknown>>;
  health: AppHealthState | null;
  detail: AppDetail;
}) {
  if (app.id === "google-ads") {
    const accountData = settings["select-account"] ?? {};
    const trackingConfig = settings["tracking-config"] ?? {};
    const accountName = (accountData.selectedLabel as string) ?? "—";
    const accountId = (accountData.selectedValue as string) ?? "—";
    const conversionActionId = (trackingConfig.conversionActionId as string) ?? "—";
    const enhanced = (trackingConfig.enhancedConversions as boolean) ?? false;

    return (
      <div className="detail-card">
        <div className="detail-card__header">
          <h3 className="detail-card__title">Google Ads-översikt</h3>
        </div>
        <div className="detail-card__body">
          <div className="detail-config__row">
            <span className="detail-config__key">Anslutet konto</span>
            <span className="detail-config__value">{accountName} ({accountId})</span>
          </div>
          <div className="detail-config__row">
            <span className="detail-config__key">Konverterings-ID</span>
            <span className="detail-config__value">{conversionActionId}</span>
          </div>
          <div className="detail-config__row">
            <span className="detail-config__key">Förbättrade konverteringar</span>
            <span className="detail-config__value">
              <span style={{
                display: "inline-block", padding: "1px 6px",
                borderRadius: "var(--radius-full)", fontSize: 11, fontWeight: 500,
                background: enhanced ? "color-mix(in srgb, #16a34a 12%, transparent)" : "color-mix(in srgb, var(--admin-text) 8%, transparent)",
                color: enhanced ? "#16a34a" : "var(--admin-text-secondary)",
              }}>
                {enhanced ? "Aktiv" : "Inaktiv"}
              </span>
            </span>
          </div>
          <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid color-mix(in srgb, var(--admin-text) 6%, transparent)" }}>
            <a
              href={`https://ads.google.com/aw/conversions?ocid=${conversionActionId}`}
              target="_blank"
              rel="noopener"
              style={{ fontSize: "var(--font-xs)", color: "var(--admin-accent)", fontWeight: 500, textDecoration: "none" }}
            >
              Konverteringsrapport i Google Ads →
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (app.id === "meta-ads") {
    const accountData = settings["select-account"] ?? {};
    const pixelConfig = settings["pixel-config"] ?? {};
    const accountName = (accountData.selectedLabel as string) ?? "—";
    const pixelId = (pixelConfig.pixelId as string) ?? "—";
    const enhancedMatching = (pixelConfig.enhancedMatching as boolean) ?? false;

    // Token expiry — show from health message if available, else from stored date
    const connectData = settings["connect-meta"] ?? {};
    const expiresAtStr = connectData.expiresAt as string | undefined;
    // Parse days remaining from the stored expiry date.
    // This is a snapshot — refreshed on router.refresh() after each action.
    const daysUntilExpiry = (() => {
      if (!expiresAtStr) return null;
      const ms = new Date(expiresAtStr).getTime() - new Date().getTime();
      return Math.ceil(ms / (24 * 60 * 60 * 1000));
    })();

    return (
      <div className="detail-card">
        <div className="detail-card__header">
          <h3 className="detail-card__title">Meta Ads-översikt</h3>
        </div>
        <div className="detail-card__body">
          <div className="detail-config__row">
            <span className="detail-config__key">Annonskonto</span>
            <span className="detail-config__value">{accountName}</span>
          </div>
          <div className="detail-config__row">
            <span className="detail-config__key">Pixel-ID</span>
            <span className="detail-config__value">{pixelId}</span>
          </div>
          <div className="detail-config__row">
            <span className="detail-config__key">Förbättrad matchning</span>
            <span className="detail-config__value">
              <span style={{
                display: "inline-block", padding: "1px 6px",
                borderRadius: "var(--radius-full)", fontSize: 11, fontWeight: 500,
                background: enhancedMatching ? "color-mix(in srgb, #16a34a 12%, transparent)" : "color-mix(in srgb, var(--admin-text) 8%, transparent)",
                color: enhancedMatching ? "#16a34a" : "var(--admin-text-secondary)",
              }}>
                {enhancedMatching ? "Aktiv" : "Inaktiv"}
              </span>
            </span>
          </div>
          {daysUntilExpiry !== null && (
            <div className="detail-config__row">
              <span className="detail-config__key">Token giltig i</span>
              <span className="detail-config__value" style={{
                color: daysUntilExpiry <= 7 ? "#d97706" : "var(--admin-text)",
              }}>
                {daysUntilExpiry > 0 ? `${daysUntilExpiry} dagar` : "Utgången"}
              </span>
            </div>
          )}
          <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid color-mix(in srgb, var(--admin-text) 6%, transparent)" }}>
            <a
              href={`https://business.facebook.com/events_manager2/list/pixel/${pixelId}/overview`}
              target="_blank"
              rel="noopener"
              style={{ fontSize: "var(--font-xs)", color: "var(--admin-accent)", fontWeight: 500, textDecoration: "none" }}
            >
              Händelsehanteraren i Meta →
            </a>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ── Webhook Log ─────────────────────────────────────────────────

const DELIVERY_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Väntar", color: "var(--admin-text-tertiary)" },
  DELIVERED: { label: "Levererad", color: "#16a34a" },
  FAILED: { label: "Misslyckad", color: "var(--admin-danger)" },
  EXHAUSTED: { label: "Uttömd", color: "var(--admin-text)" },
};

function WebhookLog({ deliveries, router }: { deliveries: WebhookDeliveryItem[]; appId: string; router: ReturnType<typeof useRouter> }) {
  const [expanded, setExpanded] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  const handleRetry = (id: string) => {
    setRetrying(id);
    retryDelivery(id).then(() => {
      setRetrying(null);
      router.refresh();
    });
  };

  return (
    <div className="detail-card">
      <div className="detail-card__header" style={{ cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
        <h3 className="detail-card__title">Webhooks</h3>
        <EditorIcon name={expanded ? "expand_less" : "expand_more"} size={18} style={{ color: "var(--admin-text-tertiary)" }} />
      </div>
      {expanded && (
        <div className="detail-card__body" style={{ padding: 0 }}>
          {deliveries.length === 0 ? (
            <div style={{ padding: "var(--space-5)", textAlign: "center", fontSize: "var(--font-sm)", color: "var(--admin-text-tertiary)" }}>
              Inga webhook-leveranser ännu
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-xs)" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--admin-border)" }}>
                    <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", fontWeight: 500, color: "var(--admin-text-secondary)" }}>Händelse</th>
                    <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", fontWeight: 500, color: "var(--admin-text-secondary)" }}>Status</th>
                    <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", fontWeight: 500, color: "var(--admin-text-secondary)" }}>Försök</th>
                    <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", fontWeight: 500, color: "var(--admin-text-secondary)" }}>Tid</th>
                    <th style={{ padding: "var(--space-2) var(--space-3)" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => {
                    const st = DELIVERY_STATUS[d.status] ?? DELIVERY_STATUS.PENDING;
                    return (
                      <tr key={d.id} style={{ borderBottom: "1px solid color-mix(in srgb, var(--admin-text) 6%, transparent)" }}>
                        <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--admin-text)" }}>{d.eventType}</td>
                        <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                          <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: "var(--radius-full)", fontSize: 11, fontWeight: 500, background: `color-mix(in srgb, ${st.color} 12%, transparent)`, color: st.color }}>
                            {st.label}
                          </span>
                        </td>
                        <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right", color: "var(--admin-text-secondary)" }}>{d.attempts}</td>
                        <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right", color: "var(--admin-text-tertiary)" }}>{relativeTime(d.createdAt)}</td>
                        <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>
                          {d.status === "EXHAUSTED" && (
                            <button
                              className="admin-btn admin-btn--ghost admin-btn--sm"
                              style={{ fontSize: 11, padding: "2px 6px" }}
                              onClick={() => handleRetry(d.id)}
                              disabled={retrying === d.id}
                            >
                              {retrying === d.id ? "..." : "Försök igen"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Health Card ──────────────────────────────────────────────────

const HEALTH_STATUS_MAP: Record<string, { label: string; dotColor: string }> = {
  HEALTHY: { label: "Ansluten", dotColor: "#16a34a" },
  DEGRADED: { label: "Långsam respons", dotColor: "#d97706" },
  UNHEALTHY: { label: "Anslutningsfel", dotColor: "var(--admin-danger)" },
  UNCHECKED: { label: "Ej kontrollerad ännu", dotColor: "var(--admin-text-tertiary)" },
};

const UPTIME_COLORS: Record<string, string> = {
  healthy: "#16a34a",
  degraded: "#d97706",
  unhealthy: "var(--admin-danger)",
  none: "var(--admin-border)",
};

function HealthCard({
  health, history, appId, router,
}: {
  health: AppHealthState;
  history: HealthHistoryDay[];
  appId: string;
  router: ReturnType<typeof useRouter>;
}) {
  const [checking, setChecking] = useState(false);
  const info = HEALTH_STATUS_MAP[health.status] ?? HEALTH_STATUS_MAP.UNCHECKED;

  const handleCheck = () => {
    setChecking(true);
    triggerHealthCheck(appId).then(() => {
      setChecking(false);
      router.refresh();
    });
  };

  return (
    <div className="detail-card">
      <div className="detail-card__header">
        <h3 className="detail-card__title">Anslutningsstatus</h3>
      </div>
      <div className="detail-card__body">
        {/* Status row */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
          <span style={{ width: 10, height: 10, borderRadius: "var(--radius-full)", background: info.dotColor, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--admin-text)" }}>{info.label}</div>
            {health.latencyMs !== null && health.status !== "UNCHECKED" && (
              <div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)" }}>{health.latencyMs} ms</div>
            )}
          </div>
        </div>

        {/* Error message */}
        {health.status === "UNHEALTHY" && health.message && (
          <div style={{ fontSize: "var(--font-xs)", color: "var(--admin-danger)", padding: "var(--space-2) var(--space-3)", background: "var(--admin-danger-tint)", borderRadius: "var(--radius-sm)", marginBottom: "var(--space-3)", lineHeight: 1.4 }}>
            {health.message}
          </div>
        )}

        {/* Last checked */}
        {health.lastCheckedAt && (
          <div style={{ fontSize: 11, color: "var(--admin-text-tertiary)", marginBottom: "var(--space-3)" }}>
            Senast kontrollerad: {relativeTime(health.lastCheckedAt)}
          </div>
        )}

        {/* Test button */}
        <button
          className="admin-btn admin-btn--outline admin-btn--sm"
          onClick={handleCheck}
          disabled={checking}
          style={{ width: "100%" }}
        >
          {checking ? "Kontrollerar..." : "Testa anslutning"}
        </button>

        {/* Uptime chart */}
        {history.length > 0 && (
          <div style={{ marginTop: "var(--space-4)" }}>
            <div style={{ fontSize: 11, color: "var(--admin-text-tertiary)", marginBottom: "var(--space-2)" }}>Senaste 30 dagarna</div>
            <UptimeChart history={history} />
          </div>
        )}
      </div>
    </div>
  );
}

function UptimeChart({ history }: { history: HealthHistoryDay[] }) {
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 24 }}>
      {history.map((day) => (
        <div
          key={day.date}
          title={`${day.date}: ${day.status === "none" ? "Inga kontroller" : day.status === "healthy" ? "OK" : day.status === "degraded" ? "Långsam" : "Fel"}`}
          style={{
            flex: 1,
            height: day.status === "none" ? 8 : 24,
            borderRadius: 2,
            background: UPTIME_COLORS[day.status] ?? UPTIME_COLORS.none,
            opacity: day.status === "none" ? 0.4 : 1,
            transition: "opacity var(--duration-normal) var(--ease-default)",
          }}
        />
      ))}
    </div>
  );
}

function ReconfigField({ field, value, onChange }: { field: ConfigField; value: unknown; onChange: (v: unknown) => void }) {
  switch (field.type) {
    case "toggle":
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)", padding: "var(--space-3) 0", borderBottom: "1px solid color-mix(in srgb, var(--admin-text) 6%, transparent)" }}>
          <div>
            <div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--admin-text)" }}>{field.label}</div>
            {field.hint && <div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", marginTop: 1 }}>{field.hint}</div>}
          </div>
          <button type="button" className={`admin-toggle${value === true ? " admin-toggle-on" : ""}`} onClick={() => onChange(!value)}>
            <span className="admin-toggle-thumb" />
          </button>
        </div>
      );
    case "select":
      return (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <label style={{ display: "block", fontSize: "var(--font-sm)", fontWeight: 500, marginBottom: "var(--space-1)", color: "var(--admin-text)" }}>{field.label}</label>
          <select className="setup-select" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} style={{ width: "100%" }}>
            {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {field.hint && <div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", marginTop: "var(--space-1)" }}>{field.hint}</div>}
        </div>
      );
    case "number":
      return (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <label style={{ display: "block", fontSize: "var(--font-sm)", fontWeight: 500, marginBottom: "var(--space-1)", color: "var(--admin-text)" }}>{field.label}</label>
          <input type="number" className="admin-input--sm" value={value as number ?? 0} onChange={(e) => onChange(Number(e.target.value))} style={{ width: 120 }} />
          {field.hint && <div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", marginTop: "var(--space-1)" }}>{field.hint}</div>}
        </div>
      );
    default:
      return (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <label style={{ display: "block", fontSize: "var(--font-sm)", fontWeight: 500, marginBottom: "var(--space-1)", color: "var(--admin-text)" }}>{field.label}</label>
          <input type="text" className="admin-input--sm" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} style={{ width: "100%" }} />
          {field.hint && <div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", marginTop: "var(--space-1)" }}>{field.hint}</div>}
        </div>
      );
  }
}
