"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import type { CheckinCardComponentProps } from "@/app/_lib/checkin-cards/types";
import { registerCardComponent } from "./registry";
import { ErrorSlide } from "./ErrorSlide";
import { useDropdownPosition } from "./useDropdownPosition";
import { COUNTRIES, type Country } from "./countries";

function PhoneCard({ value, onChange, onValidChange, disabled, optional, showError }: CheckinCardComponentProps) {
  const [country, setCountry] = useState<Country>(
    () => COUNTRIES.find((c) => c.code === "se") ?? COUNTRIES[0],
  );
  const [number, setNumber] = useState<string>(() => {
    const raw = (value as string) || "";
    for (const c of COUNTRIES) {
      const prefix = c.dial.replace(/-/g, "");
      if (raw.startsWith(prefix)) {
        return raw.slice(prefix.length).trim();
      }
    }
    return raw;
  });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);

  const digits = number.replace(/\D/g, "");
  const isEmpty = digits.length === 0;
  const isTooShort = !isEmpty && digits.length < 6;
  const isValid = digits.length >= 6;

  useEffect(() => {
    const full = `${country.dial} ${number}`.trim();
    onChange(full);
    onValidChange(isValid);
  }, [country, number, onChange, onValidChange, isValid]);

  function handleNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/[^0-9 ]/g, "");
    setNumber(val);
  }

  function handleSelectCountry(c: Country) {
    setCountry(c);
    setDropdownOpen(false);
  }

  const errorMessage = isEmpty
    ? "Ange ditt telefonnummer"
    : isTooShort
      ? "Telefonnumret verkar för kort"
      : null;

  const hasError = !!showError && !isValid;

  return (
    <div className="checkin-card">
      <div className="checkin-card__label-row">
        <span className="checkin-card__label">Telefonnummer</span>
        {optional && <span className="checkin-card__optional">Valfritt</span>}
      </div>
      <div className="checkin-card__body">
        <div ref={inputWrapRef} className={`phone-input${hasError ? " phone-input--error" : ""}`}>
          <button
            ref={triggerRef}
            type="button"
            className="phone-input__trigger"
            onClick={() => { if (!disabled) setDropdownOpen(!dropdownOpen); }}
            disabled={disabled}
          >
            <span className="phone-input__code">{country.code.toUpperCase()}</span>
            <span className="material-symbols-rounded phone-input__chevron">unfold_more</span>
          </button>
          <span className="phone-input__prefix">{country.dial}</span>
          <input
            className="phone-input__number"
            type="tel"
            inputMode="tel"
            value={number}
            onChange={handleNumberChange}
            placeholder="70 123 45 67"
            autoComplete="tel-national"
            disabled={disabled}
          />
        </div>

        <ErrorSlide
          message={errorMessage ?? ""}
          visible={hasError && !!errorMessage}
        />

        {dropdownOpen && typeof document !== "undefined" && createPortal(
          <CountryDropdown
            selected={country}
            anchorRef={inputWrapRef}
            triggerRef={triggerRef}
            onSelect={handleSelectCountry}
            onClose={() => setDropdownOpen(false)}
          />,
          document.body,
        )}
      </div>
    </div>
  );
}

// ── Country Dropdown ─────────────────────────────────────────

function CountryDropdown({
  selected,
  anchorRef,
  triggerRef,
  onSelect,
  onClose,
}: {
  selected: Country;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onSelect: (c: Country) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pos = useDropdownPosition(anchorRef, true);

  useEffect(() => {
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      ) return;
      onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, triggerRef]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: Event) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("scroll", handler, true);
    return () => window.removeEventListener("scroll", handler, true);
  }, [onClose]);

  useEffect(() => {
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector("[data-selected]");
      if (el) el.scrollIntoView({ block: "center" });
    });
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return COUNTRIES;
    const q = search.toLowerCase();
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dial.includes(q),
    );
  }, [search]);

  if (!pos) return null;

  return (
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
      <div className="phone-dropdown__search">
        <span className="material-symbols-rounded phone-dropdown__search-icon">search</span>
        <input
          ref={searchRef}
          type="text"
          className="phone-dropdown__search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök land..."
        />
      </div>
      <div ref={listRef} className="phone-dropdown__list">
        {filtered.length === 0 && (
          <div className="phone-dropdown__empty">Inga resultat</div>
        )}
        {filtered.map((c) => (
          <button
            key={c.code}
            type="button"
            className={`phone-dropdown__item${c.code === selected.code ? " phone-dropdown__item--active" : ""}`}
            onClick={() => onSelect(c)}
            {...(c.code === selected.code ? { "data-selected": "" } : {})}
          >
            <span className="phone-dropdown__name">{c.name}</span>
            <span className="phone-dropdown__dial">{c.dial}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

registerCardComponent("phone", PhoneCard);
export default PhoneCard;
