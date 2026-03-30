"use client";

/**
 * Search Section Renderer
 * ───────────────────────
 * Locked section renderer for the booking engine search form.
 * Adapted from the standalone search-form.tsx — self-contained,
 * no header context dependency.
 *
 * Renders the Airbnb-style morphing search bar with:
 *   - Accommodation type panel (checkbox filter)
 *   - Date range panel (dual-month calendar)
 *   - Guest count panel (adults + children counters)
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, startOfDay, startOfMonth, parseISO, addMonths, endOfMonth, eachDayOfInterval, getDay, isSameDay, isBefore, isAfter, differenceInDays } from "date-fns";
import { sv } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { formatSwedishDate, formatDateRange } from "@/app/_lib/search/dates";
import "./search-renderer.css";

// ─── Constants ──────────────────────────────────────────────
type AccommodationType = "CAMPING" | "APARTMENT" | "HOTEL" | "CABIN";
type PanelId = "type" | "date" | "guests";

const ACCOMMODATION_TYPES: Array<{ value: AccommodationType; label: string }> = [
  { value: "CAMPING", label: "Campingtomter" },
  { value: "APARTMENT", label: "Lägenheter" },
  { value: "HOTEL", label: "Hotell" },
  { value: "CABIN", label: "Stugor" },
];

const LABELS = {
  ACCOMMODATION_TYPE: "Boendetyp",
  GUESTS: "Vem",
  DATE: "När",
  DATE_PLACEHOLDER: "Lägg till datum",
  GUEST_PLACEHOLDER: "Lägg till gäster",
  ADULTS: "Vuxna",
  ADULTS_DESC: "13 år och äldre",
  CHILDREN: "Barn",
  CHILDREN_DESC: "0–12 år",
  TYPES_SELECTED: "typer valda",
} as const;

const MOTION = {
  duration: 350,
  ease: "cubic-bezier(0.33, 1, 0.68, 1)",
  fadeOut: 60,
  fadeIn: 120,
  closeDuration: 200,
  closeEase: "cubic-bezier(0.32, 0, 0.67, 0)",
} as const;

const WEEKDAYS = ["MÅ", "TI", "ON", "TO", "FR", "LÖ", "SÖ"] as const;

// ─── Icon (Material Symbols) ────────────────────────────────
function MIcon({ name, size = 24, weight = 400, className }: { name: string; size?: number; weight?: number; className?: string }) {
  return (
    <span
      className={`material-symbols-rounded select-none leading-none ${className ?? ""}`}
      style={{ fontSize: size, fontVariationSettings: `'FILL' 0, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}` }}
    >
      {name}
    </span>
  );
}

// ─── Section Renderer ───────────────────────────────────────
export function SearchDefaultRenderer(_props: SectionRendererProps) {
  return (
    <section className="s-search">
      <div className="s-search__container">
        <SearchForm />
      </div>
    </section>
  );
}

// ─── Search Form ────────────────────────────────────────────
function SearchForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<AccommodationType[]>(["CAMPING", "APARTMENT", "HOTEL", "CABIN"]);
  const [adults, setAdults] = useState(0);
  const [children_, setChildren] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Hydrate from URL
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    const ci = searchParams.get("checkIn");
    const co = searchParams.get("checkOut");
    if (ci) { const d = parseISO(ci); if (!isNaN(d.getTime())) setCheckIn(d); }
    if (co) { const d = parseISO(co); if (!isNaN(d.getTime())) setCheckOut(d); }
    const g = searchParams.get("guests");
    if (g) { const n = parseInt(g, 10); if (!isNaN(n) && n > 0) setAdults(n); }
    hydrated.current = true;
  }, [searchParams]);

  // Panel state
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);
  const [contentVisible, setContentVisible] = useState(false);
  const [panelRect, setPanelRect] = useState({ left: 0, width: 0, height: 0 });
  const [highlightRect, setHighlightRect] = useState({ left: 0, width: 0, height: 0 });
  const [highlightReady, setHighlightReady] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<PanelId, HTMLElement | null>>({ type: null, date: null, guests: null });
  const measureRef = useRef<HTMLDivElement>(null);

  const closePanel = useCallback(() => {
    setContentVisible(false);
    setTimeout(() => { setActivePanel(null); setIsTransitioning(false); setHighlightReady(false); }, MOTION.closeDuration);
  }, []);

  const togglePanel = useCallback((id: PanelId) => {
    if (activePanel === id) {
      closePanel();
    } else if (activePanel) {
      setContentVisible(false);
      setIsTransitioning(true);
      setTimeout(() => {
        setActivePanel(id);
        requestAnimationFrame(() => setContentVisible(true));
      }, MOTION.fadeOut);
    } else {
      setIsTransitioning(false);
      setHighlightReady(false);
      setActivePanel(id);
    }
  }, [activePanel, closePanel]);

  // Measure panel + highlight
  useEffect(() => {
    if (!activePanel || !containerRef.current || !measureRef.current) return;
    const measureAll = (setHL: boolean) => {
      if (!containerRef.current || !measureRef.current) return;
      const cr = containerRef.current.getBoundingClientRect();
      const h = measureRef.current.offsetHeight;
      const w = measureRef.current.offsetWidth;
      if (activePanel === "date") {
        setPanelRect({ left: 0, width: cr.width, height: h });
      } else {
        const trigger = triggerRefs.current[activePanel];
        if (!trigger) return;
        const tr = trigger.getBoundingClientRect();
        let left = tr.left - cr.left;
        if (left + w > cr.width) left = cr.width - w;
        if (left < 0) left = 0;
        setPanelRect({ left, width: w, height: h });
      }
      if (setHL) {
        const trigger = triggerRefs.current[activePanel];
        if (trigger) {
          const tr = trigger.getBoundingClientRect();
          setHighlightRect({ left: tr.left - cr.left, width: tr.width, height: tr.height });
          setHighlightReady(true);
        }
      }
    };
    const raf = requestAnimationFrame(() => {
      measureAll(isTransitioning || true);
      if (!isTransitioning) requestAnimationFrame(() => setContentVisible(true));
    });
    return () => cancelAnimationFrame(raf);
  }, [activePanel, isTransitioning]);

  // Close on outside click / escape
  useEffect(() => {
    if (!activePanel) return;
    const handleClick = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) closePanel(); };
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") closePanel(); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("mousedown", handleClick); document.removeEventListener("keydown", handleKey); };
  }, [activePanel, closePanel]);

  // Date state
  const today = startOfDay(new Date());
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(today));
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const handleRangeChange = useCallback((ci: Date | null, co: Date | null) => { setCheckIn(ci); setCheckOut(co); }, []);
  const handleClearDates = useCallback((e: React.MouseEvent) => { e.stopPropagation(); setCheckIn(null); setCheckOut(null); setHoverDate(null); }, []);
  const toggleType = useCallback((type: AccommodationType) => { setSelectedTypes((prev) => prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]); }, []);

  const handleSearch = useCallback(() => {
    setSubmitted(true);
    if (!checkIn || !checkOut || adults + children_ === 0) return;
    setActivePanel(null);
    setIsLoading(true);
    const params = new URLSearchParams();
    params.set("checkIn", format(checkIn, "yyyy-MM-dd"));
    params.set("checkOut", format(checkOut, "yyyy-MM-dd"));
    params.set("guests", String(adults + children_));
    if (selectedTypes.length > 0) params.set("types", selectedTypes.join(","));
    // Hard navigation to ensure server re-renders with new search params
    window.location.href = `/search?${params.toString()}`;
  }, [checkIn, checkOut, adults, children_, selectedTypes, router]);

  const guestIsPlaceholder = adults === 0 && children_ === 0;
  const guestText = guestIsPlaceholder ? LABELS.GUEST_PLACEHOLDER : children_ === 0 ? `${adults} vuxna` : `${adults} vuxna, ${children_} barn`;
  const dateIsPlaceholder = !checkIn;
  const dateText = checkIn && checkOut ? formatDateRange(checkIn, checkOut) : checkIn ? `${formatSwedishDate(checkIn)} →` : LABELS.DATE_PLACEHOLDER;
  const typeText = selectedTypes.length === 0 || selectedTypes.length === ACCOMMODATION_TYPES.length ? "Alla boenden" : selectedTypes.length === 1 ? ACCOMMODATION_TYPES.find((t) => t.value === selectedTypes[0])?.label ?? "" : `${selectedTypes.length} ${LABELS.TYPES_SELECTED}`;

  const dateError = submitted ? !checkIn ? "Välj incheckningsdatum" : !checkOut ? "Välj utcheckningsdatum" : undefined : undefined;
  const guestError = submitted && adults + children_ === 0 ? "Lägg till minst 1 gäst" : undefined;

  return (
    <div
      ref={containerRef}
      className="relative mx-auto rounded-[5000px]"
      style={{
        width: "100%",
        transition: `background ${MOTION.duration}ms ${MOTION.ease}, box-shadow ${MOTION.duration}ms ${MOTION.ease}, border-color ${MOTION.duration}ms ${MOTION.ease}`,
        ...(activePanel
          ? { background: "#EBEBEB", border: "1px solid #d4d5d9", boxShadow: "none" }
          : { background: "#fff", border: "1px solid transparent", boxShadow: "rgba(0,0,0,0.1) 0px 3px 12px 0px, rgba(0,0,0,0.08) 0px 1px 2px 0px" }),
      }}
    >
      {/* Triggers */}
      <div className="relative flex items-center gap-0">
        {/* Sliding highlight */}
        <div
          className="pointer-events-none absolute z-0 rounded-[5000px] bg-white"
          style={{
            left: highlightRect.left, width: highlightRect.width, height: highlightRect.height,
            opacity: activePanel && (highlightReady || isTransitioning) ? 1 : 0,
            boxShadow: activePanel ? "rgba(0,0,0,0.1) 0px 3px 12px 0px, rgba(0,0,0,0.08) 0px 1px 2px 0px" : "none",
            transition: isTransitioning
              ? `left ${MOTION.duration - 50}ms ${MOTION.ease}, width ${MOTION.duration - 50}ms ${MOTION.ease}, height ${MOTION.duration}ms ${MOTION.ease}, opacity 80ms ease`
              : "opacity 80ms ease",
          }}
        />

        <button ref={(el) => { triggerRefs.current.type = el; }} type="button" onClick={() => togglePanel("type")} className={`relative z-10 flex w-full cursor-pointer items-center rounded-[5000px] focus:outline-none flex-1 ${!activePanel ? "hover:bg-black/[0.03]" : ""}`} style={{ padding: "15px 32px", justifyContent: "flex-start", textAlign: "left" }}>
          <div className="flex flex-col">
            <span className="pb-[2px] text-xs font-medium text-[#222]">{LABELS.ACCOMMODATION_TYPE}</span>
            <span className="text-sm font-medium text-[#222]">{typeText}</span>
          </div>
        </button>

        <div className="my-auto h-8 w-px shrink-0" style={{ backgroundColor: "#DDD", opacity: activePanel ? 0 : 1, transition: "opacity 200ms ease" }} />

        <button ref={(el) => { triggerRefs.current.date = el; }} type="button" onClick={() => togglePanel("date")} className={`relative z-10 flex w-full cursor-pointer items-center rounded-[5000px] focus:outline-none flex-1 ${!activePanel ? "hover:bg-black/[0.03]" : ""}`} style={{ padding: "15px 24px", justifyContent: "flex-start", textAlign: "left" }}>
          <div className="min-w-0 flex-1 flex flex-col">
            <span className="pb-[2px] text-xs font-medium text-[#222]">{LABELS.DATE}</span>
            <span className="truncate text-sm" style={{ color: dateIsPlaceholder ? "#6a6a6a" : "#222", fontWeight: dateIsPlaceholder ? 400 : 500 }}>{dateText}</span>
          </div>
          {checkIn && (
            <span role="button" tabIndex={0} onPointerDown={handleClearDates} className="flex size-6 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full hover:bg-black/[0.06] ml-2" aria-label="Rensa datum">
              <MIcon name="close" size={16} className="text-[#202020]" />
            </span>
          )}
        </button>

        <div className="my-auto h-8 w-px shrink-0" style={{ backgroundColor: "#DDD", opacity: activePanel ? 0 : 1, transition: "opacity 200ms ease" }} />

        <div className="relative z-10 flex-1" ref={(el) => { triggerRefs.current.guests = el; }}>
          <button type="button" onClick={() => togglePanel("guests")} className={`flex w-full cursor-pointer items-center whitespace-nowrap rounded-[5000px] focus:outline-none ${!activePanel ? "hover:bg-black/[0.03]" : ""}`} style={{ padding: "15px 64px 15px 24px", justifyContent: "flex-start", textAlign: "left" }}>
            <div className="flex flex-col">
              <span className="pb-[2px] text-xs font-medium text-[#222]">{LABELS.GUESTS}</span>
              <span className="text-sm" style={{ color: guestIsPlaceholder ? "#6a6a6a" : "#222", fontWeight: guestIsPlaceholder ? 400 : 500 }}>{guestText}</span>
            </div>
          </button>
          <div className="pointer-events-none absolute inset-y-0 flex items-center" style={{ right: 16 }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleSearch(); }}
              disabled={isLoading}
              className="pointer-events-auto flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-0 bg-[#207EA9] text-white hover:bg-[#1b6d93]"
              style={{
                width: activePanel ? 88 : 44, height: 44,
                transition: `width ${MOTION.duration}ms ${MOTION.ease}`,
              }}
            >
              {isLoading ? <Loader2 className="size-5 animate-spin" /> : (
                <>
                  <MIcon name="search" size={20} className="shrink-0 text-white" />
                  <span className="overflow-hidden whitespace-nowrap font-semibold text-white" style={{ fontSize: 16, width: activePanel ? 36 : 0, marginLeft: activePanel ? 4 : 0, opacity: activePanel ? 1 : 0, transition: `width ${MOTION.duration}ms ${MOTION.ease}, margin-left ${MOTION.duration}ms ${MOTION.ease}, opacity ${activePanel ? MOTION.duration : 80}ms ease` }}>
                    Sök
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Errors */}
      {dateError && <p className="mt-1 px-5 text-xs text-red-600">{dateError}</p>}
      {guestError && <p className="mt-1 px-5 text-xs text-red-600">{guestError}</p>}

      {/* Invisible measure container */}
      {activePanel && (
        <div ref={measureRef} className="pointer-events-none invisible absolute left-0 top-0 z-[-1] w-max" aria-hidden="true">
          <PanelContent panel={activePanel} selectedTypes={selectedTypes} onToggleType={toggleType} checkIn={checkIn} checkOut={checkOut} onRangeChange={handleRangeChange} minDate={today} viewMonth={viewMonth} onViewMonthChange={setViewMonth} hoverDate={hoverDate} onHoverDateChange={setHoverDate} adults={adults} children_={children_} onAdultsChange={setAdults} onChildrenChange={setChildren} containerWidth={containerRef.current?.offsetWidth ?? 850} />
        </div>
      )}

      {/* Visible animated panel */}
      <div
        className="absolute top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl bg-white shadow-[0_8px_40px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.06]"
        style={{
          left: panelRect.left, width: activePanel ? panelRect.width : panelRect.width,
          height: activePanel ? panelRect.height : 0, opacity: activePanel ? 1 : 0,
          transition: isTransitioning
            ? `left ${MOTION.duration - 50}ms ${MOTION.ease}, width ${MOTION.duration - 50}ms ${MOTION.ease}, height ${MOTION.duration}ms ${MOTION.ease}, opacity ${MOTION.fadeIn}ms ease`
            : !activePanel
              ? `height ${MOTION.closeDuration}ms ${MOTION.closeEase}, width ${MOTION.closeDuration}ms ${MOTION.closeEase}, left ${MOTION.closeDuration}ms ${MOTION.closeEase}, opacity ${MOTION.closeDuration * 0.6}ms ease`
              : "none",
          animation: activePanel && !isTransitioning ? `panel-grow ${MOTION.duration}ms ${MOTION.ease} both` : "none",
          pointerEvents: activePanel ? "auto" : "none",
        }}
      >
        <div style={{ opacity: contentVisible ? 1 : 0, transition: contentVisible ? `opacity ${MOTION.fadeIn}ms ease-out` : `opacity ${MOTION.fadeOut}ms ease-in` }}>
          {activePanel && <PanelContent panel={activePanel} selectedTypes={selectedTypes} onToggleType={toggleType} checkIn={checkIn} checkOut={checkOut} onRangeChange={handleRangeChange} minDate={today} viewMonth={viewMonth} onViewMonthChange={setViewMonth} hoverDate={hoverDate} onHoverDateChange={setHoverDate} adults={adults} children_={children_} onAdultsChange={setAdults} onChildrenChange={setChildren} containerWidth={containerRef.current?.offsetWidth ?? 850} />}
        </div>
      </div>
    </div>
  );
}

// ─── Counter ────────────────────────────────────────────────
function CounterControl({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  const canDec = value > min;
  const canInc = value < max;
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => canDec && onChange(value - 1)} disabled={!canDec} className={`flex size-8 items-center justify-center rounded-full border-0 bg-[#F2F2F2] transition-colors duration-150 ${canDec ? "cursor-pointer text-[#202020] hover:bg-[#E5E5E5]" : "cursor-not-allowed text-[#9b9b9b] opacity-40"}`} aria-label="Minska"><MIcon name="remove" size={20} /></button>
      <span className="min-w-[24px] text-center text-base font-medium text-[#202020]">{value}</span>
      <button type="button" onClick={() => canInc && onChange(value + 1)} disabled={!canInc} className={`flex size-8 items-center justify-center rounded-full border-0 bg-[#F2F2F2] transition-colors duration-150 ${canInc ? "cursor-pointer text-[#202020] hover:bg-[#E5E5E5]" : "cursor-not-allowed text-[#9b9b9b] opacity-40"}`} aria-label="Öka"><MIcon name="add" size={20} /></button>
    </div>
  );
}

// ─── Checkbox ───────────────────────────────────────────────
function AnimatedCheckbox({ checked }: { checked: boolean }) {
  return (
    <div className={`flex size-5 items-center justify-center rounded border transition-colors duration-200 ${checked ? "border-slate-900 bg-slate-900" : "border-slate-300 bg-white"}`}>
      <svg className="size-3" viewBox="0 0 12 10" fill="none"><path d="M1 5.5L4 8.5L11 1.5" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={14} strokeDashoffset={checked ? 0 : 14} style={{ transition: "stroke-dashoffset 250ms ease" }} /></svg>
    </div>
  );
}

// ─── Panel content ──────────────────────────────────────────
interface PanelContentProps {
  panel: PanelId; selectedTypes: AccommodationType[]; onToggleType: (t: AccommodationType) => void;
  checkIn: Date | null; checkOut: Date | null; onRangeChange: (ci: Date | null, co: Date | null) => void;
  minDate: Date; viewMonth: Date; onViewMonthChange: (d: Date) => void;
  hoverDate: Date | null; onHoverDateChange: (d: Date | null) => void;
  adults: number; children_: number; onAdultsChange: (n: number) => void; onChildrenChange: (n: number) => void;
  containerWidth: number;
}

function PanelContent({ panel, selectedTypes, onToggleType, checkIn, checkOut, onRangeChange, minDate, viewMonth, onViewMonthChange, hoverDate, onHoverDateChange, adults, children_, onAdultsChange, onChildrenChange, containerWidth }: PanelContentProps) {
  if (panel === "type") {
    return (
      <div className="w-max px-5 py-[22px]">
        {ACCOMMODATION_TYPES.map((type) => {
          const isSelected = selectedTypes.includes(type.value);
          return (
            <button key={type.value} type="button" onClick={() => onToggleType(type.value)} className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-left transition-all duration-200 hover:bg-slate-50">
              <AnimatedCheckbox checked={isSelected} />
              <span className={`text-sm ${isSelected ? "font-medium text-[#202020]" : "text-[#6b6b6b]"}`}>{type.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (panel === "date") {
    return (
      <div style={{ width: containerWidth }}>
        <DateRangePanel checkIn={checkIn} checkOut={checkOut} onRangeChange={onRangeChange} minDate={minDate} viewMonth={viewMonth} onViewMonthChange={onViewMonthChange} hoverDate={hoverDate} onHoverDateChange={onHoverDateChange} />
      </div>
    );
  }

  return (
    <div className="w-max min-w-[280px] px-8 py-[18px]">
      <div className="flex items-center justify-between gap-8 py-[14px]">
        <div><p className="pb-[3px] font-medium text-[#202020]" style={{ fontSize: 16 }}>{LABELS.ADULTS}</p><p style={{ fontSize: 14, color: "#6a6a6a" }}>{LABELS.ADULTS_DESC}</p></div>
        <CounterControl value={adults} min={0} max={10} onChange={onAdultsChange} />
      </div>
      <div className="border-t border-slate-200" />
      <div className="flex items-center justify-between gap-8 py-[14px]">
        <div><p className="pb-[3px] font-medium text-[#202020]" style={{ fontSize: 16 }}>{LABELS.CHILDREN}</p><p style={{ fontSize: 14, color: "#6a6a6a" }}>{LABELS.CHILDREN_DESC}</p></div>
        <CounterControl value={children_} min={0} max={10} onChange={onChildrenChange} />
      </div>
    </div>
  );
}

// ─── Date Range Panel ───────────────────────────────────────
function DateRangePanel({ checkIn, checkOut, onRangeChange, minDate, viewMonth, onViewMonthChange, hoverDate, onHoverDateChange }: {
  checkIn: Date | null; checkOut: Date | null; onRangeChange: (ci: Date | null, co: Date | null) => void;
  minDate: Date; viewMonth: Date; onViewMonthChange: (d: Date) => void; hoverDate: Date | null; onHoverDateChange: (d: Date | null) => void;
}) {
  const today = startOfDay(new Date());
  const canGoPrev = isAfter(viewMonth, startOfMonth(today));
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const viewLabel = cap(format(viewMonth, "MMMM yyyy", { locale: sv }));
  const nextLabel = cap(format(addMonths(viewMonth, 1), "MMMM yyyy", { locale: sv }));
  const nightCount = checkIn && checkOut ? differenceInDays(checkOut, checkIn) : null;

  const handleDayClick = useCallback((date: Date) => {
    if (!checkIn || (checkIn && checkOut)) { onRangeChange(date, null); onHoverDateChange(null); }
    else if (isBefore(date, checkIn) || isSameDay(date, checkIn)) { onRangeChange(date, null); onHoverDateChange(null); }
    else { onRangeChange(checkIn, date); onHoverDateChange(null); }
  }, [checkIn, checkOut, onRangeChange, onHoverDateChange]);

  const handleDayHover = useCallback((date: Date) => {
    if (checkIn && !checkOut && isAfter(date, checkIn)) onHoverDateChange(date);
    else onHoverDateChange(null);
  }, [checkIn, checkOut, onHoverDateChange]);

  return (
    <div className="p-8">
      <div className="mb-5 grid grid-cols-2 items-center gap-6">
        <div className="grid grid-cols-[36px_1fr_36px] items-center">
          <button type="button" onClick={() => canGoPrev && onViewMonthChange(addMonths(viewMonth, -1))} disabled={!canGoPrev} className={`flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white transition-all duration-300 ${canGoPrev ? "cursor-pointer opacity-100 hover:border-slate-400" : "pointer-events-none opacity-0"}`} aria-label="Föregående"><MIcon name="chevron_left" size={20} /></button>
          <span className="text-center font-semibold text-[#202020]" style={{ fontSize: 16 }}>{viewLabel}</span>
          <span />
        </div>
        <div className="grid grid-cols-[36px_1fr_36px] items-center">
          <span />
          <span className="text-center font-semibold text-[#202020]" style={{ fontSize: 16 }}>{nextLabel}</span>
          <button type="button" onClick={() => onViewMonthChange(addMonths(viewMonth, 1))} className="flex size-9 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white transition-all duration-200 hover:border-slate-400" aria-label="Nästa"><MIcon name="chevron_right" size={20} /></button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <MonthGrid month={viewMonth} checkIn={checkIn} checkOut={checkOut} hoverDate={hoverDate} minDate={minDate} today={today} onDayClick={handleDayClick} onDayHover={handleDayHover} onMouseLeave={() => onHoverDateChange(null)} />
        <MonthGrid month={addMonths(viewMonth, 1)} checkIn={checkIn} checkOut={checkOut} hoverDate={hoverDate} minDate={minDate} today={today} onDayClick={handleDayClick} onDayHover={handleDayHover} onMouseLeave={() => onHoverDateChange(null)} />
      </div>
      {nightCount !== null && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <span className="text-sm text-[#6b6b6b]">{nightCount} {nightCount === 1 ? "natt" : "nätter"}</span>
        </div>
      )}
    </div>
  );
}

// ─── Month Grid ─────────────────────────────────────────────
function MonthGrid({ month, checkIn, checkOut, hoverDate, minDate, today, onDayClick, onDayHover, onMouseLeave }: {
  month: Date; checkIn: Date | null; checkOut: Date | null; hoverDate: Date | null; minDate: Date; today: Date;
  onDayClick: (d: Date) => void; onDayHover: (d: Date) => void; onMouseLeave: () => void;
}) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDow = getDay(monthStart);
  const offset = startDow === 0 ? 6 : startDow - 1;
  const effectiveEnd = checkOut ?? hoverDate;
  const hasRange = checkIn && effectiveEnd && !isSameDay(checkIn, effectiveEnd);

  return (
    <div onMouseLeave={onMouseLeave}>
      <div className="mb-2 grid grid-cols-7 pb-2">
        {WEEKDAYS.map((day) => (<div key={day} className="text-center text-xs font-medium text-[#6F6F6F]">{day}</div>))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: offset }).map((_, i) => (<div key={`e-${i}`} className="aspect-square min-h-[40px]" />))}
        {days.map((date) => {
          const disabled = isBefore(date, minDate);
          const isStart = checkIn !== null && isSameDay(date, checkIn);
          const isEnd = effectiveEnd !== null && isSameDay(date, effectiveEnd);
          const isHoverEnd = hoverDate !== null && !checkOut && isSameDay(date, hoverDate);
          let inRange = false;
          if (checkIn && effectiveEnd && isAfter(date, checkIn) && isBefore(date, effectiveEnd)) inRange = true;

          let btnBg = "transparent";
          let textColor = "#202020";
          let fontWeight = 500;
          if (disabled) { textColor = "#202020"; }
          else if (isStart || (isEnd && !isHoverEnd)) { btnBg = "#222"; textColor = "white"; fontWeight = 600; }
          else if (isHoverEnd) { btnBg = "#222"; textColor = "white"; fontWeight = 600; }
          else if (inRange) { btnBg = "#F7F7F7"; }

          let cellBg = "transparent";
          if (inRange && !isStart && !isEnd && !isHoverEnd) cellBg = "#F7F7F7";
          else if (isStart && hasRange) cellBg = "linear-gradient(to right, transparent 50%, #F7F7F7 50%)";
          else if ((isEnd || isHoverEnd) && hasRange) cellBg = "linear-gradient(to left, transparent 50%, #F7F7F7 50%)";

          return (
            <div key={date.toISOString()} className="aspect-square min-h-[40px]" style={{ background: cellBg }}>
              <button type="button" disabled={disabled} onClick={() => !disabled && onDayClick(date)} onMouseEnter={() => !disabled && onDayHover(date)}
                className={`relative flex size-full cursor-pointer items-center justify-center ${disabled ? "pointer-events-none opacity-[0.28]" : ""}`}
                style={{ fontSize: 14, fontWeight, borderRadius: 5000, backgroundColor: btnBg, color: textColor, border: "none" }}
                onMouseOver={(e) => { if (!disabled && !isStart && !isEnd && !isHoverEnd && !inRange && !checkIn) e.currentTarget.style.border = "1px solid #222"; }}
                onMouseOut={(e) => { e.currentTarget.style.border = "none"; }}
              >
                {date.getDate()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
