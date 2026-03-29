"use client";

import { useState, useRef, useEffect } from "react";

const WEEKDAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
const MONTHS = [
  "Januari", "Februari", "Mars", "April", "Maj", "Juni",
  "Juli", "Augusti", "September", "Oktober", "November", "December",
];

function pad(n: number): string { return n < 10 ? `0${n}` : `${n}`; }

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday = 0
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Välj datum",
}: {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const today = new Date();
  const selected = value ? new Date(value + "T00:00:00") : null;
  const [viewYear, setViewYear] = useState(selected?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? today.getMonth());

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
  const prevDays = getDaysInMonth(viewYear, viewMonth === 0 ? 11 : viewMonth - 1);

  const displayValue = selected
    ? `${selected.getDate()} ${MONTHS[selected.getMonth()].slice(0, 3).toLowerCase()} ${selected.getFullYear()}`
    : "";

  return (
    <div className="disc-datepicker" ref={ref}>
      <div
        className="pf-collection-trigger"
        onClick={() => setOpen(!open)}
        style={{ cursor: "pointer" }}
      >
        <span className="material-symbols-rounded" style={{ fontSize: 18, color: "#616161", flexShrink: 0 }}>calendar_today</span>
        <span style={{ flex: 1, fontSize: 13, color: displayValue ? "var(--admin-text)" : "var(--admin-text-tertiary)", height: 32, display: "flex", alignItems: "center" }}>
          {displayValue || placeholder}
        </span>
      </div>

      {open && (
        <div className="disc-datepicker__dropdown">
          <div className="disc-datepicker__nav">
            <button type="button" className="disc-datepicker__arrow" onClick={prevMonth}>
              <span className="material-symbols-rounded" style={{ fontSize: 18 }}>chevron_left</span>
            </button>
            <span className="disc-datepicker__month">{MONTHS[viewMonth]} {viewYear}</span>
            <button type="button" className="disc-datepicker__arrow" onClick={nextMonth}>
              <span className="material-symbols-rounded" style={{ fontSize: 18 }}>chevron_right</span>
            </button>
          </div>

          <div className="disc-datepicker__weekdays">
            {WEEKDAYS.map((d) => (
              <span key={d} className="disc-datepicker__weekday">{d}</span>
            ))}
          </div>

          <div className="disc-datepicker__days">
            {/* Previous month overflow */}
            {Array.from({ length: firstDay }).map((_, i) => {
              const day = prevDays - firstDay + 1 + i;
              return (
                <button key={`prev-${i}`} type="button" className="disc-datepicker__day disc-datepicker__day--outside" tabIndex={-1}>
                  {day}
                </button>
              );
            })}

            {/* Current month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
              const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
              const isSelected = value === dateStr;

              return (
                <button
                  key={day}
                  type="button"
                  className={`disc-datepicker__day${isToday ? " disc-datepicker__day--today" : ""}${isSelected ? " disc-datepicker__day--selected" : ""}`}
                  onClick={() => { onChange(dateStr); setOpen(false); }}
                >
                  {day}
                </button>
              );
            })}

            {/* Next month overflow */}
            {(() => {
              const totalCells = firstDay + daysInMonth;
              const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
              return Array.from({ length: remaining }).map((_, i) => (
                <button key={`next-${i}`} type="button" className="disc-datepicker__day disc-datepicker__day--outside" tabIndex={-1}>
                  {i + 1}
                </button>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
