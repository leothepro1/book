"use client";

import type { SettingField } from "@/app/(guest)/_lib/themes/types";

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
};

export function FieldToggle({ field, value, onChange }: Props) {
  const checked = (value as boolean) ?? (field.default as boolean) ?? false;

  return (
    <div className="sf-field sf-field--toggle">
      <div className="sf-toggle-row">
        <label className="sf-label sf-label--inline" htmlFor={`sf-${field.key}`}>
          {field.label}
        </label>
        <button
          id={`sf-${field.key}`}
          type="button"
          role="switch"
          aria-checked={checked}
          className={`sf-toggle${checked ? " sf-toggle--on" : ""}`}
          onClick={() => onChange(field.key, !checked)}
        >
          <span className="sf-toggle__icon sf-toggle__icon--check material-symbols-rounded">check</span>
          <span className="sf-toggle__icon sf-toggle__icon--remove material-symbols-rounded">remove</span>
          <span className="sf-toggle__thumb" />
        </button>
      </div>
      {field.description && (
        <p className="sf-desc">{field.description}</p>
      )}
    </div>
  );
}
