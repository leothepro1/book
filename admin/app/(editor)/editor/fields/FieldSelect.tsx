"use client";

import { useState, useRef, useEffect } from "react";
import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { FieldWrapper } from "./FieldRenderer";
import { EditorIcon } from "@/app/_components/EditorIcon";

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
          {selectedOption?.icon && (
            <span
              className="material-symbols-rounded"
              style={{ fontSize: 18, fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24" }}
            >
              {selectedOption.icon}
            </span>
          )}
          <span className="sf-dropdown__text">
            {selectedOption?.label || current}
          </span>
          <EditorIcon name="expand_more" size={16} className="sf-dropdown__chevron" />
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
                {opt.icon && (
                  <span
                    className="material-symbols-rounded"
                    style={{ fontSize: 18, fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24" }}
                  >
                    {opt.icon}
                  </span>
                )}
                {opt.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </FieldWrapper>
  );
}
