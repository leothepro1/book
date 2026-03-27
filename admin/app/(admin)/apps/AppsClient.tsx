"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { installApp } from "@/app/_lib/apps/actions";
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
  initialAppId?: string;
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

function renderMarkdown(md: string): string {
  return md
    .replace(/## (.+)/g, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hul])(.+)$/gm, '<p>$1</p>')
    .replace(/<p><\/p>/g, '')
    .replace(/<p>(<[hul])/g, '$1')
    .replace(/(<\/[hul][l2]?>)<\/p>/g, '$1');
}

// ── App Modal ────────────────────────────────────────────────────

function AppModal({
  app,
  visible,
  onClose,
  status,
  setupReady,
}: {
  app: AppDefinition;
  visible: boolean;
  onClose: () => void;
  status: AppStatus | null;
  setupReady: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [selectedTier, setSelectedTier] = useState(app.pricing[0]?.tier ?? "free");
  const carouselRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCarouselIndex(0);
    setSelectedTier(app.pricing[0]?.tier ?? "free");
  }, [app.id, app.pricing]);

  // Sync sidebar max-height with carousel slide height
  useEffect(() => {
    const carousel = carouselRef.current;
    const sidebar = sidebarRef.current;
    if (!carousel || !sidebar) return;

    const sync = () => {
      const h = carousel.getBoundingClientRect().height;
      if (h > 0) sidebar.style.height = `${h}px`;
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(carousel);
    return () => ro.disconnect();
  }, [app.id, visible]);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleInstall = () => {
    startTransition(async () => {
      const result = await installApp(app.id);
      if (result.ok) router.push(`/apps/${app.id}/setup`);
    });
  };

  const currentPricing = app.pricing.find((p) => p.tier === selectedTier) ?? app.pricing[0];
  const hasScreenshots = app.screenshots.length > 0;

  // CTA logic
  let ctaLabel = isPending ? "Installerar..." : "Installera";
  let ctaAction = handleInstall;
  let ctaDisabled = isPending || (app.requiredSetup.length > 0 && !setupReady);
  let ctaClassName = "admin-btn admin-btn--accent";

  if (status === "ACTIVE") {
    ctaLabel = "Hantera"; ctaAction = () => router.push(`/apps/${app.id}`); ctaClassName = "admin-btn admin-btn--outline"; ctaDisabled = false;
  } else if (status === "PENDING_SETUP") {
    ctaLabel = "Slutför inställning"; ctaAction = () => router.push(`/apps/${app.id}/setup`); ctaClassName = "admin-btn admin-btn--accent"; ctaDisabled = false;
  } else if (status === "ERROR") {
    ctaLabel = "Åtgärda"; ctaAction = () => router.push(`/apps/${app.id}`); ctaClassName = "admin-btn admin-btn--danger"; ctaDisabled = false;
  } else if (status === "PAUSED") {
    ctaLabel = "Aktivera"; ctaAction = () => router.push(`/apps/${app.id}`); ctaClassName = "admin-btn admin-btn--accent"; ctaDisabled = false;
  }

  return (
    <div className={`app-modal__overlay${visible ? " app-modal__overlay--visible" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="app-modal__inner">
        <div className="app-modal">
          <div className="app-modal__body">
            <div className="app-modal__layout">
            {/* Left column — content */}
            <div className="app-modal__content">
              {/* Screenshot carousel */}
              {hasScreenshots && (
                <div className="app-carousel" ref={carouselRef}>
                  <div className="app-carousel__viewport">
                    <div className="app-carousel__track" style={{ transform: `translateX(-${carouselIndex * 100}%)` }}>
                      {app.screenshots.map((s, i) => (
                        <div key={i} className="app-carousel__slide">
                          <img
                            src={s.url.includes("cloudinary") ? `${s.url}/c_fill,w_1200,h_750,g_auto,q_auto,f_auto` : s.url}
                            alt={s.alt}
                            className="app-carousel__img"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  {app.screenshots.length > 1 && (
                    <div className="app-carousel__thumbs">
                      {app.screenshots.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          className={`app-carousel__thumb${i === carouselIndex ? " app-carousel__thumb--active" : ""}`}
                          onClick={() => setCarouselIndex(i)}
                        >
                          <img
                            src={s.url.includes("cloudinary") ? `${s.url}/c_fill,w_120,h_75,g_auto,q_auto,f_auto` : s.url}
                            alt={s.alt}
                            className="app-carousel__thumb-img"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              {app.longDescription && (
                <div
                  className="app-listing__prose"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(app.longDescription) }}
                />
              )}

            </div>

            {/* Right column — sidebar */}
            <div className="app-modal__sidebar" ref={sidebarRef}>
              <div className="app-modal__sidebar-scroll">
                {/* App header */}
                <div className="app-listing__header">
                  <div className="app-listing__icon">
                    {app.iconUrl
                      ? <img src={app.iconUrl} alt="" className="app-modal__icon-img" />
                      : <span className="material-symbols-rounded" style={{ fontSize: 32 }}>{app.icon}</span>
                    }
                  </div>
                  <div className="app-listing__header-info">
                    <h3 className="app-modal__name">{app.name}</h3>
                    <p className="app-modal__developer">Skapad av {app.developer === "bedfront" ? "Bedfront" : app.developer}</p>
                  </div>
                </div>

                {/* Hero heading + description */}
                {(app.heroHeading || app.heroDescription) && (
                  <div className="app-listing__hero">
                    {app.heroHeading && (
                      <h2 className="app-listing__hero-heading">{app.heroHeading}</h2>
                    )}
                    {app.heroDescription && (
                      <p className="app-listing__hero-desc">{app.heroDescription}</p>
                    )}
                  </div>
                )}

                {/* Permissions */}
                {(app.permissionLabels ?? []).length > 0 && (
                  <div className="app-modal__permissions">
                    <h4 className="app-modal__permissions-title">Behörigheter</h4>
                    <p className="app-modal__permissions-subtitle">När denna app är installerad kan den:</p>
                    <ul className="app-modal__permissions-list">
                      {app.permissionLabels!.map((label, i) => (
                        <li key={i} className="app-modal__permissions-item">
                          <span className="material-symbols-rounded app-modal__permissions-check">check</span>
                          {label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* CTA — sticky footer */}
              <div className="app-modal__cta">
                <button
                  className={`app-modal__cta-btn${status ? " app-modal__cta-btn--secondary" : ""}`}
                  onClick={status ? () => router.push(`/apps/${app.id}`) : handleInstall}
                  disabled={!status && ctaDisabled}
                  type="button"
                >
                  {status ? "Öppna" : (isPending ? "Installerar..." : "Installera")}
                </button>
              </div>
            </div>
            </div>

            {/* Pricing section — full width */}
            {app.pricing.length > 0 && (
              <div className="app-modal__pricing">
                <h3 className="app-modal__pricing-title">Priser</h3>
                <div className={`app-modal__pricing-grid${app.pricing.length >= 3 ? " app-modal__pricing-grid--three" : ""}`}>
                  {app.pricing.map((p) => (
                    <div key={p.tier} className="app-modal__pricing-card">
                      <div className="app-modal__pricing-tier">
                        {p.tier === "free" ? "Gratis" : p.tier === "grow" ? "Grow" : "Pro"}
                      </div>
                      {p.features.map((f, i) => (
                        <p key={i} className="app-modal__pricing-feature">{f}</p>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="app-modal__close-col">
          <button className="app-modal__close" onClick={onClose} type="button">
            <EditorIcon name="close" size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export function AppsClient({ apps, installed, setup, healthStates, initialAppId }: Props) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<AppCategory | "all">("all");
  const [selectedApp, setSelectedApp] = useState<AppDefinition | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const closingRef = useRef(false);
  const fromInitialRef = useRef(!!initialAppId);

  // Build lookups
  const installMap = new Map(installed.map((a) => [a.appId, a]));
  const healthMap = new Map(healthStates.map((h) => [h.appId, h.status]));
  const setupReady = setup.isReadyForApps;

  // Initialize from prop (direct visit to /apps/[appId])
  useEffect(() => {
    if (initialAppId) {
      const app = apps.find((a) => a.id === initialAppId);
      if (app) setSelectedApp(app);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animate modal in when selectedApp changes
  useEffect(() => {
    if (selectedApp && !modalVisible && !closingRef.current) {
      requestAnimationFrame(() => setModalVisible(true));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedApp]);

  // Handle browser back/forward
  useEffect(() => {
    const onPopState = () => {
      if (selectedApp && !closingRef.current) {
        closingRef.current = true;
        setModalVisible(false);
        setTimeout(() => {
          setSelectedApp(null);
          closingRef.current = false;
        }, 350);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [selectedApp]);

  const openModal = useCallback((app: AppDefinition) => {
    fromInitialRef.current = false;
    setSelectedApp(app);
    window.history.pushState(null, "", `/apps/${app.id}`);
  }, []);

  const closeModal = useCallback(() => {
    closingRef.current = true;
    setModalVisible(false);
    setTimeout(() => {
      setSelectedApp(null);
      closingRef.current = false;
    }, 350);
    if (fromInitialRef.current) {
      window.history.replaceState(null, "", "/apps");
      fromInitialRef.current = false;
    } else {
      window.history.back();
    }
  }, []);

  // Filter
  const filtered = apps.filter((app) => {
    if (category !== "all" && app.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!app.name.toLowerCase().includes(q) && !app.tagline.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="admin-page admin-page--no-preview">
      <div className="admin-editor">
        <div className="apps-page">
          {/* Header */}
          <div className="apps-header">
            <h1 className="apps-header__title">App Store</h1>
            <p className="apps-header__tagline">Utöka din bokningsmotor med appar och integrationer</p>
          </div>

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
                  <div
                    key={app.id}
                    className="app-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => openModal(app)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(app); } }}
                  >
                    <div className="app-card__top">
                      <div className="app-card__icon-wrap">
                        {app.iconUrl
                          ? <img src={app.iconUrl} alt="" className="app-card__icon-img" />
                          : <span className="material-symbols-rounded" style={{ fontSize: 24 }}>{app.icon}</span>
                        }
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* App modal */}
      {selectedApp && (
        <AppModal
          app={selectedApp}
          visible={modalVisible}
          onClose={closeModal}
          status={(installMap.get(selectedApp.id)?.status ?? null) as AppStatus | null}
          setupReady={setupReady}
        />
      )}
    </div>
  );
}
