'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Input } from './Input';
import './Slider.css';

/**
 * Slider — single-value horizontal range control.
 *
 * Lift-and-shift of the editor's `FieldRange` (sf-range) pattern.
 * A thin track with a 15×15 thumb that drags with pointer events.
 * On hover/active the thumb gains a soft halo + a pin tooltip
 * showing the current value (with optional unit). Optional number
 * input rendered to the right — opt out via `showInput={false}` for
 * cases where the slider stands alone.
 *
 * Local-while-dragging pattern: the thumb tracks `localValue` while
 * the pointer is down, calling onChange on every step. On release
 * (pointerup), the controlled `value` from the parent re-syncs.
 * This decouples React render rhythm from drag fidelity.
 *
 * Controlled OR uncontrolled. forwardRef points at the track div
 * (the most useful element for measurement).
 *
 * Keyboard a11y:
 *   ←/↓        decrement by step
 *   →/↑        increment by step
 *   Home       jump to min
 *   End        jump to max
 *   PageUp     +10×step
 *   PageDown   −10×step
 */

export type SliderProps = {
  value?: number;
  defaultValue?: number;
  onChange?: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Unit suffix shown in the pin tooltip and input (e.g. "px", "%"). */
  unit?: string;
  /** Render a number input next to the slider. Default `true`. */
  showInput?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

function clampToStep(raw: number, min: number, max: number, step: number): number {
  const snapped = Math.round((raw - min) / step) * step + min;
  const clamped = Math.max(min, Math.min(max, snapped));
  // Fix floating-point drift from /* * step
  return +clamped.toFixed(4);
}

export const Slider = forwardRef<HTMLDivElement, SliderProps>(function Slider(
  {
    value: valueProp,
    defaultValue,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    unit = '',
    showInput = true,
    disabled = false,
    className,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  },
  ref,
) {
  const isControlled = valueProp !== undefined;
  const [internalValue, setInternalValue] = useState<number>(
    defaultValue ?? min,
  );
  const value = isControlled ? (valueProp as number) : internalValue;

  const commit = useCallback(
    (next: number) => {
      if (!isControlled) setInternalValue(next);
      onChange?.(next);
    },
    [isControlled, onChange],
  );

  // ── Drag state ──
  // `active` enables pointer-move tracking + applies the active
  // visual state (halo, pin tooltip, grabbing cursor). `localValue`
  // mirrors the parent during idle and tracks the drag while active
  // so the thumb position stays in sync with the pointer even if
  // the parent throttles state updates.
  const [active, setActive] = useState(false);
  const [localValue, setLocalValue] = useState<number>(value);

  useEffect(() => {
    if (!active) setLocalValue(value);
  }, [value, active]);

  const displayValue = active ? localValue : value;
  const pct = max === min ? 0 : ((displayValue - min) / (max - min)) * 100;

  // ── Refs ──
  const trackRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => trackRef.current as HTMLDivElement, []);

  // ── Pointer handlers ──
  const resolveFromX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track) return displayValue;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = min + ratio * (max - min);
      return clampToStep(raw, min, max, step);
    },
    [displayValue, min, max, step],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setActive(true);
      const next = resolveFromX(e.clientX);
      setLocalValue(next);
      if (next !== value) commit(next);
    },
    [disabled, resolveFromX, value, commit],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!active || disabled) return;
      const next = resolveFromX(e.clientX);
      setLocalValue(next);
      if (next !== value) commit(next);
    },
    [active, disabled, resolveFromX, value, commit],
  );

  const handlePointerUp = useCallback(() => setActive(false), []);

  // ── Keyboard handler ──
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      let next: number | null = null;
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          next = clampToStep(value - step, min, max, step);
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          next = clampToStep(value + step, min, max, step);
          break;
        case 'Home':
          next = min;
          break;
        case 'End':
          next = max;
          break;
        case 'PageUp':
          next = clampToStep(value + step * 10, min, max, step);
          break;
        case 'PageDown':
          next = clampToStep(value - step * 10, min, max, step);
          break;
      }
      if (next !== null) {
        e.preventDefault();
        if (next !== value) commit(next);
      }
    },
    [disabled, value, step, min, max, commit],
  );

  // ── Number input handler ──
  // Input's onChange signature is `(next: string) => void`. Parse,
  // clamp, and commit; ignore non-numeric typing (transient mid-edit
  // states like "-" or "1e").
  const handleInputChange = (next: string) => {
    if (next === '') return;
    const v = Number(next);
    if (Number.isNaN(v)) return;
    commit(Math.max(min, Math.min(max, v)));
  };

  const cls = ['ui-slider', disabled && 'ui-slider--disabled', className]
    .filter(Boolean)
    .join(' ');

  const thumbCls = [
    'ui-slider__thumb',
    active && 'ui-slider__thumb--active',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls}>
      <div
        ref={trackRef}
        className="ui-slider__track"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="ui-slider__fill" style={{ width: `${pct}%` }} />
        <div
          className={thumbCls}
          style={{ left: `${pct}%` }}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={displayValue}
          aria-valuetext={unit ? `${displayValue}${unit}` : undefined}
          aria-orientation="horizontal"
          aria-disabled={disabled || undefined}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          onKeyDown={handleKeyDown}
        >
          <div className="ui-slider__pin">
            <span className="ui-slider__pin-value">
              {displayValue}
              {unit}
            </span>
          </div>
        </div>
      </div>
      {showInput && (
        <div className="ui-slider__input-wrap">
          <Input
            type="number"
            size="sm"
            value={String(value)}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            suffix={unit || undefined}
            onChange={handleInputChange}
            aria-label={ariaLabel ?? 'Värde'}
          />
        </div>
      )}
    </div>
  );
});

Slider.displayName = 'Slider';
