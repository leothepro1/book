"use client";

import { useState, useRef, useEffect } from "react";
import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { FieldWrapper } from "./FieldRenderer";

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
};

export function FieldSelect({ field, value, onChange }: Props) {
  const options = field.options ?? [];
  const current = (value as string) ?? (field.default as string) ?? "";
  const selectedOption = options.find((o) => o.value === current);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <FieldWrapper field={field}>
      <div className="sf-dropdown" ref={ref}>
        <button
          type="button"
          className="sf-dropdown__trigger"
          onClick={() => setOpen(!open)}
        >
          <span className="sf-dropdown__text">
            {selectedOption?.label || current}
          </span>
          <svg className="sf-dropdown__chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <ul className="sf-dropdown__menu">
            {options.map((opt) => (
              <li
                key={opt.value}
                className={`sf-dropdown__item${opt.value === current ? " sf-dropdown__item--active" : ""}`}
                onClick={() => {
                  onChange(field.key, opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </FieldWrapper>
  );
}
