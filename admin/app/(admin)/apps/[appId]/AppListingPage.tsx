"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { installApp } from "@/app/_lib/apps/actions";
import type { AppDefinition, AppStatus } from "@/app/_lib/apps/types";
import "../apps.css";
import "./app-listing.css";

const CATEGORY_LABELS: Record<string, string> = {
  marketing: "Marknadsföring", sales: "Försäljning", analytics: "Analys",
  channels: "Kanaler", crm: "CRM", operations: "Drift", finance: "Ekonomi",
};

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

export function AppListingPage({
  app,
  status,
  setupReady,
}: {
  app: AppDefinition;
  status: AppStatus | null;
  setupReady: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedTier, setSelectedTier] = useState(app.pricing[0]?.tier ?? "free");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const handleInstall = () => {
    startTransition(async () => {
      const result = await installApp(app.id);
      if (result.ok) router.push(`/apps/${app.id}/setup`);
    });
  };

  const currentPricing = app.pricing.find((p) => p.tier === selectedTier) ?? app.pricing[0];
  const hasScreenshots = app.screenshots.length > 0;

  // CTA
  let ctaLabel = isPending ? "Installerar..." : "Installera";
  let ctaAction = handleInstall;
  let ctaDisabled = isPending || (app.requiredSetup.length > 0 && !setupReady);

  if (status === "ACTIVE") {
    ctaLabel = "Hantera"; ctaAction = () => router.push(`/apps/${app.id}`); ctaDisabled = false;
  } else if (status === "PENDING_SETUP") {
    ctaLabel = "Slutför inställning"; ctaAction = () => router.push(`/apps/${app.id}/setup`); ctaDisabled = false;
  } else if (status === "ERROR") {
    ctaLabel = "Åtgärda"; ctaAction = () => router.push(`/apps/${app.id}`); ctaDisabled = false;
  } else if (status === "PAUSED") {
    ctaLabel = "Aktivera"; ctaAction = () => router.push(`/apps/${app.id}`); ctaDisabled = false;
  }

  return (
    <div className="apps-root">
      {/* Shared sticky header */}
      <div className="apps-topbar">
        <div className="apps-topbar__inner">
          <div className="apps-topbar__left">
            <Link href="/apps" className="apps-topbar__back">
              <EditorIcon name="arrow_back" size={23} />
            </Link>
            <div className="apps-topbar__app-id">
              <div className="apps-topbar__app-icon">
                {app.iconUrl
                  ? <img src={app.iconUrl} alt="" className="apps-topbar__app-icon-img" />
                  : <span className="material-symbols-rounded" style={{ fontSize: 16 }}>{app.icon}</span>
                }
              </div>
              <span className="apps-topbar__title">{app.name}</span>
            </div>
          </div>
          <button
            className={`app-listing__cta-btn${status ? " app-listing__cta-btn--secondary" : ""}`}
            onClick={ctaAction}
            disabled={!status && ctaDisabled}
            type="button"
          >
            {ctaLabel}
          </button>
        </div>
      </div>

      <div className="app-listing-page">
        <h2 className="app-listing-page__section-title">Förhandsvisning</h2>

        <div className="app-listing__body">
          {/* Left column */}
          <div className="app-listing__main">
            {/* Screenshot gallery */}
            {hasScreenshots && (
              <div className="app-gallery">
                <button
                  type="button"
                  className="app-gallery__slide"
                  onClick={() => { setLightboxIndex(galleryIndex); setLightboxOpen(true); }}
                >
                  <img
                    src={app.screenshots[galleryIndex].url.includes("cloudinary") ? `${app.screenshots[galleryIndex].url}/c_fill,w_900,h_560,g_auto,q_auto,f_auto` : app.screenshots[galleryIndex].url}
                    alt={app.screenshots[galleryIndex].alt}
                    className="app-gallery__img"
                  />
                </button>
                {galleryIndex > 0 && (
                  <button type="button" className="app-gallery__nav app-gallery__nav--prev" onClick={() => setGalleryIndex((i) => i - 1)}>
                    <EditorIcon name="chevron_left" size={24} />
                  </button>
                )}
                {galleryIndex < app.screenshots.length - 1 && (
                  <button type="button" className="app-gallery__nav app-gallery__nav--next" onClick={() => setGalleryIndex((i) => i + 1)}>
                    <EditorIcon name="chevron_right" size={24} />
                  </button>
                )}
              </div>
            )}

            {/* Hero */}
            {(app.heroHeading || app.heroDescription) && (
              <div className="app-listing__hero">
                {app.heroHeading && <h2 className="app-listing__hero-heading">{app.heroHeading}</h2>}
                {app.heroDescription && <p className="app-listing__hero-desc">{app.heroDescription}</p>}
              </div>
            )}

            {/* Description */}
            {app.longDescription && (
              <div className="app-listing__description">
                <div className="app-listing__prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(app.longDescription) }} />
              </div>
            )}

            {/* Highlights */}
            {app.highlights.length > 0 && (
              <div className="app-highlights">
                {app.highlights.map((h, i) => (
                  <div key={i} className="app-highlights__card">
                    <div className="app-highlights__icon">
                      <EditorIcon name={h.icon} size={24} />
                    </div>
                    <h4 className="app-highlights__title">{h.title}</h4>
                    <p className="app-highlights__desc">{h.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right column — install card */}
          <div className="app-install-card">
            {/* Pricing tabs */}
            {app.pricing.length > 1 && (
              <div className="app-install-card__pricing-tabs">
                {app.pricing.map((p) => (
                  <button
                    key={p.tier}
                    type="button"
                    className={`app-install-card__pricing-tab${selectedTier === p.tier ? " app-install-card__pricing-tab--active" : ""}`}
                    onClick={() => setSelectedTier(p.tier)}
                  >
                    {p.tier === "free" ? "Gratis" : p.tier}
                  </button>
                ))}
              </div>
            )}

            {currentPricing && (
              <>
                <div className="app-install-card__price">
                  {currentPricing.pricePerMonth === 0 ? "Gratis" : `${Math.round(currentPricing.pricePerMonth / 100)} kr/mån`}
                </div>
                {currentPricing.features.length > 0 && (
                  <ul className="app-install-card__features">
                    {currentPricing.features.map((f, i) => (
                      <li key={i} className="app-install-card__feature">
                        <EditorIcon name="check" size={14} className="app-install-card__feature-icon" />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {/* Permissions */}
            {(app.permissionLabels ?? []).length > 0 && (
              <div style={{ borderTop: "1px solid var(--admin-border)", paddingTop: "var(--space-4)", marginTop: "var(--space-4)" }}>
                <div className="app-install-card__works-label">Behörigheter</div>
                {app.permissionLabels!.map((label, i) => (
                  <div key={i} className="app-install-card__service">
                    <EditorIcon name="check" size={14} style={{ color: "#047B5D" }} />
                    {label}
                  </div>
                ))}
              </div>
            )}

            {/* Links */}
            {(app.supportUrl || app.documentationUrl || app.privacyPolicyUrl) && (
              <div className="app-install-card__links">
                {app.documentationUrl && (
                  <a href={app.documentationUrl} target="_blank" rel="noopener noreferrer" className="app-install-card__link">
                    <EditorIcon name="description" size={14} /> Dokumentation
                  </a>
                )}
                {app.supportUrl && (
                  <a href={app.supportUrl} target="_blank" rel="noopener noreferrer" className="app-install-card__link">
                    <EditorIcon name="support" size={14} /> Support
                  </a>
                )}
                {app.privacyPolicyUrl && (
                  <a href={app.privacyPolicyUrl} target="_blank" rel="noopener noreferrer" className="app-install-card__link">
                    <EditorIcon name="policy" size={14} /> Integritetspolicy
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxOpen && app.screenshots.length > 0 && createPortal(
        <div className="app-lightbox" onClick={() => setLightboxOpen(false)}>
          <button className="app-lightbox__close" onClick={() => setLightboxOpen(false)} type="button">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
          {app.screenshots.length > 1 && (
            <>
              <button className="app-lightbox__nav app-lightbox__nav--prev" onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i - 1 + app.screenshots.length) % app.screenshots.length); }} type="button">
                <EditorIcon name="chevron_left" size={28} />
              </button>
              <button className="app-lightbox__nav app-lightbox__nav--next" onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i + 1) % app.screenshots.length); }} type="button">
                <EditorIcon name="chevron_right" size={28} />
              </button>
            </>
          )}
          <img src={app.screenshots[lightboxIndex].url} alt={app.screenshots[lightboxIndex].alt} className="app-lightbox__img" onClick={(e) => e.stopPropagation()} />
        </div>,
        document.body,
      )}
    </div>
  );
}
