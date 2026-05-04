"use client";

import { useId } from "react";

/**
 * Admin Checkbox — single checkbox with label + optional helptext.
 *
 * Native `<input type="checkbox">` underneath; `accent-color:
 * var(--admin-accent)` styles the box. Full row is clickable via
 * the surrounding `<label>`. Helptext renders under the label and
 * stays inside the click target.
 */

type CheckboxProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  ariaLabel?: string;
};

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
  ariaLabel,
}: CheckboxProps) {
  const id = useId();
  return (
    <label htmlFor={id} className="admin-checkbox-row">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
        className="admin-checkbox-input"
      />
      <span className="admin-checkbox-text">
        <span className="admin-checkbox-label">{label}</span>
        {description && (
          <span className="admin-checkbox-desc">{description}</span>
        )}
      </span>
    </label>
  );
}
