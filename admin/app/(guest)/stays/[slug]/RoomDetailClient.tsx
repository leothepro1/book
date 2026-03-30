"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { formatDateRange } from "@/app/_lib/search/dates";
import { saveBookingSelection } from "@/app/(guest)/_lib/booking/booking-selection";
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
  category: Category | null;
  ratePlans: RatePlan[];
  addons: Addon[];
  searchParams: SearchParams;
  available: boolean;
  error?: string;
}

// ── Component ──────────────────────────────────────────────────

export function RoomDetailClient({
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

  const handleBook = () => {
    if (!selectedRatePlan || !category) return;
    const rpName = ratePlans.find((rp) => rp.externalId === selectedRatePlan)?.name ?? "";
    const addonEntries = Array.from(selectedAddons.entries())
      .filter(([, q]) => q > 0)
      .map(([id, qty]) => {
        const addon = addons.find((a) => a.externalId === id);
        return { addonId: id, quantity: qty, unitAmount: addon?.price ?? 0 };
      });

    // Save to sessionStorage for the booking form page
    saveBookingSelection({
      tenantId: searchParams.tenantId,
      categoryId: category.externalId,
      categoryName: category.name,
      ratePlanId: selectedRatePlan,
      ratePlanName: rpName,
      checkIn: searchParams.checkIn,
      checkOut: searchParams.checkOut,
      guests: searchParams.guests,
      nights: searchParams.nights,
      addons: addonEntries,
      totalAmount,
      currency: ratePlans[0]?.currency ?? "SEK",
      savedAt: new Date().toISOString(),
    });

    const params = new URLSearchParams();
    params.set("checkIn", searchParams.checkIn);
    params.set("checkOut", searchParams.checkOut);
    params.set("guests", String(searchParams.guests));
    params.set("ratePlanId", selectedRatePlan);
    router.push(`/stays/${category.externalId}/book?${params.toString()}`);
  };

  const toggleAddon = (addonId: string) => {
    setSelectedAddons((prev) => {
      const next = new Map(prev);
      if (next.has(addonId) && next.get(addonId)! > 0) {
        next.delete(addonId);
      } else {
        next.set(addonId, 1);
      }
      return next;
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
              <div className="rd__gallery-main">
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
                  onClick={() => setSelectedRatePlan(rp.externalId)}
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
              disabled={!available || !selectedRatePlan}
            >
              {available ? "Välj detta alternativ" : "Ej tillgängligt"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
