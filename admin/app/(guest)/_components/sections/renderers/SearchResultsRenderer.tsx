"use client";

/**
 * Search Results Renderer
 * ───────────────────────
 * Locked section renderer for the stays/search page.
 * Renders compact search form + availability results.
 * Data fetched client-side from /api/availability.
 */

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { formatDateRange } from "@/app/_lib/search/dates";
import type { SearchResult, SearchResultRatePlan, AvailabilityResponse } from "@/app/_lib/search/types";
import { CommerceEngineProvider } from "@/app/_lib/commerce/CommerceEngineContext";
import { useCommerceEngineContext } from "@/app/_lib/commerce/CommerceEngineContext";
import "./search-results-renderer.css";
import "@/app/(guest)/_components/spinner-button.css";

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
  const image = category.imageUrls[0];
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
      <div className="sr__card-image">
        {image ? <img src={image} alt={category.name} /> : <div className="sr__card-placeholder" />}
      </div>
      <div className="sr__card-info">
        <h3 className="sr__card-title">{category.name}</h3>
        <p ref={descRef} className="sr__card-desc">{description}</p>
        {isClamped && available && <Link href={`/stays/${category.externalId}?${searchParams}`} className="sr__card-readmore">Läs mer</Link>}
        <div className="sr__card-meta">
          <span className="material-symbols-rounded" style={{ fontSize: 16 }}>person</span>
          Upp till {category.maxGuests} gäster
        </div>
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

// ── Main Renderer ──────────────────────────────────────────────

export function SearchResultsDefaultRenderer(props: SectionRendererProps) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="sr">
      <CommerceEngineProvider tenantId={tenantId}>
        {!hasSearch ? (
          <div className="sr__empty">
            <span className="material-symbols-rounded" style={{ fontSize: 48, opacity: 0.15 }}>travel_explore</span>
            <h2 className="sr__empty-title">Sök lediga boenden</h2>
            <p className="sr__empty-text">Välj datum och antal gäster för att se tillgänglighet.</p>
          </div>
        ) : !loaded ? (
          <div className="sr__grid">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="sr__card sr__card--skeleton">
                <div className="sr__card-image sr__skeleton-pulse" />
                <div className="sr__card-info"><div className="sr__skeleton-line" /><div className="sr__skeleton-line sr__skeleton-line--lg" /></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="sr__empty">
            <p className="sr__empty-text" style={{ color: "var(--error, #dc2626)" }}>{error}</p>
          </div>
        ) : data && data.results.length > 0 ? (
          <>
            <h1 className="sr__heading">Lediga boenden</h1>
            <div className="sr__results-header">
              {data.results.length} boende{data.results.length !== 1 ? "n" : ""} ·{" "}
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
          <div className="sr__empty">
            <span className="material-symbols-rounded" style={{ fontSize: 48, opacity: 0.15 }}>hotel</span>
            <h2 className="sr__empty-title">Inga lediga boenden</h2>
            <p className="sr__empty-text">Prova andra datum eller färre gäster.</p>
          </div>
        )}
      </CommerceEngineProvider>
    </section>
  );
}
