"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { EditorIcon } from "@/app/_components/EditorIcon";

// ═══════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════

type ScheduleDate = { year: number; month: number; day: number; hour: number; minute: number } | null;

const MONTHS_SV = ["Januari","Februari","Mars","April","Maj","Juni","Juli","Augusti","September","Oktober","November","December"];
const DAYS_SV = ["Sön","Mån","Tis","Ons","Tor","Fre","Lör"];

function getDaysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDayOfMonth(year: number, month: number) { return new Date(year, month, 1).getDay(); }

function formatScheduleDate(d: ScheduleDate): string {
  if (!d) return "";
  return `${d.day} ${MONTHS_SV[d.month].slice(0,3)} ${d.year}, ${String(d.hour).padStart(2,"0")}:${String(d.minute).padStart(2,"0")}`;
}

function scheduleToISO(d: ScheduleDate): string | undefined {
  if (!d) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  const localStr = `${d.year}-${pad(d.month + 1)}-${pad(d.day)}T${pad(d.hour)}:${pad(d.minute)}:00`;
  const probe = new Date(localStr + "Z");
  const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", timeZoneName: "shortOffset" });
  const parts = fmt.formatToParts(probe);
  const tzPart = parts.find(p => p.type === "timeZoneName")?.value ?? "+01";
  const match = tzPart.match(/([+-]?\d+)/);
  const offsetH = match ? parseInt(match[1], 10) : 1;
  const utc = new Date(new Date(localStr).getTime());
  utc.setHours(utc.getHours() - offsetH);
  return utc.toISOString();
}

function isoToSchedule(iso: string | undefined): ScheduleDate {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const sthlm = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Stockholm" }));
  return {
    year: sthlm.getFullYear(),
    month: sthlm.getMonth(),
    day: sthlm.getDate(),
    hour: sthlm.getHours(),
    minute: sthlm.getMinutes(),
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════

type Props = {
  scheduledShow?: string;
  scheduledHide?: string;
  onChange: (keyOrPatch: string | Record<string, unknown>, value?: unknown) => void;
};

export function FieldSchedule({ scheduledShow, scheduledHide, onChange }: Props) {
  const [showFrom, setShowFrom] = useState<ScheduleDate>(() => isoToSchedule(scheduledShow));
  const [hideFrom, setHideFrom] = useState<ScheduleDate>(() => isoToSchedule(scheduledHide));
  const [openPicker, setOpenPicker] = useState<"show" | "hide" | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [savingAction, setSavingAction] = useState<"save" | "cancel" | null>(null);
  const saving = savingAction !== null;
  const showRef = useRef<HTMLButtonElement>(null);
  const hideRef = useRef<HTMLButtonElement>(null);

  // Track what's been persisted so we know if there are unsaved changes
  const savedShowRef = useRef<ScheduleDate>(isoToSchedule(scheduledShow));
  const savedHideRef = useRef<ScheduleDate>(isoToSchedule(scheduledHide));

  const isScheduled = !!(savedShowRef.current || savedHideRef.current);

  useLayoutEffect(() => {
    if (openPicker === "show" && showRef.current) setAnchorRect(showRef.current.getBoundingClientRect());
    if (openPicker === "hide" && hideRef.current) setAnchorRect(hideRef.current.getBoundingClientRect());
  }, [openPicker]);

  const datesEqual = (a: ScheduleDate, b: ScheduleDate) => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.year === b.year && a.month === b.month && a.day === b.day && a.hour === b.hour && a.minute === b.minute;
  };

  const hasDate = !!(showFrom || hideFrom);
  const hasChanges = !datesEqual(showFrom, savedShowRef.current) || !datesEqual(hideFrom, savedHideRef.current);

  const handleSave = () => {
    setSavingAction("save");
    const showISO = scheduleToISO(showFrom);
    const hideISO = scheduleToISO(hideFrom);
    onChange({ scheduledShow: showISO ?? null, scheduledHide: hideISO ?? null });
    setTimeout(() => {
      savedShowRef.current = showFrom;
      savedHideRef.current = hideFrom;
      setSavingAction(null);
    }, 600);
  };

  const handleCancel = () => {
    setSavingAction("cancel");
    onChange({ scheduledShow: null, scheduledHide: null });
    setTimeout(() => {
      setShowFrom(null);
      setHideFrom(null);
      savedShowRef.current = null;
      savedHideRef.current = null;
      setSavingAction(null);
    }, 600);
  };

  return (
    <div className="sched-content">
      <div className="sched-label">Datum</div>
      <div className="sched-desc">Välj datum för att visa eller dölja för gäster.</div>
      <div className="sched-row">
        <div className="sched-picker-wrap">
          <button type="button"
            className={"sched-trigger" + (openPicker === "show" ? " sched-trigger--open" : "") + (showFrom ? " sched-trigger--set" : "")}
            ref={showRef} onClick={() => setOpenPicker(p => p === "show" ? null : "show")}>
            <CalendarIcon />
            <span className="sched-trigger-text">
              {showFrom && <span className="sched-trigger-label">Visa från</span>}
              <span className="sched-trigger-value">{showFrom ? formatScheduleDate(showFrom) : "Visa från"}</span>
            </span>
            <SchedChevronIcon />
          </button>
          {openPicker === "show" && typeof window !== "undefined" && createPortal(
            <CalendarPopup value={showFrom} anchorRect={anchorRect} onSelect={d => { setShowFrom(d); setOpenPicker(null); }} onClose={() => setOpenPicker(null)} />,
            document.body
          )}
        </div>
        <div className="sched-picker-wrap">
          <button type="button"
            className={"sched-trigger" + (openPicker === "hide" ? " sched-trigger--open" : "") + (hideFrom ? " sched-trigger--set" : "")}
            ref={hideRef} onClick={() => setOpenPicker(p => p === "hide" ? null : "hide")}>
            <CalendarIcon />
            <span className="sched-trigger-text">
              {hideFrom && <span className="sched-trigger-label">Dölj från</span>}
              <span className="sched-trigger-value">{hideFrom ? formatScheduleDate(hideFrom) : "Dölj från"}</span>
            </span>
            <SchedChevronIcon />
          </button>
          {openPicker === "hide" && typeof window !== "undefined" && createPortal(
            <CalendarPopup value={hideFrom} min={showFrom ?? undefined} anchorRect={anchorRect} onSelect={d => { setHideFrom(d); setOpenPicker(null); }} onClose={() => setOpenPicker(null)} />,
            document.body
          )}
        </div>
      </div>
      {isScheduled ? (
        <div className="sched-actions">
          <button type="button" className={"sched-save-btn" + (hasChanges ? " sched-save-btn--active" : "")}
            disabled={!hasChanges || saving} style={saving ? { pointerEvents: "none" } : undefined} onClick={handleSave}>
            <SchedSpinner visible={savingAction === "save"} />
            <span className="sched-btn-label">Spara ändringar</span>
          </button>
          <button type="button" className="sched-cancel-btn" disabled={saving}
            style={saving ? { pointerEvents: "none" } : undefined} onClick={handleCancel}>
            <SchedSpinner visible={savingAction === "cancel"} variant="dark" />
            <span className="sched-btn-label">Avbryt schemaläggning</span>
          </button>
        </div>
      ) : (
        <div className="sched-actions">
          <button type="button" className={"sched-save-btn" + (hasDate && hasChanges ? " sched-save-btn--active" : "")}
            disabled={!hasDate || !hasChanges || saving} style={saving ? { pointerEvents: "none" } : undefined} onClick={handleSave}>
            <SchedSpinner visible={savingAction === "save"} />
            <span className="sched-btn-label">Schemalägg</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CALENDAR POPUP
// ═══════════════════════════════════════════════════════════════

function CalendarPopup({ value, min, onSelect, onClose, anchorRect }: {
  value: ScheduleDate; min?: ScheduleDate; onSelect: (d: ScheduleDate) => void; onClose: () => void; anchorRect: DOMRect | null;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(value?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(value?.month ?? today.getMonth());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [selDay, setSelDay] = useState(value?.day ?? null as number | null);
  const [hour, setHour] = useState(value?.hour ?? 12);
  const [minute, setMinute] = useState(value?.minute ?? 0);
  const ref = useRef<HTMLDivElement>(null);

  const [dropUp, setDropUp] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useLayoutEffect(() => {
    if (!ref.current || !anchorRect) return;
    const popupH = ref.current.offsetHeight;
    const spaceBelow = window.innerHeight - anchorRect.bottom - 6;
    const spaceAbove = anchorRect.top - 6;
    setDropUp(spaceBelow < popupH && spaceAbove > spaceBelow);
  }, [anchorRect, viewMonth, viewYear, showMonthPicker, showYearPicker]);

  const style: React.CSSProperties = anchorRect ? {
    position: "fixed",
    left: anchorRect.left,
    zIndex: 9999,
    ...(dropUp
      ? { bottom: window.innerHeight - anchorRect.top + 6 }
      : { top: anchorRect.bottom + 6 }),
  } : { position: "fixed", top: 100, left: 100, zIndex: 9999 };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const minDate = min ? new Date(min.year, min.month, min.day) : null;

  const isDisabled = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (d < todayMidnight) return true;
    if (minDate) { const m = new Date(minDate); m.setHours(0,0,0,0); if (d < m) return true; }
    return false;
  };

  const handleDayClick = (day: number) => {
    if (isDisabled(day)) return;
    setSelDay(day);
    onSelect({ year: viewYear, month: viewMonth, day, hour, minute });
    onClose();
  };

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };
  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() + i);

  return (
    <div className="sched-popup" ref={ref} style={style}>
      <div className="sched-popup-header">
        <button type="button" className="sched-nav-btn" onClick={prevMonth}>
          <SchedChevronIcon className="sched-chevron--left" />
        </button>
        <div className="sched-popup-title">
          <button type="button" className="sched-month-btn" onClick={() => { setShowMonthPicker(p => !p); setShowYearPicker(false); }}>
            {MONTHS_SV[viewMonth]}
            <SchedChevronIcon />
          </button>
          <button type="button" className="sched-month-btn" onClick={() => { setShowYearPicker(p => !p); setShowMonthPicker(false); }}>
            {viewYear}
            <SchedChevronIcon />
          </button>
        </div>
        <button type="button" className="sched-nav-btn" onClick={nextMonth}>
          <SchedChevronIcon className="sched-chevron--right" />
        </button>
      </div>
      {showMonthPicker && (
        <div className="sched-picker-dropdown">
          {MONTHS_SV.map((m, i) => (
            <button key={m} type="button" className={"sched-picker-item" + (i === viewMonth ? " sched-picker-item--active" : "")}
              onClick={() => { setViewMonth(i); setShowMonthPicker(false); }}>{m}</button>
          ))}
        </div>
      )}
      {showYearPicker && (
        <div className="sched-picker-dropdown">
          {years.map(y => (
            <button key={y} type="button" className={"sched-picker-item" + (y === viewYear ? " sched-picker-item--active" : "")}
              onClick={() => { setViewYear(y); setShowYearPicker(false); }}>{y}</button>
          ))}
        </div>
      )}
      <div className="sched-grid">
        {DAYS_SV.map(d => <div key={d} className="sched-day-label">{d}</div>)}
        {Array.from({ length: firstDay }, (_, i) => <div key={"e"+i} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const disabled = isDisabled(day);
          const selected = selDay === day;
          const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
          return (
            <button key={day} type="button" disabled={disabled}
              className={"sched-day" + (selected ? " sched-day--selected" : "") + (isToday && !selected ? " sched-day--today" : "") + (disabled ? " sched-day--disabled" : "")}
              onClick={() => handleDayClick(day)}>{day}</button>
          );
        })}
      </div>
      <div className="sched-time">
        <div className="sched-time-wrap">
          <select className="sched-time-select" value={hour} onChange={e => setHour(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, i) => i).map(h => <option key={h} value={h}>{String(h).padStart(2,"0")}</option>)}
          </select>
          <SchedChevronIcon className="sched-time-chevron" />
        </div>
        <div className="sched-time-wrap">
          <select className="sched-time-select" value={minute} onChange={e => setMinute(Number(e.target.value))}>
            {[0,15,30,45].map(m => <option key={m} value={m}>{String(m).padStart(2,"0")}</option>)}
          </select>
          <SchedChevronIcon className="sched-time-chevron" />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SPINNER
// ═══════════════════════════════════════════════════════════════

function SchedSpinner({ visible, variant }: { visible: boolean; variant?: "dark" }) {
  const [mounted, setMounted] = useState(false);
  const [animState, setAnimState] = useState<"enter" | "exit" | "idle">("idle");
  const prevVisible = useRef(visible);
  useEffect(() => {
    if (visible && !prevVisible.current) { setMounted(true); setAnimState("enter"); }
    else if (!visible && prevVisible.current) { setAnimState("exit"); }
    prevVisible.current = visible;
  }, [visible]);
  const handleAnimationEnd = () => {
    if (animState === "exit") { setMounted(false); setAnimState("idle"); }
    else if (animState === "enter") { setAnimState("idle"); }
  };
  if (!mounted) return null;
  return (
    <svg
      className={`sched-animated-spinner${variant === "dark" ? " sched-animated-spinner--dark" : ""}${animState === "exit" ? " sched-animated-spinner--out" : ""}`}
      width="21" height="21" viewBox="0 0 21 21" fill="none"
      onAnimationEnd={handleAnimationEnd}
    >
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" strokeDasharray="33 14.1" strokeLinecap="round" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z"/>
    </svg>
  );
}

function SchedChevronIcon({ className }: { className?: string } = {}) {
  return <EditorIcon name="expand_more" size={16} className={"sched-chevron" + (className ? " " + className : "")} />;
}
