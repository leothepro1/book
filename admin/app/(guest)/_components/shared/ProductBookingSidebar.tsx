"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { parseISO, startOfMonth, format } from "date-fns";
import { sv } from "date-fns/locale";
import { DateRangePicker, getNightCount } from "./DateRangePicker";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { useProduct } from "@/app/(guest)/_lib/product-context/ProductContext";
import { useCommerceEngineContext } from "@/app/_lib/commerce/CommerceEngineContext";
import "./product-booking-sidebar.css";

function CounterControl({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  const canDec = value > min;
  const canInc = value < max;
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => canDec && onChange(value - 1)} disabled={!canDec}
        className={`flex size-8 items-center justify-center rounded-full border-0 bg-[#F2F2F2] transition-colors duration-150 ${canDec ? "cursor-pointer text-[#202020] hover:bg-[#E5E5E5]" : "cursor-not-allowed text-[#9b9b9b] opacity-40"}`}
        aria-label="Minska">
        <span className="material-symbols-rounded select-none leading-none" style={{ fontSize: 20, fontVariationSettings: "'FILL' 0, 'wght' 400" }}>remove</span>
      </button>
      <span className="min-w-[24px] text-center text-base font-medium text-[#202020]">{value}</span>
      <button type="button" onClick={() => canInc && onChange(value + 1)} disabled={!canInc}
        className={`flex size-8 items-center justify-center rounded-full border-0 bg-[#F2F2F2] transition-colors duration-150 ${canInc ? "cursor-pointer text-[#202020] hover:bg-[#E5E5E5]" : "cursor-not-allowed text-[#9b9b9b] opacity-40"}`}
        aria-label="Öka">
        <span className="material-symbols-rounded select-none leading-none" style={{ fontSize: 20, fontVariationSettings: "'FILL' 0, 'wght' 400" }}>add</span>
      </button>
    </div>
  );
}

export function ProductBookingSidebar() {
  const product = useProduct();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [checkIn, setCheckIn] = useState<Date | null>(() => {
    const v = searchParams.get("checkIn");
    return v ? parseISO(v) : null;
  });
  const [checkOut, setCheckOut] = useState<Date | null>(() => {
    const v = searchParams.get("checkOut");
    return v ? parseISO(v) : null;
  });
  const [adults, setAdults] = useState(() => {
    const v = searchParams.get("guests");
    return v ? parseInt(v, 10) : 2;
  });
  const [children_, setChildren] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalClosing, setModalClosing] = useState(false);
  const [guestDropdownOpen, setGuestDropdownOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(checkIn ?? new Date()));
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const guestRef = useRef<HTMLDivElement>(null);

  const nights = getNightCount(checkIn, checkOut);
  const totalGuests = adults + children_;

  const ratePlans = product?.ratePlans ?? [];
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
    () => ratePlans[0]?.externalId ?? null,
  );
  const selectedPlan = ratePlans.find((rp) => rp.externalId === selectedPlanId) ?? ratePlans[0] ?? null;

  // ── Commerce Engine — shared via context, live PMS pricing ──
  const {
    selectAccommodation,
    pricing: enginePricing,
    pricingStatus,
    pricingError,
    initiateCheckout,
    checkoutStatus,
    checkoutError,
    reset: resetEngine,
  } = useCommerceEngineContext();

  // Derive displayed price: engine (fresh PMS) → server props (initial load)
  const displayPricePerNight = enginePricing?.pricePerNight ?? selectedPlan?.pricePerNight ?? 0;
  const displayTotal = enginePricing?.baseTotal ?? selectedPlan?.totalPrice ?? 0;
  const displayRatePlanName = enginePricing?.ratePlanName ?? selectedPlan?.name ?? "";
  const displayNights = enginePricing?.nights ?? nights ?? 0;
  const displayCurrency = enginePricing?.currency ?? selectedPlan?.currency ?? "SEK";
  const price = displayTotal > 0 ? displayTotal : (product?.price ?? 0);

  const prevGuestsRef = useRef(totalGuests);

  // Sync guest count changes to URL + refresh server data
  useEffect(() => {
    if (totalGuests === prevGuestsRef.current) return;
    prevGuestsRef.current = totalGuests;
    const params = new URLSearchParams(window.location.search);
    params.set("guests", String(totalGuests));
    if (checkIn) params.set("checkIn", format(checkIn, "yyyy-MM-dd"));
    if (checkOut) params.set("checkOut", format(checkOut, "yyyy-MM-dd"));
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
    router.refresh();
  }, [totalGuests, checkIn, checkOut, pathname, router]);

  // Close guest dropdown on outside click
  useEffect(() => {
    if (!guestDropdownOpen) return;
    const handle = (e: MouseEvent) => {
      if (guestRef.current && !guestRef.current.contains(e.target as Node)) setGuestDropdownOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [guestDropdownOpen]);

  useEffect(() => {
    if (!guestDropdownOpen) return;
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") setGuestDropdownOpen(false); };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [guestDropdownOpen]);

  const handleRangeChange = useCallback((ci: Date | null, co: Date | null) => {
    setCheckIn(ci);
    setCheckOut(co);
  }, []);

  const handleClear = () => { setCheckIn(null); setCheckOut(null); setHoverDate(null); };

  const openModal = () => {
    setModalOpen(true);
    setModalClosing(false);
    setGuestDropdownOpen(false);
  };

  const closeModal = () => {
    setModalClosing(true);
    setTimeout(() => {
      setModalOpen(false);
      setModalClosing(false);
    }, 200);
  };

  // Escape closes modal
  useEffect(() => {
    if (!modalOpen) return;
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") closeModal(); };
    document.addEventListener("keydown", handle);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handle);
      document.body.style.overflow = "";
    };
  }, [modalOpen]);

  const handleSave = () => {
    if (!checkIn || !checkOut) return;
    closeModal();
    // Update URL without navigation, then refresh server data
    const params = new URLSearchParams(window.location.search);
    params.set("checkIn", format(checkIn, "yyyy-MM-dd"));
    params.set("checkOut", format(checkOut, "yyyy-MM-dd"));
    params.set("guests", String(totalGuests));
    const newUrl = `${pathname}?${params.toString()}`;
    window.history.replaceState(null, "", newUrl);
    resetEngine();
    router.refresh();
  };

  const fmtDate = (d: Date | null, ph: string) => d ? format(d, "d MMM yyyy", { locale: sv }) : ph;

  const isBooking = checkoutStatus === "loading";

  const handleBook = async () => {
    if (!checkIn || !checkOut) { openModal(); return; }
    if (!selectedPlan || !product?.id) return;

    // Ensure engine selection is current before checkout
    selectAccommodation({
      accommodationId: product.id,
      ratePlanId: selectedPlan.externalId,
      checkIn: format(checkIn, "yyyy-MM-dd"),
      checkOut: format(checkOut, "yyyy-MM-dd"),
      adults,
      children: children_,
    });

    const result = await initiateCheckout();
    if (!result) return;

    const url = result.redirect.includes("?")
      ? `${result.redirect}&session=${result.token}`
      : `${result.redirect}?session=${result.token}`;
    router.push(url);
  };

  const guestText = children_ === 0 ? `${adults} gäster` : `${adults} vuxna, ${children_} barn`;

  return (
    <div className="pbs">
      {/* Price */}
      <div className="pbs__price">
        {pricingStatus === "loading" ? (
          <span className="pbs__price-loading">Hämtar pris…</span>
        ) : displayPricePerNight > 0 ? (
          <>
            {formatPriceDisplay(displayPricePerNight)} kr
            <span className="pbs__price-suffix"> / natt</span>
          </>
        ) : (
          price > 0 ? `${formatPriceDisplay(price)} kr` : "—"
        )}
      </div>
      {pricingError && (
        <div className="pbs__price-error">{pricingError.message}</div>
      )}

      {/* Triggers + guest dropdown wrapper */}
      <div className="pbs__triggers-wrap" ref={guestRef}>
        <div className={`pbs__triggers${guestDropdownOpen ? " pbs__triggers--guest-open" : ""}`}>
          {/* Row 1: Check-in | Check-out */}
          <div className="pbs__trigger-row" onClick={openModal}>
            <div className="pbs__trigger">
              <span className="pbs__trigger-label">Incheckning</span>
              <span className={`pbs__trigger-value${!checkIn ? " pbs__trigger-value--placeholder" : ""}`}>
                {fmtDate(checkIn, "Välj datum")}
              </span>
            </div>
            <div className="pbs__trigger-divider-v" />
            <div className="pbs__trigger">
              <span className="pbs__trigger-label">Utcheckning</span>
              <span className={`pbs__trigger-value${!checkOut ? " pbs__trigger-value--placeholder" : ""}`}>
                {fmtDate(checkOut, "Välj datum")}
              </span>
            </div>
          </div>

          <div className="pbs__trigger-divider-h" />

          {/* Row 2: Guests */}
          <div className="pbs__trigger-row" onClick={() => { setGuestDropdownOpen(!guestDropdownOpen); }}>
            <div className="pbs__trigger pbs__trigger--full">
              <span className="pbs__trigger-label">Gäster</span>
              <span className="pbs__trigger-value">{guestText}</span>
            </div>
            <span className="material-symbols-rounded pbs__chevron" style={{ fontSize: 20 }}>expand_more</span>
          </div>
        </div>

        {/* Guest dropdown */}
        {guestDropdownOpen && (
          <div className="pbs__guest-dropdown">
            <div className="flex items-center justify-between gap-8 py-[14px]">
              <div>
                <p className="pb-[3px] font-medium text-[#202020]" style={{ fontSize: 16 }}>Vuxna</p>
                <p style={{ fontSize: 14, color: "#6a6a6a" }}>13 år och äldre</p>
              </div>
              <CounterControl value={adults} min={1} max={10} onChange={setAdults} />
            </div>
            <div className="border-t border-slate-200" />
            <div className="flex items-center justify-between gap-8 py-[14px]">
              <div>
                <p className="pb-[3px] font-medium text-[#202020]" style={{ fontSize: 16 }}>Barn</p>
                <p style={{ fontSize: 14, color: "#6a6a6a" }}>0–12 år</p>
              </div>
              <CounterControl value={children_} min={0} max={10} onChange={setChildren} />
            </div>
          </div>
        )}
      </div>

      {/* Rate plans */}
      {ratePlans.length > 0 && (
        <div className="pbs__plans">
          {ratePlans.map((rp) => {
            const isSelected = rp.externalId === selectedPlanId;
            return (
              <button
                key={rp.externalId}
                type="button"
                className={`pbs__plan${isSelected ? " pbs__plan--selected" : ""}`}
                onClick={() => {
                  setSelectedPlanId(rp.externalId);
                  if (product?.id && checkIn && checkOut) {
                    selectAccommodation({
                      accommodationId: product.id,
                      ratePlanId: rp.externalId,
                      checkIn: format(checkIn, "yyyy-MM-dd"),
                      checkOut: format(checkOut, "yyyy-MM-dd"),
                      adults,
                      children: children_,
                    });
                  }
                }}
              >
                <div className="pbs__plan-radio">
                  <span className="pbs__plan-radio-dot" />
                </div>
                <div className="pbs__plan-info">
                  <span className="pbs__plan-name">{rp.name}</span>
                  <span className="pbs__plan-desc">{rp.cancellationDescription}</span>
                  {rp.includedAddons.length > 0 && (
                    <span className="pbs__plan-includes">
                      Inkl: {rp.includedAddons.map((a) => a.name).join(", ")}
                    </span>
                  )}
                </div>
                <div className="pbs__plan-price">
                  <span className="pbs__plan-price-total">
                    {isSelected && enginePricing
                      ? `${formatPriceDisplay(enginePricing.baseTotal)} kr`
                      : `${formatPriceDisplay(rp.totalPrice)} kr`}
                  </span>
                  <span className="pbs__plan-price-nightly">
                    {isSelected && enginePricing
                      ? `${formatPriceDisplay(enginePricing.pricePerNight)} kr/natt`
                      : `${formatPriceDisplay(rp.pricePerNight)} kr/natt`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Date modal */}
      {modalOpen && (
        <div className={`pbs__modal-overlay${modalClosing ? " pbs__modal-overlay--closing" : ""}`} onClick={closeModal}>
          <div className="pbs__modal" onClick={(e) => e.stopPropagation()}>
            <div className="pbs__modal-header">
              <div className="pbs__modal-header-info">
                <div className="pbs__modal-nights">{nights != null ? `${nights} nätter` : "Välj datum"}</div>
                {checkIn && checkOut && (
                  <div className="pbs__modal-dates">
                    {format(checkIn, "d MMMM yyyy", { locale: sv })} – {format(checkOut, "d MMMM yyyy", { locale: sv })}
                  </div>
                )}
              </div>
              <button className="pbs__modal-close" onClick={closeModal} aria-label="Stäng">
                <span className="material-symbols-rounded" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>

            <div className="pbs__modal-calendar">
              <DateRangePicker
                checkIn={checkIn} checkOut={checkOut} onRangeChange={handleRangeChange}
                viewMonth={viewMonth} onViewMonthChange={setViewMonth}
                hoverDate={hoverDate} onHoverDateChange={setHoverDate}
              />
            </div>

            <div className="pbs__modal-footer">
              <button type="button" className="pbs__modal-btn pbs__modal-btn--ghost" onClick={handleClear}>Rensa datum</button>
              <button type="button" className="pbs__modal-btn pbs__modal-btn--solid" onClick={handleSave} disabled={!checkIn || !checkOut}>
                Spara
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Price breakdown */}
      {pricingStatus === "loading" && (
        <div className="pbs__breakdown">
          <div className="pbs__breakdown-line">
            <span className="pbs__breakdown-skeleton pbs__breakdown-skeleton--label" />
            <span className="pbs__breakdown-skeleton pbs__breakdown-skeleton--amount" />
          </div>
          <div className="pbs__breakdown-line">
            <span className="pbs__breakdown-skeleton pbs__breakdown-skeleton--label" />
            <span className="pbs__breakdown-skeleton pbs__breakdown-skeleton--amount" />
          </div>
        </div>
      )}
      {pricingStatus === "success" && enginePricing?.lineItems && enginePricing.lineItems.length > 0 && (() => {
        const accomLine = enginePricing.lineItems.find((li) => li.type === "accommodation");
        const includedItems = enginePricing.lineItems.filter((li) => li.isIncluded);
        return (
          <div className="pbs__breakdown">
            {accomLine && (
              <>
                <div className="pbs__breakdown-header">{accomLine.label}</div>
                <div className="pbs__breakdown-line">
                  <span className="pbs__breakdown-detail">
                    {accomLine.nights} nätter &times; {formatPriceDisplay(accomLine.perNight ?? 0, displayCurrency)} kr
                  </span>
                  <span className="pbs__breakdown-amount">
                    {formatPriceDisplay(accomLine.amount, displayCurrency)} kr
                  </span>
                </div>
              </>
            )}
            {includedItems.length > 0 && (
              <>
                <div className="pbs__breakdown-divider" />
                <div className="pbs__breakdown-included-label">Inkluderat:</div>
                {includedItems.map((item) => (
                  <div key={item.label} className="pbs__breakdown-included-item">
                    <span className="pbs__breakdown-check">&#10003;</span> {item.label}
                  </div>
                ))}
              </>
            )}
            <div className="pbs__breakdown-divider" />
            <div className="pbs__breakdown-line pbs__breakdown-line--total">
              <span>Totalt</span>
              <span className="pbs__breakdown-amount pbs__breakdown-amount--total">
                {formatPriceDisplay(enginePricing.total, displayCurrency)} kr
              </span>
            </div>
          </div>
        );
      })()}

      {/* Checkout error */}
      {checkoutError && (
        <div className="pbs__price-error">{checkoutError.message}</div>
      )}

      {/* Buy button */}
      <button type="button" className="pbs__buy-btn" onClick={handleBook} disabled={isBooking || !selectedPlan}>
        {isBooking ? "Skapar bokning..." : "Boka nu"}
      </button>
    </div>
  );
}
