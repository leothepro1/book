"use client";

import { useState, useMemo, useEffect, useCallback, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { formatDateRange } from "@/app/_lib/search/dates";
import { track } from "@/app/_lib/analytics/client";
import "./room-detail.css";

// ── Types ──────────────────────────────────────────────────────

interface Category {
  externalId: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  type: string;
  imageUrls: string[];
  maxGuests: number;
  facilities: string[];
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
  includedAddons: Array<{ addonId: string; name: string; quantity: number }>;
}

interface Addon {
  externalId: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  pricingMode: string;
}

interface SearchParams {
  tenantId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
}

interface RoomDetailClientProps {
  accommodationId: string | null;
  category: Category | null;
  ratePlans: RatePlan[];
  addons: Addon[];
  searchParams: SearchParams;
  available: boolean;
  error?: string;
}

// ── Lightbox ──────────────────────────────────────────────────

function Lightbox({
  images,
  initialIndex,
  onClose,
}: {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  const prev = useCallback(() => setIdx((i) => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setIdx((i) => (i + 1) % images.length), [images.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [close, prev, next]);

  return (
    <div className={`rd-lb${closing ? " rd-lb--closing" : ""}`} onClick={close}>
      <div className="rd-lb__content" onClick={(e: MouseEvent) => e.stopPropagation()}>
        <button className="rd-lb__close" onClick={close} aria-label="Stäng">
          <span className="material-symbols-rounded">close</span>
        </button>

        {images.length > 1 && (
          <button className="rd-lb__arrow rd-lb__arrow--prev" onClick={prev} aria-label="Föregående">
            <span className="material-symbols-rounded">chevron_left</span>
          </button>
        )}

        <img src={images[idx]} alt="" className="rd-lb__img" />

        {images.length > 1 && (
          <button className="rd-lb__arrow rd-lb__arrow--next" onClick={next} aria-label="Nästa">
            <span className="material-symbols-rounded">chevron_right</span>
          </button>
        )}

        {images.length > 1 && (
          <div className="rd-lb__counter">{idx + 1} / {images.length}</div>
        )}
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────

export function RoomDetailClient({
  accommodationId,
  category,
  ratePlans,
  addons,
  searchParams,
  available,
  error,
}: RoomDetailClientProps) {
  const router = useRouter();
  const [selectedRatePlan, setSelectedRatePlan] = useState<string | null>(
    ratePlans[0]?.externalId ?? null,
  );
  const [selectedAddons, setSelectedAddons] = useState<Map<string, number>>(new Map());
  const [activeImage, setActiveImage] = useState(0);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [isBooking, setIsBooking] = useState(false);

  const currentRatePlan = ratePlans.find((rp) => rp.externalId === selectedRatePlan);

  const addonTotal = useMemo(() => {
    let total = 0;
    for (const [addonId, qty] of selectedAddons) {
      const addon = addons.find((a) => a.externalId === addonId);
      if (!addon || qty <= 0) continue;
      switch (addon.pricingMode) {
        case "PER_STAY": total += addon.price; break;
        case "PER_NIGHT": total += addon.price * searchParams.nights; break;
        case "PER_PERSON": total += addon.price * searchParams.guests; break;
        case "PER_PERSON_PER_NIGHT": total += addon.price * searchParams.guests * searchParams.nights; break;
      }
    }
    return total;
  }, [selectedAddons, addons, searchParams]);

  const totalAmount = (currentRatePlan?.totalPrice ?? 0) + addonTotal;

  // ── Analytics: ACCOMMODATION_VIEWED on mount ──
  useEffect(() => {
    if (!category) return;
    track({
      tenantId: searchParams.tenantId,
      eventType: "ACCOMMODATION_VIEWED",
      payload: {
        accommodationName: category.name,
        categoryExternalId: category.externalId,
      },
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Analytics: track rate plan + addon changes ──
  const handleRatePlanSelect = useCallback((rp: typeof ratePlans[number]) => {
    setSelectedRatePlan(rp.externalId);
    track({
      tenantId: searchParams.tenantId,
      eventType: "RATE_PLAN_SELECTED",
      payload: {
        ratePlanId: rp.externalId,
        ratePlanName: rp.name,
        pricePerNight: rp.pricePerNight,
        totalPrice: rp.totalPrice,
        nights: searchParams.nights,
      },
    });
  }, [searchParams.tenantId, searchParams.nights]);

  // Error state — PMS unavailable (all hooks declared above)
  if (error || !category) {
    return (
      <div className="rd">
        <Link href={`/search?checkIn=${searchParams.checkIn}&checkOut=${searchParams.checkOut}&guests=${searchParams.guests}`} className="rd__back">
          <span className="material-symbols-rounded" style={{ fontSize: 18 }}>arrow_back</span>
          Tillbaka till sökresultat
        </Link>
        <div style={{ textAlign: "center", padding: "clamp(3rem, 8vw, 5rem) 1rem" }}>
          <span className="material-symbols-rounded" style={{ fontSize: 48, opacity: 0.15 }}>error</span>
          <p style={{ fontSize: "0.9375rem", color: "color-mix(in srgb, var(--text, #000) 55%, transparent)", marginTop: "1rem" }}>
            {error ?? "Boendet kunde inte laddas."}
          </p>
        </div>
      </div>
    );
  }

  const handleBook = async () => {
    if (!selectedRatePlan || !category || !accommodationId) return;
    setIsBooking(true);

    try {
      const res = await fetch("/api/portal/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accommodationId,
          ratePlanId: selectedRatePlan,
          checkIn: searchParams.checkIn,
          checkOut: searchParams.checkOut,
          adults: searchParams.guests,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setIsBooking(false);
        return;
      }

      // Redirect to addon page or checkout — server decides
      const url = data.redirect.includes("?")
        ? `${data.redirect}&session=${data.token}`
        : `${data.redirect}?session=${data.token}`;
      router.push(url);
    } catch {
      setIsBooking(false);
    }
  };

  const toggleAddon = (addonId: string) => {
    const wasSelected = selectedAddons.has(addonId) && selectedAddons.get(addonId)! > 0;
    const addon = addons.find((a) => a.externalId === addonId);

    setSelectedAddons((prev) => {
      const next = new Map(prev);
      if (wasSelected) {
        next.delete(addonId);
      } else {
        next.set(addonId, 1);
      }
      return next;
    });

    // Analytics
    track({
      tenantId: searchParams.tenantId,
      eventType: wasSelected ? "ADDON_REMOVED" : "ADDON_ADDED",
      payload: {
        addonId,
        addonName: addon?.name ?? null,
        price: addon?.price ?? 0,
      },
    });
  };

  return (
    <div className="rd">
      {/* Back link */}
      <Link
        href={`/search?checkIn=${searchParams.checkIn}&checkOut=${searchParams.checkOut}&guests=${searchParams.guests}`}
        className="rd__back"
      >
        <span className="material-symbols-rounded" style={{ fontSize: 18 }}>arrow_back</span>
        Tillbaka till sökresultat
      </Link>

      <div className="rd__layout">
        {/* Left column */}
        <div className="rd__main">
          {/* Image gallery */}
          {category.imageUrls.length > 0 && (
            <div className="rd__gallery">
              <div className="rd__gallery-main" onClick={() => setLightboxIdx(activeImage)} role="button" tabIndex={0}>
                <img src={category.imageUrls[activeImage]} alt={category.name} />
              </div>
              {category.imageUrls.length > 1 && (
                <div className="rd__gallery-thumbs">
                  {category.imageUrls.map((url, i) => (
                    <button
                      key={i}
                      className={`rd__gallery-thumb${i === activeImage ? " rd__gallery-thumb--active" : ""}`}
                      onClick={() => setActiveImage(i)}
                    >
                      <img src={url} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {lightboxIdx !== null && (
            <Lightbox
              images={category.imageUrls}
              initialIndex={lightboxIdx}
              onClose={() => setLightboxIdx(null)}
            />
          )}

          <h1 className="rd__title">{category.name}</h1>
          <p className="rd__description">{category.longDescription || category.shortDescription}</p>

          {/* Facilities */}
          {category.facilities.length > 0 && (
            <div className="rd__facilities">
              <h3 className="rd__section-title">Bekvämligheter</h3>
              <div className="rd__facility-list">
                {category.facilities.map((f) => (
                  <span key={f} className="rd__facility">{f}</span>
                ))}
              </div>
            </div>
          )}

          <div className="rd__meta">
            <span className="material-symbols-rounded" style={{ fontSize: 18 }}>person</span>
            Upp till {category.maxGuests} gäster
          </div>

          {/* Rate plans */}
          {ratePlans.length > 0 && (
            <div className="rd__rate-plans">
              <h3 className="rd__section-title">Välj prisalternativ</h3>
              {ratePlans.map((rp) => (
                <button
                  key={rp.externalId}
                  className={`rd__rate-plan${selectedRatePlan === rp.externalId ? " rd__rate-plan--selected" : ""}`}
                  onClick={() => handleRatePlanSelect(rp)}
                >
                  <div className="rd__rate-plan-info">
                    <div className="rd__rate-plan-name">{rp.name}</div>
                    <div className="rd__rate-plan-cancel">{rp.cancellationDescription}</div>
                    {rp.includedAddons.length > 0 && (
                      <div className="rd__rate-plan-includes">
                        Inkluderar: {rp.includedAddons.map((a) => a.name).join(", ")}
                      </div>
                    )}
                  </div>
                  <div className="rd__rate-plan-price">
                    <div className="rd__rate-plan-nightly">
                      {formatPriceDisplay(rp.pricePerNight)} kr/natt
                    </div>
                    <div className="rd__rate-plan-total">
                      Totalt {formatPriceDisplay(rp.totalPrice)} kr
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Add-ons */}
          {addons.length > 0 && (
            <div className="rd__addons">
              <h3 className="rd__section-title">Tillägg</h3>
              {addons.map((addon) => {
                const isSelected = (selectedAddons.get(addon.externalId) ?? 0) > 0;
                return (
                  <button
                    key={addon.externalId}
                    className={`rd__addon${isSelected ? " rd__addon--selected" : ""}`}
                    onClick={() => toggleAddon(addon.externalId)}
                  >
                    <div className="rd__addon-info">
                      <div className="rd__addon-name">{addon.name}</div>
                      <div className="rd__addon-desc">{addon.description}</div>
                    </div>
                    <div className="rd__addon-price">
                      {formatPriceDisplay(addon.price)} kr
                      <span className="rd__addon-mode">
                        {addon.pricingMode === "PER_NIGHT" ? "/natt" :
                         addon.pricingMode === "PER_STAY" ? "/vistelse" :
                         addon.pricingMode === "PER_PERSON" ? "/person" :
                         addon.pricingMode === "PER_PERSON_PER_NIGHT" ? "/person/natt" : ""}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Sticky booking summary */}
        <div className="rd__sidebar">
          <div className="rd__summary">
            {currentRatePlan && (
              <>
                <div className="rd__summary-rate">{currentRatePlan.name}</div>
                <div className="rd__summary-nightly">
                  {formatPriceDisplay(currentRatePlan.pricePerNight)} kr/natt
                </div>
              </>
            )}
            <div className="rd__summary-dates">
              {formatDateRange(new Date(searchParams.checkIn), new Date(searchParams.checkOut))} · {searchParams.nights} nätter · {searchParams.guests} gäster
            </div>
            <div className="rd__summary-divider" />
            {addonTotal > 0 && (
              <div className="rd__summary-row">
                <span>Tillägg</span>
                <span>{formatPriceDisplay(addonTotal)} kr</span>
              </div>
            )}
            <div className="rd__summary-total">
              <span>Totalt</span>
              <span>{formatPriceDisplay(totalAmount)} kr</span>
            </div>
            <button
              className="rd__book-btn"
              onClick={handleBook}
              disabled={!available || !selectedRatePlan || isBooking}
            >
              {isBooking ? "Skapar bokning..." : available ? "Välj detta alternativ" : "Ej tillgängligt"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
