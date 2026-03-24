"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { parseISO, startOfMonth, format } from "date-fns";
import { sv } from "date-fns/locale";
import { DateRangePicker, getNightCount } from "./DateRangePicker";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { useProduct } from "@/app/(guest)/_lib/product-context/ProductContext";
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

  const [popupOpen, setPopupOpen] = useState(false);
  const [guestDropdownOpen, setGuestDropdownOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(checkIn ?? new Date()));
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const guestRef = useRef<HTMLDivElement>(null);

  const nights = getNightCount(checkIn, checkOut);
  const price = product?.price ?? 0;
  const totalGuests = adults + children_;

  // Close date popup on outside click
  useEffect(() => {
    if (!popupOpen) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setPopupOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [popupOpen]);

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
    if (!popupOpen && !guestDropdownOpen) return;
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") { setPopupOpen(false); setGuestDropdownOpen(false); } };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [popupOpen, guestDropdownOpen]);

  const handleRangeChange = useCallback((ci: Date | null, co: Date | null) => {
    setCheckIn(ci);
    setCheckOut(co);
  }, []);

  const handleClear = () => { setCheckIn(null); setCheckOut(null); setHoverDate(null); };

  const handleClose = () => {
    setPopupOpen(false);
    if (checkIn && checkOut) {
      const params = new URLSearchParams(window.location.search);
      params.set("checkIn", format(checkIn, "yyyy-MM-dd"));
      params.set("checkOut", format(checkOut, "yyyy-MM-dd"));
      params.set("guests", String(totalGuests));
      window.location.search = params.toString();
    }
  };

  const fmtDate = (d: Date | null, ph: string) => d ? format(d, "d MMM yyyy", { locale: sv }) : ph;

  const handleBook = () => {
    if (!checkIn || !checkOut) { setPopupOpen(true); return; }
    const params = new URLSearchParams();
    params.set("checkIn", format(checkIn, "yyyy-MM-dd"));
    params.set("checkOut", format(checkOut, "yyyy-MM-dd"));
    params.set("guests", String(totalGuests));
    window.location.href = `/stays/${product?.id}?${params.toString()}`;
  };

  const guestText = children_ === 0 ? `${adults} gäster` : `${adults} vuxna, ${children_} barn`;

  return (
    <div className="pbs" ref={containerRef}>
      {/* Price */}
      <div className="pbs__price">
        Totalt: {price > 0 ? `${formatPriceDisplay(price)} kr` : "—"}
      </div>

      {/* Triggers + guest dropdown wrapper */}
      <div className="pbs__triggers-wrap" ref={guestRef}>
        <div className={`pbs__triggers${guestDropdownOpen ? " pbs__triggers--guest-open" : ""}`}>
          {/* Row 1: Check-in | Check-out */}
          <div className="pbs__trigger-row" onClick={() => { setPopupOpen(!popupOpen); setGuestDropdownOpen(false); }}>
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
          <div className="pbs__trigger-row" onClick={() => { setGuestDropdownOpen(!guestDropdownOpen); setPopupOpen(false); }}>
            <div className="pbs__trigger pbs__trigger--full">
              <span className="pbs__trigger-label">Gäster</span>
              <span className="pbs__trigger-value">{guestText}</span>
            </div>
            <span className="material-symbols-rounded pbs__chevron" style={{ fontSize: 20 }}>expand_more</span>
          </div>
        </div>

        {/* Guest dropdown — absolute, below triggers */}
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

      {/* Date popup */}
      {popupOpen && (
        <div className="pbs__popup">
          <div className="pbs__popup-header">
            <div className="pbs__popup-header-info">
              <div className="pbs__popup-nights">{nights != null ? `${nights} nätter` : "Välj datum"}</div>
              {checkIn && checkOut && (
                <div className="pbs__popup-dates">
                  {format(checkIn, "d MMMM yyyy", { locale: sv })} – {format(checkOut, "d MMMM yyyy", { locale: sv })}
                </div>
              )}
            </div>
          </div>
          <div className="pbs__popup-calendar">
            <DateRangePicker
              checkIn={checkIn} checkOut={checkOut} onRangeChange={handleRangeChange}
              viewMonth={viewMonth} onViewMonthChange={setViewMonth}
              hoverDate={hoverDate} onHoverDateChange={setHoverDate}
            />
          </div>
          <div className="pbs__popup-footer">
            <button type="button" className="pbs__popup-btn pbs__popup-btn--ghost" onClick={handleClear}>Rensa datum</button>
            <button type="button" className="pbs__popup-btn pbs__popup-btn--solid" onClick={handleClose}>Stäng</button>
          </div>
        </div>
      )}

      {/* Buy button */}
      <button type="button" className="pbs__buy-btn" onClick={handleBook}>Boka nu</button>
    </div>
  );
}
