"use client";

/**
 * Layout Picker Field
 * ───────────────────
 * Image-based popup for visual layout selection.
 * Opens a fixed popup aligned to the trigger's top edge,
 * positioned to the right of the sidebar (same left as pk-popup).
 * Uses iOS-style scale+fade entrance animation.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { FieldWrapper } from "./FieldRenderer";
import { EditorIcon } from "@/app/_components/EditorIcon";

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupTop, setPopupTop] = useState(0);

  const updatePosition = useCallback(() => {
    if (triggerRef.current) {
      setPopupTop(triggerRef.current.getBoundingClientRect().top);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handle = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open]);

  return (
    <FieldWrapper field={field}>
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

      {open && typeof document !== "undefined" && createPortal(
        <div
          className="layout-picker-popup"
          ref={popupRef}
          style={{ top: popupTop }}
        >
          <div className="layout-picker-popup__list">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`layout-picker-popup__item${opt.value === current ? " layout-picker-popup__item--active" : ""}`}
                onClick={() => {
                  onChange(field.key, opt.value);
                  setOpen(false);
                }}
              >
                <img
                  src={opt.image}
                  alt={opt.label}
                  className="layout-picker-popup__thumb"
                />
                <span className="layout-picker-popup__text">
                  <span className="layout-picker-popup__label">{opt.label}</span>
                  {opt.description && <span className="layout-picker-popup__desc">{opt.description}</span>}
                </span>
                <span
                  className={`material-symbols-rounded sf-dropdown__check${opt.value === current ? " sf-dropdown__check--visible" : ""}`}
                >
                  check
                </span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </FieldWrapper>
  );
}
