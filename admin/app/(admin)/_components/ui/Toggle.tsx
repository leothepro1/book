'use client';

import { forwardRef, type MouseEvent } from 'react';
import './Toggle.css';

/**
 * Toggle — iOS-style switch primitive. A native `<button role="switch">`
 * with a sliding thumb and a check icon that fades in when on.
 *
 * Architecture: same visual contract as the existing
 * `_components/Toggle.tsx` (which keeps the `.admin-toggle` legacy
 * classes for unmigrated call-sites). This `ui/` version is the
 * canonical primitive going forward — uses BEM `.ui-toggle*` and
 * the `--toggle-*` / `--admin-toggle-*` token set.
 *
 * Sizes: `md` (default — 43×24) and `sm` (36×20). Track colour is
 * `--admin-toggle-off` when unchecked, `--admin-toggle-on` (blue
 * accent) when checked. Thumb is white with a subtle shadow.
 *
 * A11y: `role="switch"` + `aria-checked` is the spec-correct combo
 * (preferred over `role="checkbox"` for binary on/off states). Pass
 * `aria-label` when the toggle has no visible label, otherwise pair
 * it with a sibling `<label>` via `aria-labelledby`.
 *
 * Controlled-only: there is no `defaultChecked`. The value of a
 * setting toggle is almost always derived from server state, so the
 * uncontrolled pattern would invite drift. Add it later if a real
 * use case demands.
 */

export type ToggleSize = 'sm' | 'md';

export type ToggleProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  size?: ToggleSize;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  function Toggle(
    {
      checked,
      onChange,
      size = 'md',
      disabled = false,
      className,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
    },
    ref,
  ) {
    const cls = [
      'ui-toggle',
      `ui-toggle--${size}`,
      checked && 'ui-toggle--checked',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
      // stopPropagation prevents accidental row-click handlers
      // (settings rows, list items) from re-toggling on top of us.
      e.stopPropagation();
      if (disabled) return;
      onChange(!checked);
    };

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        disabled={disabled}
        onClick={handleClick}
        className={cls}
      >
        <span className="ui-toggle__thumb" />
      </button>
    );
  },
);

Toggle.displayName = 'Toggle';
