"use client";

/**
 * Shared Date Range Picker
 * ════════════════════════
 *
 * Extracted from SearchRenderer. Used by both the search form
 * and the product page booking form popup.
 *
 * Dual-month calendar with range selection, hover highlights,
 * and gradient cell backgrounds.
 */

import { useCallback } from "react";
import {
  format,
  startOfDay,
  startOfMonth,
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

const WEEKDAYS = ["MÅ", "TI", "ON", "TO", "FR", "LÖ", "SÖ"] as const;

function MIcon({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span
      className="material-symbols-rounded select-none leading-none"
      style={{ fontSize: size, fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
    >
      {name}
    </span>
  );
}

// ── Month Grid ─────────────────────────────────────────────

function MonthGrid({
  month, checkIn, checkOut, hoverDate, minDate, today,
  onDayClick, onDayHover, onMouseLeave,
}: {
  month: Date; checkIn: Date | null; checkOut: Date | null;
  hoverDate: Date | null; minDate: Date; today: Date;
  onDayClick: (d: Date) => void; onDayHover: (d: Date) => void;
  onMouseLeave: () => void;
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
        {WEEKDAYS.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-[#6F6F6F]">{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`e-${i}`} className="aspect-square min-h-[40px]" />
        ))}
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
              <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && onDayClick(date)}
                onMouseEnter={() => !disabled && onDayHover(date)}
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

// ── Date Range Panel (exported) ────────────────────────────

export interface DateRangePickerProps {
  checkIn: Date | null;
  checkOut: Date | null;
  onRangeChange: (ci: Date | null, co: Date | null) => void;
  viewMonth: Date;
  onViewMonthChange: (d: Date) => void;
  hoverDate: Date | null;
  onHoverDateChange: (d: Date | null) => void;
  width?: number;
}

export function DateRangePicker({
  checkIn, checkOut, onRangeChange,
  viewMonth, onViewMonthChange,
  hoverDate, onHoverDateChange,
}: DateRangePickerProps) {
  const today = startOfDay(new Date());
  const minDate = today;
  const canGoPrev = isAfter(viewMonth, startOfMonth(today));
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const viewLabel = cap(format(viewMonth, "MMMM yyyy", { locale: sv }));
  const nextLabel = cap(format(addMonths(viewMonth, 1), "MMMM yyyy", { locale: sv }));

  const handleDayClick = useCallback((date: Date) => {
    if (!checkIn || (checkIn && checkOut)) {
      onRangeChange(date, null);
      onHoverDateChange(null);
    } else if (isBefore(date, checkIn) || isSameDay(date, checkIn)) {
      onRangeChange(date, null);
      onHoverDateChange(null);
    } else {
      onRangeChange(checkIn, date);
      onHoverDateChange(null);
    }
  }, [checkIn, checkOut, onRangeChange, onHoverDateChange]);

  const handleDayHover = useCallback((date: Date) => {
    if (checkIn && !checkOut && isAfter(date, checkIn)) onHoverDateChange(date);
    else onHoverDateChange(null);
  }, [checkIn, checkOut, onHoverDateChange]);

  return (
    <div className="p-8">
      <div className="mb-5 grid grid-cols-2 items-center gap-6">
        <div className="grid grid-cols-[36px_1fr_36px] items-center">
          <button
            type="button"
            onClick={() => canGoPrev && onViewMonthChange(addMonths(viewMonth, -1))}
            disabled={!canGoPrev}
            className={`flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white transition-all duration-300 ${canGoPrev ? "cursor-pointer opacity-100 hover:border-slate-400" : "pointer-events-none opacity-0"}`}
            aria-label="Föregående"
          >
            <MIcon name="chevron_left" size={20} />
          </button>
          <span className="text-center font-semibold text-[#202020]" style={{ fontSize: 16 }}>{viewLabel}</span>
          <span />
        </div>
        <div className="grid grid-cols-[36px_1fr_36px] items-center">
          <span />
          <span className="text-center font-semibold text-[#202020]" style={{ fontSize: 16 }}>{nextLabel}</span>
          <button
            type="button"
            onClick={() => onViewMonthChange(addMonths(viewMonth, 1))}
            className="flex size-9 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white transition-all duration-200 hover:border-slate-400"
            aria-label="Nästa"
          >
            <MIcon name="chevron_right" size={20} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <MonthGrid
          month={viewMonth} checkIn={checkIn} checkOut={checkOut}
          hoverDate={hoverDate} minDate={minDate} today={today}
          onDayClick={handleDayClick} onDayHover={handleDayHover}
          onMouseLeave={() => onHoverDateChange(null)}
        />
        <MonthGrid
          month={addMonths(viewMonth, 1)} checkIn={checkIn} checkOut={checkOut}
          hoverDate={hoverDate} minDate={minDate} today={today}
          onDayClick={handleDayClick} onDayHover={handleDayHover}
          onMouseLeave={() => onHoverDateChange(null)}
        />
      </div>
    </div>
  );
}

/**
 * Compute nights from check-in/check-out.
 */
export function getNightCount(checkIn: Date | null, checkOut: Date | null): number | null {
  if (!checkIn || !checkOut) return null;
  return differenceInDays(checkOut, checkIn);
}
