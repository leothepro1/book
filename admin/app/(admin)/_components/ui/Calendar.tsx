'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { getAdminPortalRoot } from './_lib/portal-root';
import './Calendar.css';

/**
 * Calendar — date picker primitive.
 *
 * The component IS its own trigger: clicking the input-shaped trigger
 * opens a portaled popover containing a month grid. The popover smart-
 * positions itself — drop-down by default, auto-flips to drop-up if it
 * would clip below the viewport; horizontal auto-clamp keeps it within
 * the viewport's edges.
 *
 *   // Single date
 *   <Calendar mode="single" value={date} onChange={setDate} placeholder="Välj datum" />
 *
 *   // Date range
 *   <Calendar mode="range" value={range} onChange={setRange} placeholder="Välj datumintervall" />
 *
 * Controlled or uncontrolled — pass `value`+`onChange` for controlled,
 * or `defaultValue` for uncontrolled. `open`+`onOpenChange` likewise
 * control popover visibility externally.
 *
 * Locale: Swedish (sv-SE) — Mon-first weeks, Swedish month/day names
 * via Intl.DateTimeFormat. No external date library.
 *
 * A11y: trigger gets `aria-haspopup="dialog"` + `aria-expanded`; the
 * popover is a `role="dialog"` with `aria-label`. Day cells are
 * `role="gridcell"` with `aria-selected` and `aria-current="date"`
 * for today. ESC closes and returns focus to the trigger.
 */

// ── Date utilities (pure, dependency-free) ─────────────────────

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function isSameDay(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function addMonths(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), 1);
  out.setMonth(out.getMonth() + n);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function compareDays(a: Date, b: Date): number {
  return startOfDay(a).getTime() - startOfDay(b).getTime();
}

function isBetween(date: Date, from: Date, to: Date): boolean {
  const t = startOfDay(date).getTime();
  const lo = Math.min(startOfDay(from).getTime(), startOfDay(to).getTime());
  const hi = Math.max(startOfDay(from).getTime(), startOfDay(to).getTime());
  return t >= lo && t <= hi;
}

function isWithinBounds(date: Date, min?: Date, max?: Date): boolean {
  if (min && compareDays(date, min) < 0) return false;
  if (max && compareDays(date, max) > 0) return false;
  return true;
}

// 42 cells (6 weeks × 7 days) covering the given month, Mon-first,
// with leading days from previous month and trailing days from next
// month so the grid is always rectangular.
function getMonthGrid(viewMonth: Date): Date[] {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  // JS Date.getDay(): 0=Sunday … 6=Saturday. Shift so Mon=0 … Sun=6.
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

// ── Locale formatters (sv-SE) ──────────────────────────────────

const FMT_MONTH_YEAR = new Intl.DateTimeFormat('sv-SE', {
  month: 'long',
  year: 'numeric',
});
const FMT_FULL = new Intl.DateTimeFormat('sv-SE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const FMT_SHORT_NO_YEAR = new Intl.DateTimeFormat('sv-SE', {
  day: 'numeric',
  month: 'short',
});

// Single-letter caps abbreviations — Mon-first. T appears twice (Tis,
// Tor); the position in the row disambiguates. Source-of-truth caps
// so the rendered chrome is unambiguous regardless of CSS text-transform.
const WEEKDAYS_MON_FIRST = ['M', 'T', 'O', 'T', 'F', 'L', 'S'];

function formatMonthYear(d: Date): string {
  return FMT_MONTH_YEAR.format(d);
}

function formatDate(d: Date): string {
  return FMT_FULL.format(d);
}

function formatRange(from: Date | null, to: Date | null): string {
  if (!from && !to) return '';
  if (from && !to) return formatDate(from);
  if (!from && to) return formatDate(to);
  // Both set
  if (from && to) {
    if (isSameDay(from, to)) return formatDate(from);
    if (isSameMonth(from, to) && from.getFullYear() === to.getFullYear()) {
      return `${FMT_SHORT_NO_YEAR.format(from)} – ${formatDate(to)}`;
    }
    return `${formatDate(from)} – ${formatDate(to)}`;
  }
  return '';
}

// ── Types ──────────────────────────────────────────────────────

export type CalendarMode = 'single' | 'range';
export type CalendarSize = 'sm' | 'md' | 'lg';

export type DateRange = {
  from: Date | null;
  to: Date | null;
};

type CalendarBase = {
  placeholder?: string;
  size?: CalendarSize;
  /** Disable any date strictly before `minDate`. */
  minDate?: Date;
  /** Disable any date strictly after `maxDate`. */
  maxDate?: Date;
  disabled?: boolean;
  /** Controlled popover open state. Omit for uncontrolled. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Pixel gap between trigger and popover. Default 6. */
  offset?: number;
  className?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
};

type SingleProps = CalendarBase & {
  mode: 'single';
  value?: Date | null;
  defaultValue?: Date | null;
  onChange?: (date: Date | null) => void;
};

type RangeProps = CalendarBase & {
  mode: 'range';
  value?: DateRange;
  defaultValue?: DateRange;
  onChange?: (range: DateRange) => void;
};

export type CalendarProps = SingleProps | RangeProps;

// Empty range used as the canonical "nothing selected" object so
// callers don't need to construct one; also stable identity for
// uncontrolled defaults.
const EMPTY_RANGE: DateRange = { from: null, to: null };

// ── Component ──────────────────────────────────────────────────

export const Calendar = forwardRef<HTMLButtonElement, CalendarProps>(
  function Calendar(props, ref) {
    const {
      placeholder = 'Välj datum',
      size = 'md',
      minDate,
      maxDate,
      disabled = false,
      open: openProp,
      onOpenChange,
      offset = 6,
      className,
      id,
      name,
      'aria-label': ariaLabel,
    } = props;

    // ── Open state (controlled/uncontrolled) ──
    const isOpenControlled = typeof openProp === 'boolean';
    const [internalOpen, setInternalOpen] = useState(false);
    const open = isOpenControlled ? openProp : internalOpen;
    const setOpen = useCallback(
      (next: boolean) => {
        if (!isOpenControlled) setInternalOpen(next);
        onOpenChange?.(next);
      },
      [isOpenControlled, onOpenChange],
    );

    // ── Selection state (controlled/uncontrolled) ──
    const isValueControlled =
      'value' in props && (props as { value?: unknown }).value !== undefined;
    const [internalSingle, setInternalSingle] = useState<Date | null>(
      props.mode === 'single' ? (props.defaultValue ?? null) : null,
    );
    const [internalRange, setInternalRange] = useState<DateRange>(
      props.mode === 'range' ? (props.defaultValue ?? EMPTY_RANGE) : EMPTY_RANGE,
    );

    const singleValue =
      props.mode === 'single'
        ? isValueControlled
          ? (props.value ?? null)
          : internalSingle
        : null;
    const rangeValue =
      props.mode === 'range'
        ? isValueControlled
          ? (props.value ?? EMPTY_RANGE)
          : internalRange
        : EMPTY_RANGE;

    // ── View month — which month the grid currently shows ──
    const today = useMemo(() => startOfDay(new Date()), []);
    const initialView = useMemo(() => {
      if (props.mode === 'single' && singleValue) return startOfDay(singleValue);
      if (props.mode === 'range' && rangeValue.from)
        return startOfDay(rangeValue.from);
      return today;
      // We deliberately compute initialView only once per mount; later
      // changes to the value don't yank the user away from the month
      // they're browsing.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const [viewMonth, setViewMonth] = useState<Date>(
      () => new Date(initialView.getFullYear(), initialView.getMonth(), 1),
    );

    // Reset view to selected/today every time the popover opens, so
    // re-opening always starts from the most relevant context rather
    // than "wherever I scrolled to last time".
    useEffect(() => {
      if (!open) return;
      const target =
        props.mode === 'single' && singleValue
          ? singleValue
          : props.mode === 'range' && rangeValue.from
            ? rangeValue.from
            : today;
      setViewMonth(new Date(target.getFullYear(), target.getMonth(), 1));
      // Only re-run on open — not on every render of singleValue/rangeValue.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // ── Pending state — stages day clicks before commit ──
    //
    // Day clicks update `pendingSingle` / `pendingRange`, NOT the
    // committed value. The `Använd` footer button is what commits
    // pending → onChange + closes. Outside-click / ESC / scroll
    // close without committing — pending is discarded.
    //
    // On every popover open the pending state seeds from the current
    // committed value, so re-opening shows the user's last selection
    // and lets them tweak from there.
    const [pendingSingle, setPendingSingle] = useState<Date | null>(singleValue);
    const [pendingRange, setPendingRange] = useState<DateRange>(rangeValue);

    useEffect(() => {
      if (!open) return;
      if (props.mode === 'single') setPendingSingle(singleValue);
      else setPendingRange(rangeValue);
      // Only re-seed on open. Mode/value changes mid-open shouldn't
      // yank the user out of their in-flight selection.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Range mode: the in-flight hover preview between first and second
    // click. Cleared on close or after the range completes.
    const [hoverDate, setHoverDate] = useState<Date | null>(null);

    // ── Refs + popover positioning ──
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const [position, setPosition] = useState<{ top: number; left: number }>({
      top: -9999,
      left: -9999,
    });

    // Mirror Menu's positioning: drop-down by default, flip to
    // drop-up if the popover would clip below; horizontal auto-clamp.
    useLayoutEffect(() => {
      if (!open || !triggerRef.current || !popoverRef.current) return;
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const popRect = popoverRef.current.getBoundingClientRect();
      const margin = 8;

      let top = triggerRect.bottom + offset;
      if (top + popRect.height > window.innerHeight - margin) {
        // Not enough room below → flip up
        top = triggerRect.top - popRect.height - offset;
      }

      let left = triggerRect.left;
      if (left + popRect.width > window.innerWidth - margin) {
        left = window.innerWidth - margin - popRect.width;
      }
      if (left < margin) left = margin;

      setPosition({ top, left });
    }, [open, offset, viewMonth]);

    // Close on outside click + ESC + scroll. Pointerdown (not click)
    // so the close fires before the trigger's own click would
    // re-toggle. Scroll uses the capture phase so we also catch
    // scroll inside any scrollable ancestor of the trigger — the
    // popover is `position: fixed` and would otherwise drift visually
    // away from the trigger as the page moves.
    useEffect(() => {
      if (!open) return;
      const handlePointerDown = (e: PointerEvent) => {
        const target = e.target as Node;
        if (triggerRef.current?.contains(target)) return;
        if (popoverRef.current?.contains(target)) return;
        setOpen(false);
        setHoverDate(null);
      };
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          setOpen(false);
          setHoverDate(null);
          triggerRef.current?.focus();
        }
      };
      const handleScroll = (e: Event) => {
        // Ignore scroll events that originate inside the popover
        // itself (e.g. if a future calendar variant has a scrollable
        // year list). The popover doesn't scroll today, but this
        // guard keeps the rule future-proof.
        if (popoverRef.current?.contains(e.target as Node)) return;
        setOpen(false);
        setHoverDate(null);
      };
      document.addEventListener('pointerdown', handlePointerDown);
      document.addEventListener('keydown', handleKeyDown);
      window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
      return () => {
        document.removeEventListener('pointerdown', handlePointerDown);
        document.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('scroll', handleScroll, { capture: true });
      };
    }, [open, setOpen]);

    // ── Selection handlers ──
    const hasValue =
      props.mode === 'single'
        ? singleValue !== null
        : rangeValue.from !== null || rangeValue.to !== null;

    const handleClear = (e: MouseEvent<HTMLButtonElement>) => {
      // Stop propagation so the click doesn't bubble to the trigger
      // (which would re-open the popover) and also so the document-
      // level pointerdown listener doesn't see this as an outside click
      // on a closed popover.
      e.stopPropagation();
      if (props.mode === 'single') {
        if (!isValueControlled) setInternalSingle(null);
        props.onChange?.(null);
      } else {
        const empty: DateRange = { from: null, to: null };
        if (!isValueControlled) setInternalRange(empty);
        props.onChange?.(empty);
      }
      setHoverDate(null);
    };

    const handleDayClick = (date: Date) => {
      if (props.mode === 'single') {
        setPendingSingle(startOfDay(date));
        return;
      }
      // Range mode — same selection rules as before, but staging
      // into pending state instead of committing.
      const { from, to } = pendingRange;
      let next: DateRange;
      if (!from || (from && to)) {
        // First click (or restart after a complete range): set from
        next = { from: startOfDay(date), to: null };
      } else {
        // Second click: complete the range. Swap if needed so from <= to.
        const a = startOfDay(from);
        const b = startOfDay(date);
        next = compareDays(a, b) <= 0 ? { from: a, to: b } : { from: b, to: a };
      }
      setPendingRange(next);
    };

    // Commit pending → onChange + close. The footer "Använd" button
    // is the only path that calls this; outside-click / ESC / scroll
    // close without committing so half-completed ranges or stray
    // single-day picks are discarded automatically.
    const handleApply = () => {
      if (props.mode === 'single') {
        if (!isValueControlled) setInternalSingle(pendingSingle);
        props.onChange?.(pendingSingle);
      } else {
        if (!isValueControlled) setInternalRange(pendingRange);
        props.onChange?.(pendingRange);
      }
      setOpen(false);
      setHoverDate(null);
    };

    // ── Derived data for rendering ──
    const grid = useMemo(() => getMonthGrid(viewMonth), [viewMonth]);

    const triggerLabel = useMemo(() => {
      if (props.mode === 'single') {
        return singleValue ? formatDate(singleValue) : '';
      }
      return formatRange(rangeValue.from, rangeValue.to);
    }, [props.mode, singleValue, rangeValue]);

    // For the range hover-preview: when `from` is set and `to` isn't
    // (in PENDING state), hovering a day temporarily extends the
    // highlight from `from` through the hovered day.
    const previewRange =
      props.mode === 'range' && pendingRange.from && !pendingRange.to && hoverDate
        ? {
            from: pendingRange.from,
            to: hoverDate,
          }
        : null;

    // ── Trigger ──
    // The trigger is wrapped in an inline-flex div so the optional
    // clear button can sit alongside it as a sibling button (nesting
    // a real <button> inside another <button> is invalid HTML). The
    // wrapper has no visual role of its own — all chrome lives on
    // the inner trigger.
    const wrapperClass = ['ui-calendar', className].filter(Boolean).join(' ');
    const triggerClass = [
      'ui-calendar__trigger',
      `ui-calendar__trigger--${size}`,
      open && 'ui-calendar__trigger--open',
      disabled && 'ui-calendar__trigger--disabled',
      !triggerLabel && 'ui-calendar__trigger--placeholder',
      hasValue && !disabled && 'ui-calendar__trigger--has-clear',
    ]
      .filter(Boolean)
      .join(' ');

    const setTriggerRef = (node: HTMLButtonElement | null) => {
      triggerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref && 'current' in ref) {
        (ref as { current: HTMLButtonElement | null }).current = node;
      }
    };

    const handleTriggerClick = (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (disabled) return;
      setOpen(!open);
    };

    return (
      <>
        <div className={wrapperClass}>
          <button
            ref={setTriggerRef}
            type="button"
            id={id}
            name={name}
            className={triggerClass}
            onClick={handleTriggerClick}
            disabled={disabled}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={ariaLabel}
          >
            <span className="material-symbols-rounded ui-calendar__icon" aria-hidden>
              calendar_today
            </span>
            <span className="ui-calendar__value">
              {triggerLabel || (
                <span className="ui-calendar__placeholder">{placeholder}</span>
              )}
            </span>
          </button>
          {hasValue && !disabled && (
            <button
              type="button"
              className="ui-calendar__clear"
              onClick={handleClear}
              aria-label="Rensa val"
            >
              <span className="material-symbols-rounded" aria-hidden>
                close
              </span>
            </button>
          )}
        </div>

        {open &&
          (() => {
            const portalRoot = getAdminPortalRoot();
            if (!portalRoot) return null;
            return createPortal(
            <div
              ref={popoverRef}
              role="dialog"
              aria-label="Välj datum"
              className="ui-calendar__popover"
              style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
              }}
            >
              <CalendarHeader
                viewMonth={viewMonth}
                onPrev={() => setViewMonth((v) => addMonths(v, -1))}
                onNext={() => setViewMonth((v) => addMonths(v, 1))}
              />
              <CalendarGrid
                grid={grid}
                viewMonth={viewMonth}
                today={today}
                mode={props.mode}
                singleValue={pendingSingle}
                rangeValue={pendingRange}
                previewRange={previewRange}
                minDate={minDate}
                maxDate={maxDate}
                onDayClick={handleDayClick}
                onDayHover={(d) =>
                  props.mode === 'range' ? setHoverDate(d) : undefined
                }
              />
              <div className="ui-calendar__footer">
                <button
                  type="button"
                  className="ui-calendar__apply"
                  onClick={handleApply}
                >
                  Använd
                </button>
              </div>
            </div>,
            portalRoot,
          );
          })()}
      </>
    );
  },
);

Calendar.displayName = 'Calendar';

// ── Header (month label + navigation) ──────────────────────────

function CalendarHeader({
  viewMonth,
  onPrev,
  onNext,
}: {
  viewMonth: Date;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="ui-calendar__header">
      <span className="ui-calendar__month-label" aria-live="polite">
        {formatMonthYear(viewMonth)}
      </span>
      <div className="ui-calendar__nav-group">
        <button
          type="button"
          className="ui-calendar__nav"
          onClick={onPrev}
          aria-label="Föregående månad"
        >
          <span className="material-symbols-rounded" aria-hidden>
            chevron_left
          </span>
        </button>
        <button
          type="button"
          className="ui-calendar__nav"
          onClick={onNext}
          aria-label="Nästa månad"
        >
          <span className="material-symbols-rounded" aria-hidden>
            chevron_right
          </span>
        </button>
      </div>
    </div>
  );
}

// ── Grid (weekday headers + 42 day cells) ──────────────────────

function CalendarGrid({
  grid,
  viewMonth,
  today,
  mode,
  singleValue,
  rangeValue,
  previewRange,
  minDate,
  maxDate,
  onDayClick,
  onDayHover,
}: {
  grid: Date[];
  viewMonth: Date;
  today: Date;
  mode: CalendarMode;
  singleValue: Date | null;
  rangeValue: DateRange;
  previewRange: { from: Date; to: Date } | null;
  minDate?: Date;
  maxDate?: Date;
  onDayClick: (d: Date) => void;
  onDayHover?: (d: Date | null) => void;
}) {
  return (
    <div role="grid" className="ui-calendar__grid">
      <div role="row" className="ui-calendar__weekdays">
        {WEEKDAYS_MON_FIRST.map((wd, i) => (
          // Index-based key — single-letter abbreviations have
          // duplicates (T appears twice for Tis/Tor; positional
          // index disambiguates).
          <span key={i} role="columnheader" className="ui-calendar__weekday">
            {wd}
          </span>
        ))}
      </div>
      <div role="row" className="ui-calendar__days">
        {grid.map((date) => {
          const inMonth = isSameMonth(date, viewMonth);
          const isToday = isSameDay(date, today);
          const dayDisabled = !isWithinBounds(date, minDate, maxDate);

          const isSelected =
            mode === 'single'
              ? isSameDay(date, singleValue)
              : isSameDay(date, rangeValue.from) || isSameDay(date, rangeValue.to);

          // In-range = selected + everything strictly between in range mode
          let inRange = false;
          let isRangeStart = false;
          let isRangeEnd = false;
          if (mode === 'range') {
            const effectiveFrom = rangeValue.from ?? previewRange?.from ?? null;
            const effectiveTo = rangeValue.to ?? previewRange?.to ?? null;
            if (effectiveFrom && effectiveTo) {
              inRange = isBetween(date, effectiveFrom, effectiveTo);
              const start =
                compareDays(effectiveFrom, effectiveTo) <= 0
                  ? effectiveFrom
                  : effectiveTo;
              const end =
                compareDays(effectiveFrom, effectiveTo) <= 0
                  ? effectiveTo
                  : effectiveFrom;
              isRangeStart = isSameDay(date, start);
              isRangeEnd = isSameDay(date, end);
            }
          }

          const cls = [
            'ui-calendar__day',
            !inMonth && 'ui-calendar__day--outside',
            isToday && 'ui-calendar__day--today',
            isSelected && 'ui-calendar__day--selected',
            inRange && !isSelected && 'ui-calendar__day--in-range',
            isRangeStart && 'ui-calendar__day--range-start',
            isRangeEnd && 'ui-calendar__day--range-end',
            dayDisabled && 'ui-calendar__day--disabled',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={date.toISOString()}
              type="button"
              role="gridcell"
              className={cls}
              onClick={() => !dayDisabled && onDayClick(date)}
              onMouseEnter={() => onDayHover?.(date)}
              onMouseLeave={() => onDayHover?.(null)}
              disabled={dayDisabled}
              aria-selected={isSelected || undefined}
              aria-current={isToday ? 'date' : undefined}
              aria-disabled={dayDisabled || undefined}
              tabIndex={isSelected || (isToday && !singleValue && !rangeValue.from) ? 0 : -1}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
