'use client';

import { forwardRef, type MouseEvent, type ReactNode } from 'react';
import './Radio.css';

/**
 * Radio — round single-select primitive.
 *
 * Mirrors `Checkbox`'s structure exactly: a `<button role="radio">`
 * with an outer "box" (round here, square in Checkbox) and an
 * animated inner indicator (a filled dot here, an SVG check in
 * Checkbox). Visual reference: the rabattkod radio rows in
 * `DiscountForm` (`.disc-radio`) — same outer ring, same dark
 * filled centre on active.
 *
 * "Grow" transition: the inner dot scales from `0` to `1` with a
 * gentle spring curve when the radio activates. Matches Material /
 * iOS / Polaris radio-fill animations and reads as a confirmation
 * cue without being noisy.
 *
 * Radio semantics (vs Checkbox):
 *   - `onChange` only fires when transitioning false → true.
 *     Clicking an already-active radio is a no-op (matches native
 *     radio behaviour). Group state is owned by the parent — wrap
 *     N <Radio>s and key them off a single value.
 *
 * Renders a `<button role="radio">` rather than a real
 * `<input type="radio">` for the same reason as Checkbox: custom
 * SVG / shape contracts that `appearance: none` can't reliably hide.
 */

export type RadioSize = 'sm' | 'md' | 'lg';

export type RadioProps = {
  checked: boolean;
  /** Fired only on false → true transition (radio semantics). */
  onChange: (next: boolean) => void;
  label?: ReactNode;
  size?: RadioSize;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

export const Radio = forwardRef<HTMLButtonElement, RadioProps>(function Radio(
  {
    checked,
    onChange,
    label,
    size = 'md',
    disabled = false,
    className,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  },
  ref,
) {
  const cls = ['ui-radio-row', `ui-radio-row--${size}`, className]
    .filter(Boolean)
    .join(' ');
  const boxCls = [
    'ui-radio',
    `ui-radio--${size}`,
    checked && 'ui-radio--checked',
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    // stopPropagation prevents accidental row-click handlers (list
    // rows, settings rows) from re-toggling on top of us. Same
    // pattern as Checkbox.
    e.stopPropagation();
    if (disabled || checked) return;
    onChange(true);
  };

  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      disabled={disabled}
      onClick={handleClick}
      className={cls}
    >
      <span className={boxCls}>
        <span className="ui-radio__dot" aria-hidden />
      </span>
      {label !== undefined && label !== null && (
        <span className="ui-radio__label">{label}</span>
      )}
    </button>
  );
});

Radio.displayName = 'Radio';
