"use client";

/**
 * Search Results Renderer
 * ───────────────────────
 * Locked section renderer for the stays/search page.
 * Renders compact search form + availability results.
 * Data fetched client-side from /api/availability.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { formatDateRange } from "@/app/_lib/search/dates";
import type { SearchResult, SearchResultRatePlan, AvailabilityResponse } from "@/app/_lib/search/types";
import { CommerceEngineProvider } from "@/app/_lib/commerce/CommerceEngineContext";
import { FONT_CATALOG } from "@/app/_lib/fonts/catalog";
import { useCommerceEngineContext } from "@/app/_lib/commerce/CommerceEngineContext";
import "./search-results-renderer.css";
import "@/app/(guest)/_components/spinner-button.css";

// ── Font resolution ───────────────────────────────────────────

function fontStack(key: string): string {
  if (!key) return "";
  const entry = FONT_CATALOG.find((f) => f.key === key);
  if (!entry) return key;
  return `${entry.label}, ${entry.serif ? "serif" : "sans-serif"}`;
}

function buildSectionStyle(s: Record<string, unknown>): React.CSSProperties {
  return {
    ...(s.bgColor ? { "--background": s.bgColor as string } : {}),
    ...(s.textColor ? { "--text": s.textColor as string } : {}),
    ...(s.buttonColor ? { "--button-bg": s.buttonColor as string, "--button-fg": "#fff" } : {}),
    ...(s.accentColor ? { "--accent": s.accentColor as string } : {}),
    ...(s.headingFont ? { "--font-heading": fontStack(s.headingFont as string) } : {}),
    ...(s.bodyFont ? { "--font-body": fontStack(s.bodyFont as string) } : {}),
    ...(s.buttonFont ? { "--font-button": fontStack(s.buttonFont as string) } : {}),
    ...(s.bgColor ? { backgroundColor: s.bgColor as string } : {}),
    ...(s.showShadow === false ? { "--sr-card-shadow": "none" } : {}),
  } as React.CSSProperties;
}

// ── Compact Search Form ────────────────────────────────────────

function CompactSearchForm({
  defaultCheckIn,
  defaultCheckOut,
  defaultGuests,
}: {
  defaultCheckIn: string;
  defaultCheckOut: string;
  defaultGuests: number;
}) {
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);
  const [guests, setGuests] = useState(defaultGuests);
  const today = new Date().toISOString().split("T")[0];

  return (
    <form
      className="sr__form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!checkIn || !checkOut || guests < 1) return;
        const params = new URLSearchParams(window.location.search);
        params.set("checkIn", checkIn);
        params.set("checkOut", checkOut);
        params.set("guests", String(guests));
        window.location.search = params.toString();
      }}
    >
      <div className="sr__form-field">
        <label className="sr__form-label">Incheckning</label>
        <input type="date" value={checkIn} min={today} onChange={(e) => { setCheckIn(e.target.value); if (checkOut && e.target.value >= checkOut) setCheckOut(""); }} className="sr__form-input" required />
      </div>
      <div className="sr__form-field">
        <label className="sr__form-label">Utcheckning</label>
        <input type="date" value={checkOut} min={checkIn || today} onChange={(e) => setCheckOut(e.target.value)} className="sr__form-input" required />
      </div>
      <div className="sr__form-field sr__form-field--guests">
        <label className="sr__form-label">Gäster</label>
        <input type="number" value={guests} min={1} max={99} onChange={(e) => setGuests(parseInt(e.target.value, 10) || 1)} className="sr__form-input" required />
      </div>
      <button type="submit" className="sr__form-btn">
        <span className="material-symbols-rounded" style={{ fontSize: 20 }}>search</span>
        Sök
      </button>
    </form>
  );
}

// ── Card Image Carousel ───────────────────────────────────────

function CardImageCarousel({ images, alt }: { images: string[]; alt: string }) {
  const [idx, setIdx] = useState(0);
  const hasMultiple = images.length > 1;

  const prev = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIdx((i) => Math.max(0, i - 1));
  }, []);

  const next = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIdx((i) => Math.min(images.length - 1, i + 1));
  }, [images.length]);

  if (images.length === 0) {
    return <div className="sr__card-image"><div className="sr__card-placeholder" /></div>;
  }

  return (
    <div className="sr__card-image">
      <img src={images[idx]} alt={alt} />
      {hasMultiple && (
        <div className="sr__card-image-nav">
          <button type="button" className={`sr__card-image-btn sr__card-image-btn--prev${idx === 0 ? " sr__card-image-btn--hidden" : ""}`} onClick={prev} aria-label="Föregående bild" tabIndex={idx === 0 ? -1 : 0}>
            <span className="material-symbols-rounded" style={{ fontSize: 23 }}>chevron_left</span>
          </button>
          <button type="button" className={`sr__card-image-btn sr__card-image-btn--next${idx === images.length - 1 ? " sr__card-image-btn--hidden" : ""}`} onClick={next} aria-label="Nästa bild" tabIndex={idx === images.length - 1 ? -1 : 0}>
            <span className="material-symbols-rounded" style={{ fontSize: 23 }}>chevron_right</span>
          </button>
        </div>
      )}
      {hasMultiple && (
        <div className="sr__card-image-dots">
          {images.map((_, i) => (
            <span key={i} className={`sr__card-image-dot${i === idx ? " sr__card-image-dot--active" : ""}`} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Room Card ──────────────────────────────────────────────────

type RoomCardProps = {
  entry: SearchResult;
  searchParams: string;
  nights: number;
  guests: number;
  checkIn: string;
  checkOut: string;
};

function RoomCard({ entry, searchParams, nights, guests, checkIn, checkOut }: RoomCardProps) {
  const { category, ratePlans, available, restrictionViolations, accommodationId } = entry;
  const lowestTotal = ratePlans.length > 0 ? Math.min(...ratePlans.map((rp) => rp.totalAmount)) : 0;
  const images = category.imageUrls ?? [];
  const description = category.longDescription || category.shortDescription;
  const descRef = useRef<HTMLParagraphElement>(null);
  const [isClamped, setIsClamped] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [bookingPlanId, setBookingPlanId] = useState<string | null>(null);

  const engine = useCommerceEngineContext();
  const router = useRouter();

  useEffect(() => {
    const el = descRef.current;
    if (el) setIsClamped(el.scrollHeight > el.clientHeight);
  }, [description]);

  const handleBook = async (rp: SearchResultRatePlan) => {
    if (!accommodationId) return;
    if (engine.checkoutStatus === "loading") return;

    setBookingPlanId(rp.externalId);

    engine.selectAccommodation({
      accommodationId,
      ratePlanId: rp.externalId,
      checkIn,
      checkOut,
      adults: guests,
      children: 0,
    });

    const result = await engine.initiateCheckout();

    if (!result) {
      // Keep bookingPlanId set so the error message renders.
      // engine.checkoutError is populated by the engine.
      return;
    }

    const url = result.redirect.includes("?")
      ? `${result.redirect}&session=${result.token}`
      : `${result.redirect}?session=${result.token}`;
    router.push(url);
  };

  const isCheckingOut = engine.checkoutStatus === "loading";

  return (
    <div className={`sr__card${expanded ? " sr__card--expanded" : ""}`}>
      <CardImageCarousel images={images} alt={category.name} />
      <div className="sr__card-info">
        <h3 className="sr__card-title">{category.name}</h3>
        <p ref={descRef} className="sr__card-desc">{description}</p>
        {isClamped && available && <Link href={`/stays/${category.externalId}?${searchParams}`} className="sr__card-readmore">Läs mer</Link>}
        {category.highlights && category.highlights.length > 0 && (
          <div className="sr__card-highlights">
            {category.highlights.map((h, i) => (
              <div key={i} className="sr__card-highlight">
                <span className="material-symbols-rounded" style={{ fontSize: 20 }}>{h.icon}</span>
                {h.text}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="sr__card-action">
        {available ? (
          <>
            <div className="sr__card-pricing">
              <div className="sr__card-price">Från {formatPriceDisplay(lowestTotal)} kr</div>
              <div className="sr__card-price-detail">för {nights} nätter, {guests} gäster</div>
            </div>
            <button type="button" className="sr__card-btn" onClick={() => setExpanded(!expanded)}>
              Välj<span className="material-symbols-rounded sr__card-btn-chevron" style={{ fontSize: 18 }}>expand_more</span>
            </button>
          </>
        ) : (
          <div className="sr__card-unavailable">{restrictionViolations[0] ?? "Ej tillgängligt"}</div>
        )}
      </div>
      {available && (
        <div className={`sr__plans${expanded ? " sr__plans--open" : ""}`}>
          <div className="sr__plans-inner">
            {ratePlans.map((rp) => {
              const isThisBooking = bookingPlanId === rp.externalId && isCheckingOut;
              return (
                <div key={rp.externalId} className="sr__plan">
                  <div className="sr__plan-info">
                    <div className="sr__plan-name">{rp.name}</div>
                    {rp.cancellationDescription && (
                      <div className="sr__plan-desc">{rp.cancellationDescription}</div>
                    )}
                  </div>
                  <div className="sr__plan-action">
                    <div className="sr__plan-price">{formatPriceDisplay(rp.totalAmount)} kr</div>
                    <div className="sr__plan-price-detail">för {guests} gäster</div>
                  </div>
                  {accommodationId ? (
                    <button
                      type="button"
                      className={`sr__plan-btn sb${isCheckingOut ? " sr__plan-btn--busy" : ""}`}
                      disabled={isCheckingOut}
                      onClick={() => handleBook(rp)}
                    >
                      <span className={`sb__label${isThisBooking ? " sb__label--hidden" : ""}`}>Boka</span>
                      <span className={`sb__spinner${isThisBooking ? " sb__spinner--visible" : ""}`} />
                    </button>
                  ) : (
                    <Link
                      href={`/stays/${category.externalId}?${searchParams}&ratePlanId=${rp.externalId}`}
                      className="sr__plan-btn"
                    >
                      Visa
                    </Link>
                  )}
                </div>
              );
            })}
            {engine.checkoutError && bookingPlanId && ratePlans.some((rp) => rp.externalId === bookingPlanId) && (
              <div className="sr__plans-error">{engine.checkoutError.message}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────

type EmptyAccommodation = {
  id: string;
  displayName: string;
  displayDescription: string;
  maxGuests: number;
  media: Array<{ url: string; altText: string | null }>;
  highlights: Array<{ icon: string; text: string }>;
  slug: string;
};

function EmptyState({
  heading,
  description,
  tenantId,
}: {
  heading: string;
  description: string;
  tenantId: string;
}) {
  const [accommodations, setAccommodations] = useState<EmptyAccommodation[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!tenantId) { setLoaded(true); return; }
    fetch(`/api/accommodations?tenantId=${tenantId}&status=ACTIVE&visibleInSearch=true`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        setAccommodations((json.accommodations ?? []).slice(0, 10));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [tenantId]);

  return (
    <>
      <h1 className="sr__heading" dangerouslySetInnerHTML={{ __html: heading }} />
      <div className="sr__results-header" dangerouslySetInnerHTML={{ __html: description }} />
      {!loaded ? (
        <div className="sr__grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="sr__card sr__card--skeleton">
              <div className="sr__card-image"><div className="sr__sk-shimmer" /></div>
              <div className="sr__card-info">
                <div className="sr__sk-shimmer sr__sk-title" />
                <div className="sr__sk-shimmer sr__sk-desc" />
                <div className="sr__sk-shimmer sr__sk-desc sr__sk-desc--short" />
                <div className="sr__sk-meta">
                  <div className="sr__sk-shimmer sr__sk-meta-line" />
                </div>
              </div>
              <div className="sr__card-action">
                <div className="sr__sk-pricing">
                  <div className="sr__sk-shimmer sr__sk-price" />
                  <div className="sr__sk-shimmer sr__sk-price-detail" />
                </div>
                <div className="sr__sk-shimmer sr__sk-btn" />
              </div>
            </div>
          ))}
        </div>
      ) : accommodations.length > 0 ? (
        <div className="sr__grid">
          {accommodations.map((acc) => {
            const imageUrls = acc.media.map((m) => m.url);
            return (
              <div key={acc.id} className="sr__card">
                <CardImageCarousel images={imageUrls} alt={acc.displayName} />
                <div className="sr__card-info">
                  <h3 className="sr__card-title">{acc.displayName}</h3>
                  <p className="sr__card-desc" dangerouslySetInnerHTML={{ __html: acc.displayDescription }} />
                  {acc.highlights.length > 0 && (
                    <div className="sr__card-highlights">
                      {acc.highlights.map((h, i) => (
                        <div key={i} className="sr__card-highlight">
                          <span className="material-symbols-rounded" style={{ fontSize: 20 }}>{h.icon}</span>
                          {h.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="sr__card-action" style={{ justifyContent: "flex-end" }}>
                  <button type="button" className="sr__card-btn" onClick={() => {}}>Välj datum</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="sr__empty">
          <p className="sr__empty-text">Inga boenden har lagts till ännu.</p>
        </div>
      )}
    </>
  );
}

// ── Main Renderer ──────────────────────────────────────────────

export function SearchResultsDefaultRenderer(props: SectionRendererProps) {
  const { settings } = props;
  const searchParams = useSearchParams();
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emptyHeading = (settings.emptyHeading as string) || "Sök lediga boenden";
  const emptyDescription = (settings.emptyDescription as string) || "Välj datum och antal gäster för att se tillgänglighet.";
  const emptyIcon = (settings.emptyIcon as string) || "travel_explore";
  const noResultsHeading = (settings.noResultsHeading as string) || "Inga lediga boenden";
  const noResultsDescription = (settings.noResultsDescription as string) || "Prova andra datum eller färre gäster.";
  const noResultsIcon = (settings.noResultsIcon as string) || "hotel";

  const checkIn = searchParams.get("checkIn") ?? "";
  const checkOut = searchParams.get("checkOut") ?? "";
  const guests = parseInt(searchParams.get("guests") ?? "2", 10);
  const categories = searchParams.get("categories") ?? "";
  const tenantId = props.config?.tenantId ?? "";
  const hasSearch = !!(checkIn && checkOut && guests > 0 && tenantId);

  useEffect(() => {
    if (!hasSearch) { setLoaded(true); return; }
    const params = new URLSearchParams();
    params.set("tenantId", tenantId);
    params.set("checkIn", checkIn);
    params.set("checkOut", checkOut);
    params.set("guests", String(guests));
    if (categories) params.set("categories", categories);

    fetch(`/api/availability?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Fetch failed");
        setData(await res.json());
        setLoaded(true);
      })
      .catch(() => { setError("Kunde inte hämta tillgänglighet."); setLoaded(true); });
  }, [checkIn, checkOut, guests, categories, tenantId, hasSearch]);

  const searchParamsStr = hasSearch ? `checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}` : "";
  const sectionStyle = buildSectionStyle(settings);

  return (
    <section className="sr" style={sectionStyle}>
      <CommerceEngineProvider tenantId={tenantId}>
        {!hasSearch ? (
          <EmptyState
            heading={emptyHeading}
            description={emptyDescription}
            tenantId={tenantId}
          />
        ) : !loaded ? (
          <>
            <div className="sr__sk-shimmer sr__sk-heading" />
            <div className="sr__sk-shimmer sr__sk-subheading" />
            <div className="sr__grid">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="sr__card sr__card--skeleton">
                  <div className="sr__card-image"><div className="sr__sk-shimmer" /></div>
                  <div className="sr__card-info">
                    <div className="sr__sk-shimmer sr__sk-title" />
                    <div className="sr__sk-shimmer sr__sk-desc" />
                    <div className="sr__sk-shimmer sr__sk-desc sr__sk-desc--short" />
                    <div className="sr__sk-meta">
                      <div className="sr__sk-shimmer sr__sk-meta-line" />
                    </div>
                  </div>
                  <div className="sr__card-action">
                    <div className="sr__sk-pricing">
                      <div className="sr__sk-shimmer sr__sk-price" />
                      <div className="sr__sk-shimmer sr__sk-price-detail" />
                    </div>
                    <div className="sr__sk-shimmer sr__sk-btn" />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : error ? (
          <div className="sr__empty">
            <p className="sr__empty-text" style={{ color: "var(--error, #dc2626)" }}>{error}</p>
          </div>
        ) : data && data.results.length > 0 ? (
          <>
            <h1 className="sr__heading" dangerouslySetInnerHTML={{ __html: emptyHeading }} />
            <div className="sr__results-header">
              {formatDateRange(new Date(data.searchParams.checkIn), new Date(data.searchParams.checkOut))} ·{" "}
              {data.searchParams.nights} nätter · {data.searchParams.guests} gäster
            </div>
            <div className="sr__grid">
              {data.results.map((entry) => (
                <RoomCard key={entry.category.externalId} entry={entry} searchParams={searchParamsStr} nights={data.searchParams.nights} guests={data.searchParams.guests} checkIn={checkIn} checkOut={checkOut} />
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            heading={noResultsHeading}
            description={noResultsDescription}
            tenantId={tenantId}
          />
        )}
      </CommerceEngineProvider>
    </section>
  );
}
