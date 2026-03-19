"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import type { CheckinCardComponentProps } from "@/app/_lib/checkin-cards/types";
import { registerCardComponent } from "./registry";
import { ErrorSlide } from "./ErrorSlide";
import { useDropdownPosition } from "./useDropdownPosition";

const OPTIONS = [
  { value: "semester", label: "Semester" },
  { value: "business", label: "Affärsresa" },
  { value: "konferens", label: "Konferens" },
  { value: "annat", label: "Annat" },
] as const;

function PurposeOfStayCard({ value, onChange, onValidChange, disabled, optional, showError }: CheckinCardComponentProps) {
  const [selected, setSelected] = useState<string>((value as string) || "");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pos = useDropdownPosition(triggerRef, open, 220);

  const isValid = selected !== "";

  useEffect(() => {
    onValidChange(isValid);
  }, [isValid, onValidChange]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: Event) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", handler, true);
    return () => window.removeEventListener("scroll", handler, true);
  }, [open]);

  const selectedLabel = OPTIONS.find((o) => o.value === selected)?.label;

  function handleSelect(val: string) {
    setSelected(val);
    onChange(val);
    setOpen(false);
  }

  const hasError = !!showError && !isValid;

  return (
    <div className="checkin-card">
      <div className="checkin-card__label-row">
        <span className="checkin-card__label">Syfte med vistelsen</span>
        {optional && <span className="checkin-card__optional">Valfritt</span>}
      </div>
      <div className="checkin-card__body">
        <button
          ref={triggerRef}
          type="button"
          className={`eta-trigger${selected ? " eta-trigger--set" : ""}${hasError ? " eta-trigger--error" : ""}`}
          onClick={() => { if (!disabled) setOpen(!open); }}
          disabled={disabled}
        >
          <span className="eta-trigger__text">{selectedLabel || "Välj"}</span>
          <span className="material-symbols-rounded eta-trigger__chevron">expand_more</span>
        </button>

        <ErrorSlide
          message="Välj syfte med din vistelse"
          visible={hasError}
        />

        {open && pos && typeof document !== "undefined" && createPortal(
          <div
            ref={dropdownRef}
            className={`phone-dropdown${pos.direction === "up" ? " phone-dropdown--up" : ""}`}
            style={{
              position: "fixed",
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
              ...(pos.direction === "up" ? { bottom: pos.bottom } : { top: pos.top }),
            }}
          >
            <div className="phone-dropdown__list" style={{ maxHeight: pos.maxHeight - 10 }}>
              {OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`phone-dropdown__item${selected === opt.value ? " phone-dropdown__item--active" : ""}`}
                  onClick={() => handleSelect(opt.value)}
                >
                  <span className="phone-dropdown__name">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
      </div>
    </div>
  );
}

registerCardComponent("purposeOfStay", PurposeOfStayCard);
export default PurposeOfStayCard;
