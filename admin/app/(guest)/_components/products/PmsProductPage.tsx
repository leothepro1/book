"use client";

/**
 * PMS Product Page
 * ════════════════
 *
 * Product page for PMS_ACCOMMODATION products.
 * Blends platform data (title override, media) with PMS data
 * (price, availability) fetched at render time.
 *
 * Two states:
 * A) No search params → shows search form
 * B) Search params → shows availability with rate plans
 *
 * Booking happens via /stays/ flow — this page links into it.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { formatDateRange } from "@/app/_lib/search/dates";
import { fetchAvailability } from "@/app/_lib/search/fetchAvailability";
import "./pms-product-page.css";

interface PmsProductProps {
  product: {
    id: string;
    displayTitle: string;
    displayDescription: string;
    pmsSourceId: string | null;
    pmsProvider: string | null;
    slug: string;
    media: Array<{ id: string; url: string; type: string; alt: string }>;
    pmsData: Record<string, unknown> | null;
  };
  tenantId: string;
  searchParams: {
    checkIn: string | null;
    checkOut: string | null;
    guests: number | null;
  };
}

interface RatePlan {
  externalId: string;
  name: string;
  description: string;
  cancellationPolicy: string;
  cancellationDescription: string;
  pricePerNight: number;
  totalPrice: number;
  currency: string;
}

interface AvailabilityData {
  available: boolean;
  ratePlans: RatePlan[];
  nights: number;
}

export function AccommodationDetailPage({ product, tenantId, searchParams }: PmsProductProps) {
  const router = useRouter();
  const [activeImage, setActiveImage] = useState(0);
  const [availability, setAvailability] = useState<AvailabilityData | null>(null);
  const [fetched, setFetched] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedRatePlan, setSelectedRatePlan] = useState<string | null>(null);

  const hasSearch = !!(searchParams.checkIn && searchParams.checkOut && searchParams.guests);
  const loading = hasSearch && !fetched;
  const images = product.media.filter((m) => m.type === "image");
  const facilities = (product.pmsData?.facilities as string[]) ?? [];

  // Fetch availability when search params present
  useEffect(() => {
    if (!hasSearch || !product.pmsSourceId) return;
    let cancelled = false;

    fetchAvailability(tenantId, {
      checkIn: searchParams.checkIn!,
      checkOut: searchParams.checkOut!,
      adults: searchParams.guests!,
      children: 0,
      categoryIds: [],
    }).then((result) => {
      if (cancelled) return;
      if (result.error && result.results.length === 0) {
        setFetchError(
          result.error.code === "TIMEOUT" ? "Sökningen tog för lång tid. Försök igen."
          : result.error.code === "PMS_ERROR" ? "Kunde inte hämta tillgänglighet just nu."
          : "Kunde inte hämta tillgänglighet. Försök igen om en stund."
        );
        setFetched(true);
        return;
      }
      const entry = result.results.find(
        (r) => r.category.externalId === product.pmsSourceId,
      );
      const nights = searchParams.checkIn && searchParams.checkOut
        ? Math.round((new Date(searchParams.checkOut).getTime() - new Date(searchParams.checkIn).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      setAvailability({
        available: entry?.available ?? false,
        ratePlans: (entry?.ratePlans ?? []).map((rp) => ({
          externalId: rp.externalId,
          name: rp.name,
          description: rp.description ?? "",
          cancellationPolicy: rp.cancellationPolicy ?? "",
          cancellationDescription: rp.cancellationDescription ?? "",
          pricePerNight: rp.nightlyAmount,
          totalPrice: rp.totalAmount,
          currency: rp.currency,
        })),
        nights,
      });
      if (entry?.ratePlans?.[0]) {
        setSelectedRatePlan(entry.ratePlans[0].externalId);
      }
      setFetched(true);
    });

    return () => { cancelled = true; };
  }, [hasSearch, product.pmsSourceId, searchParams.checkIn, searchParams.checkOut, searchParams.guests, tenantId]);

  const currentRatePlan = availability?.ratePlans.find((rp) => rp.externalId === selectedRatePlan);

  const handleBook = () => {
    if (!product.pmsSourceId || !selectedRatePlan) return;
    const params = new URLSearchParams();
    params.set("checkIn", searchParams.checkIn!);
    params.set("checkOut", searchParams.checkOut!);
    params.set("guests", String(searchParams.guests));
    params.set("ratePlanId", selectedRatePlan);
    router.push(`/stays/${product.pmsSourceId}/book?${params.toString()}`);
  };

  return (
    <div className="pmsp">
      {/* Media gallery */}
      {images.length > 0 && (
        <div className="pmsp__gallery">
          <div className="pmsp__gallery-main">
            <img src={images[activeImage]?.url} alt={images[activeImage]?.alt || product.displayTitle} />
          </div>
          {images.length > 1 && (
            <div className="pmsp__gallery-thumbs">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  className={`pmsp__gallery-thumb${i === activeImage ? " pmsp__gallery-thumb--active" : ""}`}
                  onClick={() => setActiveImage(i)}
                >
                  <img src={img.url} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="pmsp__layout">
        <div className="pmsp__main">
          <h1 className="pmsp__title">{product.displayTitle}</h1>
          {product.displayDescription && (
            <div className="pmsp__description" dangerouslySetInnerHTML={{ __html: product.displayDescription }} />
          )}

          {facilities.length > 0 && (
            <div className="pmsp__facilities">
              {facilities.map((f) => (
                <span key={f} className="pmsp__facility">{f}</span>
              ))}
            </div>
          )}

          {/* STATE A: No search params */}
          {!hasSearch && (
            <div className="pmsp__search-prompt">
              <h3 className="pmsp__search-title">Kontrollera tillgänglighet</h3>
              <form
                className="pmsp__search-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const params = new URLSearchParams();
                  params.set("checkIn", fd.get("checkIn") as string);
                  params.set("checkOut", fd.get("checkOut") as string);
                  params.set("guests", fd.get("guests") as string);
                  router.push(`/shop/products/${product.slug}?${params.toString()}`);
                }}
              >
                <div className="pmsp__search-fields">
                  <div className="pmsp__search-field">
                    <label className="pmsp__search-label">Incheckning</label>
                    <input type="date" name="checkIn" required min={new Date().toISOString().split("T")[0]} className="pmsp__search-input" />
                  </div>
                  <div className="pmsp__search-field">
                    <label className="pmsp__search-label">Utcheckning</label>
                    <input type="date" name="checkOut" required min={new Date().toISOString().split("T")[0]} className="pmsp__search-input" />
                  </div>
                  <div className="pmsp__search-field" style={{ maxWidth: 100 }}>
                    <label className="pmsp__search-label">Gäster</label>
                    <input type="number" name="guests" defaultValue={2} min={1} max={99} required className="pmsp__search-input" />
                  </div>
                </div>
                <button type="submit" className="pmsp__search-btn">Sök tillgänglighet</button>
              </form>
              <p className="pmsp__search-hint">Välj datum för att se priser och tillgänglighet.</p>
            </div>
          )}

          {/* STATE B: Has search params */}
          {hasSearch && loading && (
            <div className="pmsp__loading">
              <span className="material-symbols-rounded" style={{ fontSize: 20, animation: "spin 1s linear infinite" }}>progress_activity</span>
              Hämtar tillgänglighet...
            </div>
          )}

          {hasSearch && !loading && fetchError && (
            <div className="pmsp__unavailable">
              <span className="material-symbols-rounded" style={{ fontSize: 24, opacity: 0.3 }}>error</span>
              <p>{fetchError}</p>
            </div>
          )}

          {hasSearch && !loading && !fetchError && availability && !availability.available && (
            <div className="pmsp__unavailable">
              <span className="material-symbols-rounded" style={{ fontSize: 24, opacity: 0.3 }}>event_busy</span>
              <p>Inte tillgängligt för {formatDateRange(new Date(searchParams.checkIn!), new Date(searchParams.checkOut!))}.</p>
              <Link href={`/search?checkIn=${searchParams.checkIn}&checkOut=${searchParams.checkOut}&guests=${searchParams.guests}`} className="pmsp__link">
                Sök andra boenden →
              </Link>
            </div>
          )}

          {hasSearch && !loading && availability && availability.available && (
            <div className="pmsp__rate-plans">
              <h3 className="pmsp__section-title">Välj prisalternativ</h3>
              {availability.ratePlans.map((rp) => (
                <button
                  key={rp.externalId}
                  className={`pmsp__rate-plan${selectedRatePlan === rp.externalId ? " pmsp__rate-plan--selected" : ""}`}
                  onClick={() => setSelectedRatePlan(rp.externalId)}
                >
                  <div>
                    <div className="pmsp__rate-plan-name">{rp.name}</div>
                    <div className="pmsp__rate-plan-cancel">{rp.cancellationDescription}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="pmsp__rate-plan-price">{formatPriceDisplay(rp.pricePerNight)} kr/natt</div>
                    <div className="pmsp__rate-plan-total">Totalt {formatPriceDisplay(rp.totalPrice)} kr</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sticky sidebar — only with search results */}
        {hasSearch && !loading && availability?.available && currentRatePlan && (
          <div className="pmsp__sidebar">
            <div className="pmsp__summary">
              <div className="pmsp__summary-rate">{currentRatePlan.name}</div>
              <div className="pmsp__summary-price">{formatPriceDisplay(currentRatePlan.pricePerNight)} kr/natt</div>
              <div className="pmsp__summary-dates">
                {formatDateRange(new Date(searchParams.checkIn!), new Date(searchParams.checkOut!))} · {availability.nights} nätter · {searchParams.guests} gäster
              </div>
              <div className="pmsp__summary-divider" />
              <div className="pmsp__summary-total">
                <span>Totalt</span>
                <span>{formatPriceDisplay(currentRatePlan.totalPrice)} kr</span>
              </div>
              <button className="pmsp__book-btn" onClick={handleBook}>
                Välj detta alternativ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
