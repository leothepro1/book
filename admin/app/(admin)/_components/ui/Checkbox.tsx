'use client';

import { forwardRef, type MouseEvent, type ReactNode } from 'react';
import './Checkbox.css';

/**
 * Checkbox — square checkbox primitive. Matches the legacy
 * `.fac-check` look (user-validated 10/10): 18×18 box with 4px
 * radius, 1.5px border, white fill when off, dark-primary fill +
 * border when on, and an animated SVG stroke-draw on activation.
 *
 * Renders a native `<button role="checkbox">` rather than a real
 * `<input type="checkbox">` because the visual contract here
 * relies on a custom `<svg>` checkmark — nesting an input inside
 * a styled wrapper would either need `appearance: none` (browser-
 * inconsistent) or a hidden-input + visible-box dance. The
 * role="checkbox" + aria-checked combo is spec-correct and reads
 * the same to assistive tech.
 *
 * Pass `label` to render the click-target as a row (label + box,
 * whole row clickable). Omit it for a bare box that consumers
 * compose into their own row layout.
 *
 * Hover behaviour: the unchecked box darkens its border on hover
 * for affordance. The checked box does NOT change on hover — the
 * checked state is the "active" state and an extra hover treatment
 * just adds noise.
 */

export type CheckboxProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(
  function Checkbox(
    {
      checked,
      onChange,
      label,
      disabled = false,
      className,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
    },
    ref,
  ) {
    const cls = ['ui-checkbox-row', className].filter(Boolean).join(' ');
    const boxCls = ['ui-checkbox', checked && 'ui-checkbox--checked']
      .filter(Boolean)
      .join(' ');

    const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
      // stopPropagation prevents accidental row-click handlers (list
      // rows, settings rows) from re-toggling on top of us.
      e.stopPropagation();
      if (disabled) return;
      onChange(!checked);
    };

    return (
      <button
        ref={ref}
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        disabled={disabled}
        onClick={handleClick}
        className={cls}
      >
        <span className={boxCls}>
          <svg
            width="10"
            height="8"
            viewBox="0 0 10 8"
            fill="none"
            className="ui-checkbox__icon"
            aria-hidden
          >
            <path
              d="M1 4L3.5 6.5L9 1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        {label !== undefined && label !== null && (
          <span className="ui-checkbox__label">{label}</span>
        )}
      </button>
    );
  },
);

Checkbox.displayName = 'Checkbox';
