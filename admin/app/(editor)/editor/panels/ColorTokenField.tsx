"use client";

/**
 * Color Token Field
 * ─────────────────
 * Clickable field row: label on left, hex display + swatch on right.
 * Clicking anywhere on the row opens the ColorPickerPopup.
 * The hex input inside the popup is auto-focused when opened.
 */

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { ColorPickerPopup } from "@/app/(admin)/_components/ColorPicker";

export function ColorTokenField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  return (
    <div className="cs-field">
      <span className="cs-field__label">{label}</span>
      <div
        ref={rowRef}
        className={`cs-field__color-row${pickerOpen ? " cs-field__color-row--active" : ""}`}
        onClick={() => setPickerOpen(!pickerOpen)}
      >
        <span className="cs-field__hex-display">{value.toUpperCase()}</span>
        <span
          className="cs-field__swatch"
          style={{ background: value }}
        />
      </div>
      {pickerOpen &&
        createPortal(
          <ColorPickerPopup
            value={value}
            onChange={onChange}
            onClose={() => setPickerOpen(false)}
            anchorRef={rowRef}
          />,
          document.body,
        )}
    </div>
  );
}
