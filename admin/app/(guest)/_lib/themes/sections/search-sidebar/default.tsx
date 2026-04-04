"use client";

/**
 * Search Sidebar Section — "default" variant
 *
 * Vertical search widget for the sidebar theme.
 * All labels read from settings props (slot.defaults as fallback).
 * Data layer powered by useSearchEngine — no local search state.
 *
 * Structure:
 *   1. Title
 *   2. Accommodation type filter (conditional on settings.showTypeFilter)
 *   3. Date range picker (inline, always visible, single month)
 *   4. Guest dropdown (collapsed trigger → inline expand)
 *   5. Search button
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  format,
  startOfDay,
  startOfMonth,
  parseISO,
  addMonths,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameDay,
  isBefore,
  isAfter,
  differenceInDays,
} from "date-fns";
import { sv } from "date-fns/locale";
import { registerSection } from "../../registry";
import type { SectionProps } from "../../types";
import { useSearchEngine } from "@/app/_lib/search/useSearchEngine";
import { useAccommodationTypes } from "@/app/_lib/search/useAccommodationTypes";
import type { SearchAccommodationType } from "@/app/_lib/search/getAccommodationTypes";
import { FONT_CATALOG } from "@/app/_lib/fonts/catalog";
import { resolveContrastPalette } from "@/app/_lib/color/contrast";
import "./search-sidebar.css";
import "@/app/(guest)/_components/spinner-button.css";

const WEEKDAYS = ["MÅ", "TI", "ON", "TO", "FR", "LÖ", "SÖ"] as const;

/** Resolve a font key (e.g. "poppins") to a CSS font-family stack. */
function fontStack(key: string): string {
  if (!key) return "";
  const entry = FONT_CATALOG.find((f) => f.key === key);
  if (!entry) return key;
  return `${entry.label}, ${entry.serif ? "serif" : "sans-serif"}`;
}

// ─── Icon (Material Symbols) ────────────────────────────────

function MIcon({
  name,
  size = 20,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-rounded select-none leading-none ${className ?? ""}`}
      style={{
        fontSize: size,
        fontVariationSettings: `'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
      }}
    >
      {name}
    </span>
  );
}

// ─── Types ──────────────────────────────────────────────────

type SearchSidebarSettings = {
  title?: string;
  titleAlign?: "left" | "center";
  bgColor?: string;
  showShadow?: boolean;
  textColor?: string;
  buttonColor?: string;
  accentColor?: string;
  headingFont?: string;
  bodyFont?: string;
  buttonFont?: string;
  buttonLabel?: string;
  checkInPlaceholder?: string;
  checkOutPlaceholder?: string;
  typeFilterLabel?: string;
  dateLabel?: string;
  guestLabel?: string;
  adultsLabel?: string;
  adultsDescription?: string;
  childrenLabel?: string;
  childrenDescription?: string;
  showTypeFilter?: boolean;
  maxAdults?: number;
  maxChildren?: number;
};

// ─── Section Component ──────────────────────────────────────

function SearchSidebarSection({
  settings,
  config,
}: SectionProps<SearchSidebarSettings>) {
  const tenantId = config?.tenantId ?? "";

  // ── Settings with defaults ──
  const title = settings.title || "Sök & boka";
  const titleAlign = settings.titleAlign ?? "left";
  const bgColor = settings.bgColor ?? "#FFFFFF";
  const showShadow = settings.showShadow ?? false;
  const textColor = settings.textColor ?? "#202020";
  const buttonColor = settings.buttonColor ?? "#207EA9";
  const accentColor = settings.accentColor ?? "#207EA9";
  const headingFont = settings.headingFont || "";
  const bodyFont = settings.bodyFont || "";
  const buttonFont = settings.buttonFont || "";
  const buttonLabel = settings.buttonLabel || "Sök tillgänglighet";
  const typeFilterLabel = settings.typeFilterLabel || "Boendetyp";
  const dateLabel = settings.dateLabel || "Datum";
  const guestLabel = settings.guestLabel || "Gäster";
  const adultsLabel = settings.adultsLabel || "Vuxna";
  const adultsDescription = settings.adultsDescription || "13 år och äldre";
  const childrenLabel = settings.childrenLabel || "Barn";
  const childrenDescription = settings.childrenDescription || "0–12 år";
  const showTypeFilter = settings.showTypeFilter !== false;
  const maxAdults = settings.maxAdults ?? 10;

  // ── CSS custom properties from settings ──
  const sectionStyle: React.CSSProperties = {
    "--background": bgColor,
    "--text": textColor,
    "--button-bg": buttonColor,
    "--button-fg": resolveContrastPalette(buttonColor).text,
    "--accent": accentColor,
    ...(headingFont ? { "--font-heading": fontStack(headingFont) } : {}),
    ...(bodyFont ? { "--font-body": fontStack(bodyFont) } : {}),
    ...(buttonFont ? { "--font-button": fontStack(buttonFont) } : {}),
    ...(showShadow ? { boxShadow: "0 6px 16px rgba(0, 0, 0, 0.12)" } : {}),
  } as React.CSSProperties;
  const maxChildren = settings.maxChildren ?? 10;

  // ── Search engine ──
  const fetchedTypes = useAccommodationTypes(tenantId);
  const engine = useSearchEngine({ tenantId });
  const { params, status } = engine;

  // Select all categories by default when loaded and none are selected
  const typesInitialized = useRef(false);
  useEffect(() => {
    if (!typesInitialized.current && fetchedTypes.length > 0 && params.categoryIds.length === 0) {
      typesInitialized.current = true;
      engine.setParams({ categoryIds: fetchedTypes.map((t) => t.id) });
    }
  }, [fetchedTypes, params.categoryIds.length, engine]);

  // Derive Date objects from engine ISO strings for calendar UI
  const checkIn = params.checkIn ? parseISO(params.checkIn) : null;
  const checkOut = params.checkOut ? parseISO(params.checkOut) : null;
  const selectedCategoryIds = params.categoryIds;
  const adults = params.adults;
  const children_ = params.children;
  const isLoading = status === "loading";
  const [submitted, setSubmitted] = useState(false);
  const pendingCommit = useRef(false);

  // ── Calendar state (pure UI) ──
  const today = startOfDay(new Date());
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(today));
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [slideDirection, setSlideDirection] = useState<"next" | "prev">("next");

  // ── Guest dropdown state ──
  const [guestOpen, setGuestOpen] = useState(false);
  const guestRef = useRef<HTMLFieldSetElement>(null);

  // Close guest dropdown on outside click / escape
  useEffect(() => {
    if (!guestOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (guestRef.current && !guestRef.current.contains(e.target as Node)) setGuestOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGuestOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [guestOpen]);

  // ── Handlers ──
  const toggleType = useCallback((type: AccommodationType) => {
    const prev = params.types;
    engine.setParams({
      types: prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    });
  }, [engine, params.types]);

  const handleDayClick = useCallback(
    (date: Date) => {
      if (!checkIn || (checkIn && checkOut)) {
        engine.setParams({ checkIn: format(date, "yyyy-MM-dd"), checkOut: null });
        setHoverDate(null);
      } else if (isBefore(date, checkIn) || isSameDay(date, checkIn)) {
        engine.setParams({ checkIn: format(date, "yyyy-MM-dd"), checkOut: null });
        setHoverDate(null);
      } else {
        engine.setParams({ checkOut: format(date, "yyyy-MM-dd") });
        setHoverDate(null);
      }
    },
    [checkIn, checkOut, engine],
  );

  const handleDayHover = useCallback(
    (date: Date) => {
      if (checkIn && !checkOut && isAfter(date, checkIn)) setHoverDate(date);
      else setHoverDate(null);
    },
    [checkIn, checkOut],
  );

  const handleSearch = useCallback(() => {
    setSubmitted(true);
    pendingCommit.current = true;
    engine.search();
  }, [engine]);

  // Commit to URL after engine.search() resolves without validation error
  useEffect(() => {
    if (!pendingCommit.current) return;
    if (status === "loading") return;
    pendingCommit.current = false;
    if (status === "error") return;
    engine.commitToUrl();
  }, [status, engine]);

  // ── Derived display values ──
  const nightCount = checkIn && checkOut ? differenceInDays(checkOut, checkIn) : null;
  const totalGuests = adults + children_;
  const guestSummary = totalGuests === 0
    ? "Lägg till gäster"
    : children_ === 0
      ? `${adults} vuxna`
      : `${adults} vuxna, ${children_} barn`;

  const engineError = submitted && engine.error ? engine.error.message : undefined;
  const canSearch = !!(checkIn && checkOut && adults >= 1);

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className="ss" style={sectionStyle}>
      {/* ── 1. Title ── */}
      <h2 className="ss__title" style={{ textAlign: titleAlign }}>{title}</h2>

      {/* ── 2. Accommodation type filter ── */}
      {showTypeFilter && ACCOMMODATION_TYPES.length > 0 && (
        <fieldset className="ss__fieldset">
            <div className="ss__type-list">
            {ACCOMMODATION_TYPES.map((type) => {
              const isSelected = selectedTypes.includes(type.value);
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => toggleType(type.value)}
                  className={`ss__type-btn ${isSelected ? "ss__type-btn--active" : ""}`}
                >
                  <span className={`ss__checkbox ${isSelected ? "ss__checkbox--checked" : ""}`}>
                    <svg className="ss__check-icon" viewBox="0 0 12 10" fill="none">
                      <path
                        d="M1 5.5L4 8.5L11 1.5"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray={14}
                        strokeDashoffset={isSelected ? 0 : 14}
                        style={{ transition: "stroke-dashoffset 250ms ease" }}
                      />
                    </svg>
                  </span>
                  <span className="ss__type-label">{type.label}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* ── 3. Date range picker (always visible, single month) ── */}
      <fieldset className="ss__fieldset">
        <div className="ss__calendar">
          <CalendarMonth
            month={viewMonth}
            checkIn={checkIn}
            checkOut={checkOut}
            hoverDate={hoverDate}
            minDate={today}
            onDayClick={handleDayClick}
            onDayHover={handleDayHover}
            onMouseLeave={() => setHoverDate(null)}
            onPrevMonth={
              isAfter(viewMonth, startOfMonth(today))
                ? () => { setSlideDirection("prev"); setViewMonth(addMonths(viewMonth, -1)); }
                : undefined
            }
            onNextMonth={() => { setSlideDirection("next"); setViewMonth(addMonths(viewMonth, 1)); }}
            label={cap(format(viewMonth, "MMMM yyyy", { locale: sv }))}
            direction={slideDirection}
          />
        </div>
      </fieldset>

      {/* ── 4. Guest dropdown ── */}
      <fieldset className="ss__fieldset ss__fieldset--guest" ref={guestRef}>
        <span className="ss__section-label">{guestLabel}</span>
        <button
          type="button"
          className="ss__guest-trigger"
          onClick={() => setGuestOpen(!guestOpen)}
        >
          <span className={totalGuests === 0 ? "ss__guest-trigger-placeholder" : "ss__guest-trigger-value"}>
            {guestSummary}
          </span>
          <MIcon name={guestOpen ? "expand_less" : "expand_more"} size={20} className="ss__guest-trigger-icon" />
        </button>
        {guestOpen && (
          <div className="ss__guest-dropdown">
            <div className="ss__guest-row">
              <div>
                <p className="ss__guest-type">{adultsLabel}</p>
                <p className="ss__guest-desc">{adultsDescription}</p>
              </div>
              <CounterControl
                value={adults}
                min={1}
                max={maxAdults}
                onChange={(n: number) => engine.setParams({ adults: n })}
              />
            </div>
            <div className="ss__guest-divider" />
            <div className="ss__guest-row">
              <div>
                <p className="ss__guest-type">{childrenLabel}</p>
                <p className="ss__guest-desc">{childrenDescription}</p>
              </div>
              <CounterControl
                value={children_}
                min={0}
                max={maxChildren}
                onChange={(n: number) => engine.setParams({ children: n })}
              />
            </div>
          </div>
        )}
      </fieldset>

      {/* ── 5. Search button ── */}
      <button
        type="button"
        onClick={handleSearch}
        disabled={isLoading || !canSearch}
        className={`ss__search-btn sb${!canSearch && !isLoading ? " ss__search-btn--incomplete" : ""}`}
      >
        <span className={`sb__label${isLoading ? " sb__label--hidden" : ""}`}>Sök</span>
        <span className={`sb__spinner${isLoading ? " sb__spinner--visible" : ""}`} />
      </button>
      {engineError && <p className="ss__error">{engineError}</p>}
    </div>
  );
}

// ─── Counter Control ────────────────────────────────────────

function CounterControl({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const canDec = value > min;
  const canInc = value < max;
  return (
    <div className="ss__counter">
      <button
        type="button"
        onClick={() => canDec && onChange(value - 1)}
        disabled={!canDec}
        className={`ss__counter-btn ${!canDec ? "ss__counter-btn--disabled" : ""}`}
        aria-label="Minska"
      >
        <MIcon name="remove" size={18} />
      </button>
      <span className="ss__counter-value">{value}</span>
      <button
        type="button"
        onClick={() => canInc && onChange(value + 1)}
        disabled={!canInc}
        className={`ss__counter-btn ${!canInc ? "ss__counter-btn--disabled" : ""}`}
        aria-label="Öka"
      >
        <MIcon name="add" size={18} />
      </button>
    </div>
  );
}

// ─── Calendar Month ─────────────────────────────────────────

function CalendarMonth({
  month,
  checkIn,
  checkOut,
  hoverDate,
  minDate,
  onDayClick,
  onDayHover,
  onMouseLeave,
  onPrevMonth,
  onNextMonth,
  label,
  direction,
}: {
  month: Date;
  checkIn: Date | null;
  checkOut: Date | null;
  hoverDate: Date | null;
  minDate: Date;
  onDayClick: (d: Date) => void;
  onDayHover: (d: Date) => void;
  onMouseLeave: () => void;
  onPrevMonth?: () => void;
  onNextMonth: () => void;
  label: string;
  direction: "next" | "prev";
}) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDow = getDay(monthStart);
  const offset = startDow === 0 ? 6 : startDow - 1;
  const effectiveEnd = checkOut ?? hoverDate;
  const hasRange = checkIn && effectiveEnd && !isSameDay(checkIn, effectiveEnd);

  const monthKey = format(month, "yyyy-MM");
  const prevMonthRef = useRef<{ key: string; label: string; content: React.ReactNode } | null>(null);
  const [sliding, setSliding] = useState(false);
  const slideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Build grid content as a standalone element
  const gridContent = (
    <>
      {Array.from({ length: offset }).map((_, i) => (
        <div key={`e-${i}`} className="ss__cal-cell" />
      ))}
      {days.map((date) => {
        const disabled = isBefore(date, minDate);
        const isStart = checkIn !== null && isSameDay(date, checkIn);
        const isEnd = effectiveEnd !== null && isSameDay(date, effectiveEnd);
        const isHoverEnd =
          hoverDate !== null && !checkOut && isSameDay(date, hoverDate);
        let inRange = false;
        if (checkIn && effectiveEnd && isAfter(date, checkIn) && isBefore(date, effectiveEnd))
          inRange = true;

        const isEndpoint = isStart || isEnd;
        let cellBg = "transparent";
        if (inRange && !isEndpoint) cellBg = "var(--ss-range-bg, #F7F7F7)";
        else if (isStart && hasRange)
          cellBg = "linear-gradient(to right, transparent 50%, var(--ss-range-bg, #F7F7F7) 50%)";
        else if ((isEnd || isHoverEnd) && hasRange)
          cellBg = "linear-gradient(to left, transparent 50%, var(--ss-range-bg, #F7F7F7) 50%)";

        return (
          <div
            key={date.toISOString()}
            className="ss__cal-cell"
            style={{ background: cellBg }}
          >
            <button
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onDayClick(date)}
              onMouseEnter={() => !disabled && onDayHover(date)}
              className={`ss__cal-day ${disabled ? "ss__cal-day--disabled" : ""} ${isEndpoint ? "ss__cal-day--selected" : ""} ${inRange && !isEndpoint ? "ss__cal-day--range" : ""}`}
            >
              {date.getDate()}
            </button>
          </div>
        );
      })}
    </>
  );

  // Capture outgoing month for crossfade
  const prevKeyRef = useRef(monthKey);
  const prevLabelRef = useRef(label);
  const prevGridRef = useRef<React.ReactNode>(gridContent);
  useEffect(() => {
    if (prevKeyRef.current !== monthKey) {
      // Month changed — start slide
      prevMonthRef.current = {
        key: prevKeyRef.current,
        label: prevLabelRef.current,
        content: prevGridRef.current,
      };
      setSliding(true);
      clearTimeout(slideTimerRef.current);
      slideTimerRef.current = setTimeout(() => {
        setSliding(false);
        prevMonthRef.current = null;
      }, 420);
      prevKeyRef.current = monthKey;
    }
    prevLabelRef.current = label;
    prevGridRef.current = gridContent;
  });

  const exitDir = direction === "next" ? "ss__cal-slide--exit-left" : "ss__cal-slide--exit-right";
  const enterDir = direction === "next" ? "ss__cal-slide--enter-right" : "ss__cal-slide--enter-left";

  return (
    <div onMouseLeave={onMouseLeave}>
      {/* Header: nav + month label */}
      <div className="ss__cal-header">
        <button
          type="button"
          onClick={onPrevMonth}
          disabled={!onPrevMonth}
          className={`ss__cal-nav ${!onPrevMonth ? "ss__cal-nav--disabled" : ""}`}
          aria-label="Föregående månad"
        >
          <MIcon name="chevron_left" size={24} />
        </button>
        <div className="ss__cal-label-track">
          {sliding && prevMonthRef.current && (
            <span key={prevMonthRef.current.key} className={`ss__cal-label ${exitDir}`}>
              {prevMonthRef.current.label}
            </span>
          )}
          <span key={monthKey} className={`ss__cal-label ${sliding ? enterDir : ""}`}>
            {label}
          </span>
        </div>
        <button
          type="button"
          onClick={onNextMonth}
          className="ss__cal-nav"
          aria-label="Nästa månad"
        >
          <MIcon name="chevron_right" size={24} />
        </button>
      </div>

      {/* Weekday headers (stay fixed) */}
      <div className="ss__cal-weekdays">
        {WEEKDAYS.map((day) => (
          <div key={day} className="ss__cal-weekday">
            {day}
          </div>
        ))}
      </div>

      {/* Day grid with crossfade slide */}
      <div className="ss__cal-slide-container">
        {sliding && prevMonthRef.current && (
          <div key={prevMonthRef.current.key} className={`ss__cal-grid ss__cal-slide ${exitDir}`}>
            {prevMonthRef.current.content}
          </div>
        )}
        <div key={monthKey} className={`ss__cal-grid ${sliding ? `ss__cal-slide ${enterDir}` : ""}`}>
          {gridContent}
        </div>
      </div>
    </div>
  );
}

registerSection("search", "default", SearchSidebarSection);

export default SearchSidebarSection;
