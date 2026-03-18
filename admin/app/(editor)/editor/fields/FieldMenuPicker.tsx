"use client";

/**
 * FieldMenuPicker — Menu selection with actions dropdown + replace popup.
 *
 * Two states:
 *   - No menu selected: "Välj meny" button → opens replace popup directly
 *   - Menu selected: sf-dropdown trigger → actions (Ersätt/Redigera/Ta bort)
 *
 * Replace popup:
 *   - Fixed popup (same position + animation as layout picker)
 *   - Search input + menu list + "Skapa meny" link
 *   - Skeleton shimmer while loading
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { usePreview } from "@/app/(admin)/_components/GuestPreview";
import { FieldWrapper } from "./FieldRenderer";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { useDropDirection } from "../hooks/useDropDirection";

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
};

export function FieldMenuPicker({ field, value, onChange }: Props) {
  const { config } = usePreview();
  const menus = config?.menus ?? [];

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
  const selected = menus.find((m) => m.id === selectedId);

  // Guard: timestamp of last removal to prevent ghost click on "Välj meny"
  const removeTimeRef = useRef(0);

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
    // Simulate brief load for skeleton
    setTimeout(() => setLoading(false), 400);
  }, []);

  const handleSelect = (menuId: string) => {
    onChange(field.key, menuId);
    setPopupOpen(false);
    setSearch("");
  };

  const handleRemove = () => {
    removeTimeRef.current = Date.now();
    onChange(field.key, "");
    setActionsOpen(false);
  };

  const handleEdit = () => {
    setActionsOpen(false);
    window.open("/menus", "_blank");
  };

  // Filter menus by search (with brief loading state)
  const query = search.trim().toLowerCase();
  const filteredMenus = useMemo(() => {
    if (!query) return menus;
    return menus.filter((m) => m.title.toLowerCase().includes(query));
  }, [menus, query]);

  // Show skeleton briefly when searching
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    if (!query) { setSearchLoading(false); return; }
    setSearchLoading(true);
    searchTimerRef.current = setTimeout(() => setSearchLoading(false), 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [query]);

  const showSkeleton = loading || searchLoading;

  // Popup content (shared between both states)
  const popupContent = popupOpen && typeof document !== "undefined" && createPortal(
    <div
      className="fmp-popup"
      ref={popupRef}
      style={{ top: popupTop }}
    >
      {/* Search */}
      <div className="fmp-popup__search">
        <EditorIcon name="search" size={16} style={{ color: "var(--admin-text-secondary)", flexShrink: 0 }} />
        <input
          type="text"
          className="fmp-popup__search-input"
          placeholder="Sök meny…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button type="button" className="fmp-popup__search-clear" onClick={() => setSearch("")}>
            <EditorIcon name="close" size={14} />
          </button>
        )}
      </div>

      {/* List */}
      <div className="fmp-popup__list">
        {showSkeleton ? (
          <>
            <div className="fmp-popup__skeleton" />
            <div className="fmp-popup__skeleton" />
            <div className="fmp-popup__skeleton" />
          </>
        ) : filteredMenus.length === 0 ? (
          <div className="fmp-popup__empty">Inga menyer</div>
        ) : (
          filteredMenus.map((menu) => (
            <button
              key={menu.id}
              type="button"
              className={`fmp-popup__item${menu.id === selectedId ? " fmp-popup__item--active" : ""}`}
              onClick={() => handleSelect(menu.id)}
            >
              <span className="fmp-popup__item-title">{menu.title}</span>
              {menu.id === selectedId && (
                <span className="material-symbols-rounded sf-dropdown__check sf-dropdown__check--visible">check</span>
              )}
            </button>
          ))
        )}
      </div>

      {/* Create menu link */}
      <a
        href="/menus"
        target="_blank"
        rel="noopener noreferrer"
        className="fmp-popup__create"
      >
        <EditorIcon name="add_circle" size={16} />
        <span>Skapa meny</span>
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
            Välj meny
          </button>
        )}

        {actionsOpen && selected && (
          <ul className={`sf-dropdown__menu${dir === "up" ? " sf-dropdown__menu--up" : ""}`}>
            <li className="sf-dropdown__item" onClick={openPopup}>
              <EditorIcon name="replay" size={18} />
              <span style={{ flex: 1 }}>Ersätt</span>
            </li>
            <li className="sf-dropdown__item" onClick={handleEdit}>
              <EditorIcon name="edit" size={18} />
              <span style={{ flex: 1 }}>Redigera</span>
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
