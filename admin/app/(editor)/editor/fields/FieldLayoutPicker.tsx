"use client";

/**
 * Layout Picker Field
 * ───────────────────
 * Image-based dropdown for visual layout selection.
 * Used by locked sections and any section that offers distinct
 * visual layouts (e.g. horizontal vs vertical card arrangement).
 *
 * Reads options from `field.layoutOptions[]`, each with:
 *   - value: stored config value
 *   - label: display text
 *   - image: thumbnail URL (Cloudinary or similar)
 *
 * Follows the same dropdown pattern as FieldSelect but renders
 * image thumbnails instead of text/icon options.
 */

import { useState, useRef, useEffect } from "react";
import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { FieldWrapper } from "./FieldRenderer";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { useDropDirection } from "../hooks/useDropDirection";

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
};

export function FieldLayoutPicker({ field, value, onChange }: Props) {
  const options = field.layoutOptions ?? [];
  const current = (value as string) ?? (field.default as string) ?? "";
  const selected = options.find((o) => o.value === current);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dir = useDropDirection(triggerRef, open);

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
          ref={triggerRef}
          type="button"
          className="sf-layout-picker__trigger"
          onClick={() => setOpen(!open)}
        >
          {selected?.image && (
            <img
              src={selected.image}
              alt={selected.label}
              className="sf-layout-picker__thumb"
            />
          )}
          <span className="sf-dropdown__text">
            {selected?.label || current}
          </span>
          <EditorIcon name="expand_more" size={16} className="sf-dropdown__chevron" />
        </button>
        {open && (
          <ul className={`sf-dropdown__menu${dir === "up" ? " sf-dropdown__menu--up" : ""}`}>
            {options.map((opt) => (
              <li
                key={opt.value}
                className={`sf-layout-picker__item${opt.value === current ? " sf-layout-picker__item--active" : ""}`}
                onClick={() => {
                  onChange(field.key, opt.value);
                  setOpen(false);
                }}
              >
                <img
                  src={opt.image}
                  alt={opt.label}
                  className="sf-layout-picker__thumb"
                />
                <span style={{ flex: 1 }}>{opt.label}</span>
                <span
                  className={`material-symbols-rounded sf-dropdown__check${opt.value === current ? " sf-dropdown__check--visible" : ""}`}
                >
                  check
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FieldWrapper>
  );
}
