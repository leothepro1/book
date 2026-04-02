"use client";

/**
 * FieldProductPicker — Product selection with actions dropdown + replace popup.
 *
 * Identical interaction pattern to FieldCollectionPicker/FieldMenuPicker:
 *   - No product selected: "Välj produkt" button → opens replace popup
 *   - Product selected: sf-dropdown trigger → actions (Ersätt / Ta bort)
 *
 * Data fetched via server action (getProductSummaries) on mount.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { FieldWrapper } from "./FieldRenderer";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { useDropDirection } from "../hooks/useDropDirection";
import {
  getProductSummaries,
  type ProductSummary,
} from "@/app/_lib/products/actions";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
};

export function FieldProductPicker({ field, value, onChange }: Props) {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [actionsOpen, setActionsOpen] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const dir = useDropDirection(triggerRef, actionsOpen);
  const [popupTop, setPopupTop] = useState(0);

  const selectedId = (value as string) || "";
  const selected = products.find((p) => p.id === selectedId);

  const removeTimeRef = useRef(0);

  // Fetch products on mount
  useEffect(() => {
    getProductSummaries()
      .then((data) => setProducts(data))
      .catch(() => setProducts([]))
      .finally(() => setLoaded(true));
  }, []);

  // Close actions on outside click
  useEffect(() => {
    if (!actionsOpen) return;
    const handler = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setActionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [actionsOpen]);

  // Close popup on outside click
  useEffect(() => {
    if (!popupOpen) return;
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setPopupOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popupOpen]);

  // Close popup on Escape
  useEffect(() => {
    if (!popupOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setPopupOpen(false); setSearch(""); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [popupOpen]);

  const openPopup = useCallback(() => {
    if (Date.now() - removeTimeRef.current < 300) return;
    setActionsOpen(false);
    setSearch("");
    setLoading(true);
    if (triggerRef.current) {
      setPopupTop(triggerRef.current.getBoundingClientRect().top);
    }
    setPopupOpen(true);
    getProductSummaries()
      .then((data) => { setProducts(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleSelect = (productId: string) => {
    onChange(field.key, productId);
    setPopupOpen(false);
    setSearch("");
  };

  const handleRemove = () => {
    removeTimeRef.current = Date.now();
    onChange(field.key, "");
    setActionsOpen(false);
  };

  const query = search.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    if (!query) return products;
    return products.filter((p) => p.title.toLowerCase().includes(query));
  }, [products, query]);

  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!query) { setSearchLoading(false); return; }
    setSearchLoading(true);
    searchTimerRef.current = setTimeout(() => setSearchLoading(false), 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [query]);

  const showSkeleton = loading || searchLoading;

  const popupContent = popupOpen && typeof document !== "undefined" && createPortal(
    <div
      className="fmp-popup"
      ref={popupRef}
      style={{ top: popupTop }}
    >
      <div className="fmp-popup__search">
        <EditorIcon name="search" size={16} style={{ color: "var(--admin-text-secondary)", flexShrink: 0 }} />
        <input
          type="text"
          className="fmp-popup__search-input"
          placeholder="Sök produkt…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button type="button" className="fmp-popup__search-clear" onClick={() => setSearch("")}>
            <EditorIcon name="close" size={14} />
          </button>
        )}
      </div>

      <div className="fmp-popup__list">
        {showSkeleton ? (
          <>
            <div className="fmp-popup__skeleton" />
            <div className="fmp-popup__skeleton" />
            <div className="fmp-popup__skeleton" />
          </>
        ) : filteredProducts.length === 0 ? (
          <div className="fmp-popup__empty">
            {!loaded ? "Laddar…" : "Inga produkter"}
          </div>
        ) : (
          filteredProducts.map((prod) => (
            <button
              key={prod.id}
              type="button"
              className={`fmp-popup__item${prod.id === selectedId ? " fmp-popup__item--active" : ""}`}
              onClick={() => handleSelect(prod.id)}
            >
              <span className="fmp-popup__item-title">
                {prod.title}
                {prod.price > 0 && (
                  <span style={{ color: "var(--admin-text-tertiary)", marginLeft: 6, fontSize: 12 }}>
                    {formatPriceDisplay(prod.price, prod.currency)} kr
                  </span>
                )}
              </span>
              {prod.id === selectedId && (
                <span className="material-symbols-rounded sf-dropdown__check sf-dropdown__check--visible">check</span>
              )}
            </button>
          ))
        )}
      </div>

      <a
        href="/products"
        target="_blank"
        rel="noopener noreferrer"
        className="fmp-popup__create"
      >
        <EditorIcon name="add_circle" size={16} />
        <span>Skapa produkt</span>
      </a>
    </div>,
    document.body,
  );

  return (
    <FieldWrapper field={field}>
      <div className="sf-dropdown" ref={actionsRef}>
        {selected ? (
          <button
            ref={triggerRef}
            type="button"
            className="sf-dropdown__trigger"
            onClick={() => setActionsOpen(!actionsOpen)}
          >
            <span className="sf-dropdown__text">{selected.title}</span>
            <EditorIcon name="expand_more" size={16} className="sf-dropdown__chevron" />
          </button>
        ) : (
          <button
            ref={triggerRef}
            type="button"
            className="fmp-select-btn"
            onClick={openPopup}
          >
            Välj produkt
          </button>
        )}

        {actionsOpen && selected && (
          <ul className={`sf-dropdown__menu${dir === "up" ? " sf-dropdown__menu--up" : ""}`}>
            <li className="sf-dropdown__item" onClick={openPopup}>
              <EditorIcon name="replay" size={18} />
              <span style={{ flex: 1 }}>Ersätt</span>
            </li>
            <li className="sf-dropdown__item" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleRemove(); }}>
              <EditorIcon name="remove" size={18} />
              <span style={{ flex: 1 }}>Ta bort</span>
            </li>
          </ul>
        )}
      </div>
      {popupContent}
    </FieldWrapper>
  );
}
