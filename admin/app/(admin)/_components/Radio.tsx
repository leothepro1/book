"use client";

import { useId } from "react";

/**
 * Admin Radio — single radio with optional label.
 *
 * Group multiple `<Radio>` siblings by passing the same `name` prop.
 * The full clickable area is the surrounding `<label>`, so the user
 * can hit either the disc or the text. Native `<input type="radio">`
 * underneath — `accent-color: var(--admin-accent)` styles the
 * indicator; no DIV-fake disc needed.
 *
 * Accessibility: real input + label association via `htmlFor`. Use
 * a `<fieldset>`/`<legend>` in the consumer when the group has a
 * heading — see /ui-lab for the canonical group pattern.
 */

type RadioProps = {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  label: string;
  description?: string;
  disabled?: boolean;
};

export function Radio({
  name,
  value,
  checked,
  onChange,
  label,
  description,
  disabled,
}: RadioProps) {
  const id = useId();
  return (
    <label htmlFor={id} className="admin-radio-row">
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="admin-radio-input"
      />
      <span className="admin-radio-text">
        <span className="admin-radio-label">{label}</span>
        {description && (
          <span className="admin-radio-desc">{description}</span>
        )}
      </span>
    </label>
  );
}
