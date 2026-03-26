"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { installApp } from "@/app/_lib/apps/actions";
import type { AppDefinition } from "@/app/_lib/apps/types";
import "./app-listing.css";

const CATEGORY_LABELS: Record<string, string> = {
  marketing: "Marknadsföring", sales: "Försäljning", analytics: "Analys",
  channels: "Kanaler", crm: "CRM", operations: "Drift", finance: "Ekonomi",
};

// ── Simple markdown renderer ────────────────────────────────────

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

// ── Main Component ──────────────────────────────────────────────

export function AppListingClient({ app }: { app: AppDefinition }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [selectedTier, setSelectedTier] = useState(app.pricing[0]?.tier ?? "free");

  const currentPricing = app.pricing.find((p) => p.tier === selectedTier) ?? app.pricing[0];
  const hasScreenshots = app.screenshots.length > 0;

  const handleInstall = () => {
    startTransition(async () => {
      const result = await installApp(app.id);
      if (result.ok) router.push(`/apps/${app.id}/setup`);
    });
  };

  return (
    <div className="admin-page admin-page--no-preview">
      <div className="admin-editor">
        <div className="app-listing">
          <Link href="/apps" className="app-listing__back">
            <EditorIcon name="arrow_back" size={16} />
            App Store
          </Link>

          <div className="app-listing__body">
            {/* Left column */}
            <div>
              {/* Header */}
              <div className="app-listing__header">
                <div className="app-listing__icon">
                  <span className="material-symbols-rounded" style={{ fontSize: 32 }}>{app.icon}</span>
                </div>
                <div className="app-listing__header-info">
                  <h1 className="app-listing__name">{app.name}</h1>
                  <p className="app-listing__tagline">{app.tagline}</p>
                  <div className="app-listing__meta">
                    <span className="app-listing__dev-badge">
                      {app.developer === "bedfront" ? "Av Bedfront" : "Av Partner"}
                    </span>
                    <span className="app-listing__category-chip">
                      {CATEGORY_LABELS[app.category] ?? app.category}
                    </span>
                    {app.installCount && (
                      <span className="app-listing__install-count">
                        <EditorIcon name="group" size={14} />
                        Används av {app.installCount}+ hotell
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Screenshot carousel */}
              {hasScreenshots && (
                <div className="app-carousel">
                  <div className="app-carousel__viewport">
                    <div className="app-carousel__track" style={{ transform: `translateX(-${carouselIndex * 100}%)` }}>
                      {app.screenshots.map((s, i) => (
                        <div key={i} className="app-carousel__slide">
                          <img
                            src={`${s.url}/c_fill,w_1200,h_750,g_auto,q_auto,f_auto`}
                            alt={s.alt}
                            className="app-carousel__img"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  {app.screenshots.length > 1 && (
                    <>
                      <button className="app-carousel__nav app-carousel__nav--prev" onClick={() => setCarouselIndex((i) => Math.max(0, i - 1))} disabled={carouselIndex === 0}>
                        <EditorIcon name="chevron_left" size={20} />
                      </button>
                      <button className="app-carousel__nav app-carousel__nav--next" onClick={() => setCarouselIndex((i) => Math.min(app.screenshots.length - 1, i + 1))} disabled={carouselIndex === app.screenshots.length - 1}>
                        <EditorIcon name="chevron_right" size={20} />
                      </button>
                      <div className="app-carousel__dots">
                        {app.screenshots.map((_, i) => (
                          <button key={i} className={`app-carousel__dot${i === carouselIndex ? " app-carousel__dot--active" : ""}`} onClick={() => setCarouselIndex(i)} />
                        ))}
                      </div>
                    </>
                  )}
                  {app.screenshots[carouselIndex]?.caption && (
                    <div className="app-carousel__caption">{app.screenshots[carouselIndex].caption}</div>
                  )}
                </div>
              )}

              {/* Highlights */}
              {app.highlights.length > 0 && (
                <div className="app-highlights">
                  {app.highlights.map((h, i) => (
                    <div key={i} className="app-highlights__card">
                      <EditorIcon name={h.icon} size={28} className="app-highlights__icon" />
                      <h3 className="app-highlights__title">{h.title}</h3>
                      <p className="app-highlights__desc">{h.description}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Long description */}
              {app.longDescription && (
                <div className="app-listing__description">
                  <h2 className="app-listing__section-title">Om appen</h2>
                  <div
                    className="app-listing__prose"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(app.longDescription) }}
                  />
                </div>
              )}

              {/* Changelog */}
              {app.changelog.length > 0 && (
                <div className="app-changelog">
                  <h2 className="app-listing__section-title">Versionshistorik</h2>
                  {app.changelog.slice(0, 3).map((entry, i) => (
                    <div key={i} className="app-changelog__entry">
                      <span className="app-changelog__version">{entry.version}</span>
                      <span className="app-changelog__date">
                        · {new Date(entry.date).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" })}
                      </span>
                      <ul className="app-changelog__changes">
                        {entry.changes.map((c, j) => <li key={j}>{c}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right column — Install card */}
            <div>
              <div className="app-install-card">
                {/* Pricing tabs */}
                {app.pricing.length > 1 && (
                  <div className="app-install-card__pricing-tabs">
                    {app.pricing.map((p) => (
                      <button
                        key={p.tier}
                        className={`app-install-card__pricing-tab${selectedTier === p.tier ? " app-install-card__pricing-tab--active" : ""}`}
                        onClick={() => setSelectedTier(p.tier)}
                      >
                        {p.tier === "free" ? "Gratis" : p.tier.charAt(0).toUpperCase() + p.tier.slice(1)}
                      </button>
                    ))}
                  </div>
                )}

                {/* Price */}
                {currentPricing && (
                  <div className="app-install-card__price">
                    {currentPricing.pricePerMonth === 0 ? "Gratis" : `${Math.round(currentPricing.pricePerMonth / 100)} kr/mån`}
                  </div>
                )}

                {/* Features */}
                {currentPricing && (
                  <ul className="app-install-card__features">
                    {currentPricing.features.map((f, i) => (
                      <li key={i} className="app-install-card__feature">
                        <EditorIcon name="check_circle" size={14} className="app-install-card__feature-icon" />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Install CTA */}
                <button className="admin-btn admin-btn--accent" style={{ width: "100%" }} onClick={handleInstall} disabled={isPending}>
                  {isPending ? "Installerar..." : "Installera"}
                </button>

                {/* Works with */}
                {app.worksWithServices.length > 0 && (
                  <div className="app-install-card__works-with">
                    <div className="app-install-card__works-label">Fungerar med</div>
                    {app.worksWithServices.map((s, i) => (
                      <div key={i} className="app-install-card__service">
                        <EditorIcon name="check" size={14} style={{ color: "var(--admin-text-tertiary)" }} />
                        {s.name}
                      </div>
                    ))}
                  </div>
                )}

                {/* Support links */}
                {(app.documentationUrl || app.supportUrl || app.privacyPolicyUrl) && (
                  <div className="app-install-card__links">
                    {app.documentationUrl && (
                      <a href={app.documentationUrl} target="_blank" rel="noopener" className="app-install-card__link">
                        <EditorIcon name="menu_book" size={14} /> Dokumentation
                      </a>
                    )}
                    {app.supportUrl && (
                      <a href={app.supportUrl} target="_blank" rel="noopener" className="app-install-card__link">
                        <EditorIcon name="support" size={14} /> Support
                      </a>
                    )}
                    {app.privacyPolicyUrl && (
                      <a href={app.privacyPolicyUrl} target="_blank" rel="noopener" className="app-install-card__link">
                        <EditorIcon name="policy" size={14} /> Sekretesspolicy
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
