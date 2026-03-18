"use client";

/**
 * LinkPicker — Global link selection popup
 * ─────────────────────────────────────────
 * Reusable across /editor, /maps, /menus, richtext, and any page.
 * Renders an anchored popup with search + accordion categories + items.
 *
 * Usage:
 *   <LinkPicker
 *     open={open}
 *     onSelect={(url, label) => { ... }}
 *     onClose={() => setOpen(false)}
 *     anchorRef={inputRef}
 *   />
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { MediaLibraryModal } from "@/app/(admin)/_components/MediaLibrary";
import type { MediaLibraryResult } from "@/app/(admin)/_components/MediaLibrary";
import "./link-picker.css";

// ─── URL detection ──────────────────────────────────────────

function isExternalUrl(s: string): boolean {
  const trimmed = s.trim();
  return /^https?:\/\/.+/i.test(trimmed);
}

// ─── Types ──────────────────────────────────────────────────

export type LinkPickerItem = {
  label: string;
  url: string;
  icon: string;
};

export type LinkPickerCategory = {
  label: string;
  items: LinkPickerItem[];
};

// ─── Default categories ─────────────────────────────────────

// Special action IDs for items that open sub-flows (not direct URL selection)
const ACTION_DOCUMENT = "__action:document";
const ACTION_TEXT = "__action:text";
const ACTION_MAP = "__action:map";

const DEFAULT_CATEGORIES: LinkPickerCategory[] = [
  {
    label: "Sidor",
    items: [
      { label: "Hem", url: "/", icon: "home" },
      { label: "Bokningar", url: "/stays", icon: "calendar_today" },
      { label: "Konto", url: "/account", icon: "person" },
    ],
  },
  {
    label: "Kontakt",
    items: [
      { label: "E-post", url: "mailto:", icon: "mail" },
      { label: "Telefon", url: "tel:", icon: "phone" },
    ],
  },
  {
    label: "Element",
    items: [
      { label: "Dokument", url: ACTION_DOCUMENT, icon: "document_scanner" },
      { label: "Kartor", url: ACTION_MAP, icon: "map" },
      { label: "Text", url: ACTION_TEXT, icon: "text_fields" },
    ],
  },
  {
    label: "Sociala medier",
    items: [
      { label: "Instagram", url: "https://instagram.com/", icon: "photo_camera" },
      { label: "Facebook", url: "https://facebook.com/", icon: "group" },
      { label: "X (Twitter)", url: "https://x.com/", icon: "tag" },
      { label: "LinkedIn", url: "https://linkedin.com/", icon: "work" },
    ],
  },
];

// ─── Component ──────────────────────────────────────────────

export type MapOption = {
  id: string;
  name: string;
  thumbnail?: string;
};

export type LinkPickerProps = {
  open: boolean;
  onSelect: (url: string, label: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  categories?: LinkPickerCategory[];
  /** Tenant's saved maps — shown as sub-items under Element > Kartor */
  maps?: MapOption[];
};

export function LinkPicker({
  open,
  onSelect,
  onClose,
  anchorRef,
  categories = DEFAULT_CATEGORIES,
  maps = [],
}: LinkPickerProps) {
  const [search, setSearch] = useState("");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(
    () => new Set(categories.map((c) => c.label)),
  );
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [externalLoading, setExternalLoading] = useState(false);
  const [resolvedExternal, setResolvedExternal] = useState<string | null>(null);
  const externalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Element detail modal state
  type ElementMode = null | "document" | "text" | "map";
  const [elementMode, setElementMode] = useState<ElementMode>(null);
  const [docData, setDocData] = useState({ fileUrl: "", fileName: "", fileDescription: "" });
  const [textData, setTextData] = useState({ title: "", content: "" });
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Detect external URL and show skeleton → resolved item
  const queryIsExternal = useMemo(() => isExternalUrl(search), [search]);

  useEffect(() => {
    if (externalTimerRef.current) {
      clearTimeout(externalTimerRef.current);
      externalTimerRef.current = null;
    }
    setResolvedExternal(null);

    if (queryIsExternal) {
      setExternalLoading(true);
      externalTimerRef.current = setTimeout(() => {
        setExternalLoading(false);
        setResolvedExternal(search.trim());
      }, 2000);
    } else {
      setExternalLoading(false);
    }

    return () => {
      if (externalTimerRef.current) clearTimeout(externalTimerRef.current);
    };
  }, [search, queryIsExternal]);

  // Position popup below anchor
  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const popupW = 280;
    let left = rect.left;
    if (left + popupW > window.innerWidth - 8) left = window.innerWidth - popupW - 8;
    if (left < 8) left = 8;

    const spaceBelow = window.innerHeight - rect.bottom;
    const popupH = 380;
    const top = spaceBelow >= popupH + 8
      ? rect.bottom + 6
      : rect.top - popupH - 6;

    setCoords({ top, left });
    setSearch("");
    setTimeout(() => searchRef.current?.focus(), 50);
  }, [open, anchorRef]);

  // Close on outside click (suppressed when sub-modal is open)
  const subModalOpenRef = useRef(false);
  subModalOpenRef.current = elementMode !== null || docPickerOpen;

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (subModalOpenRef.current) return;
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open, onClose, anchorRef]);

  // Close on Escape (suppressed when sub-modal is open)
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (subModalOpenRef.current) return;
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);

  const toggleCat = useCallback((label: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  if (!open && elementMode === null && !docPickerOpen) return null;

  // Filter items by search
  const query = search.trim().toLowerCase();
  const filtered = query
    ? categories.map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (i) => i.label.toLowerCase().includes(query) || i.url.toLowerCase().includes(query),
        ),
      })).filter((cat) => cat.items.length > 0)
    : categories;

  const hasResults = filtered.some((c) => c.items.length > 0);

  const closeElement = () => {
    setElementMode(null);
    setDocPickerOpen(false);
  };

  const docPreview = docData.fileUrl
    ? docData.fileUrl.replace("/upload/", "/upload/pg_1,w_600,f_jpg/")
    : "";

  const elementTitle = elementMode === "document" ? "Dokument" : elementMode === "text" ? "Text" : elementMode === "map" ? "Välj karta" : "";

  const canSaveElement =
    elementMode === "document" ? !!docData.fileUrl :
    elementMode === "text" ? !!textData.content.trim() :
    false;

  const handleElementSave = () => {
    if (elementMode === "document") {
      onSelect(docData.fileUrl, docData.fileName || "Dokument");
    } else if (elementMode === "text") {
      onSelect(`#text:${encodeURIComponent(textData.content)}`, textData.title || "Text");
    }
    closeElement();
    onClose();
  };

  return (<>
    {/* MediaLibrary for document element */}
    <MediaLibraryModal
      open={docPickerOpen}
      onClose={() => setDocPickerOpen(false)}
      onConfirm={(asset: MediaLibraryResult) => {
        setDocPickerOpen(false);
        setDocData({ fileUrl: asset.url, fileName: asset.filename || "", fileDescription: "" });
        setElementMode("document");
      }}
      accept="document"
      title="Välj PDF"
    />

    {/* Element detail modal */}
    {elementMode !== null && !docPickerOpen && (
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9001, display: "flex", alignItems: "center", justifyContent: "center" }}
        onClick={closeElement}
      >
        <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
        <div
          style={{
            position: "relative", zIndex: 1, background: "var(--admin-surface)",
            borderRadius: 16, width: 440, maxHeight: "80vh", display: "flex", flexDirection: "column",
            animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid var(--admin-border)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>{elementTitle}</h3>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflow: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
            {elementMode === "document" && (
              <>
                {docData.fileUrl ? (
                  <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--admin-border)" }}>
                    {docPreview && (
                      <img src={docPreview} alt={docData.fileName} style={{ width: "100%", display: "block" }} />
                    )}
                    <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fafafa" }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-text)" }}>{docData.fileName}</span>
                      <button
                        type="button"
                        className="admin-desc-link"
                        style={{ fontSize: 13, textDecoration: "underline", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}
                        onClick={() => setDocPickerOpen(true)}
                      >
                        Byt fil
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="settings-btn--muted"
                    style={{ fontSize: 13, padding: "8px 16px", alignSelf: "flex-start" }}
                    onClick={() => setDocPickerOpen(true)}
                  >
                    Välj PDF
                  </button>
                )}
                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 400, color: "var(--admin-text)", marginBottom: 5 }}>Namn</label>
                  <input
                    type="text"
                    className="menus-items__input"
                    value={docData.fileName}
                    onChange={(e) => setDocData({ ...docData, fileName: e.target.value })}
                    placeholder="Dokumentets namn"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 400, color: "var(--admin-text)", marginBottom: 5 }}>
                    Beskrivning <span style={{ color: "var(--admin-text-tertiary)" }}>(valfritt)</span>
                  </label>
                  <textarea
                    className="menus-items__input"
                    style={{ height: "auto", minHeight: 72, padding: "8px 10px", resize: "vertical" }}
                    value={docData.fileDescription}
                    onChange={(e) => setDocData({ ...docData, fileDescription: e.target.value })}
                    placeholder="Kort beskrivning av dokumentet"
                    maxLength={240}
                    rows={3}
                  />
                </div>
              </>
            )}

            {elementMode === "text" && (
              <>
                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 400, color: "var(--admin-text)", marginBottom: 5 }}>Namn</label>
                  <input
                    type="text"
                    className="menus-items__input"
                    value={textData.title}
                    onChange={(e) => setTextData({ ...textData, title: e.target.value })}
                    placeholder="Rubrik"
                    autoFocus
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 400, color: "var(--admin-text)", marginBottom: 5 }}>Textinnehåll</label>
                  <textarea
                    className="menus-items__input"
                    style={{ height: "auto", minHeight: 120, padding: "8px 10px", resize: "vertical" }}
                    value={textData.content}
                    onChange={(e) => setTextData({ ...textData, content: e.target.value })}
                    placeholder="Skriv textinnehåll här…"
                  />
                </div>
              </>
            )}

            {elementMode === "map" && (
              <>
                {maps.length === 0 ? (
                  <div style={{ padding: "24px 0", textAlign: "center", color: "var(--admin-text-secondary)", fontSize: 14 }}>
                    Inga kartor. Skapa en karta under Kartor-sidan.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "0 -20px", padding: "0 20px" }}>
                    {maps.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="lp-map-card"
                        onClick={() => {
                          onSelect(`#map:${m.id}`, m.name);
                          closeElement();
                          onClose();
                        }}
                      >
                        {m.thumbnail && (
                          <img src={m.thumbnail} alt={m.name} className="lp-map-card__thumb" />
                        )}
                        <span className="lp-map-card__name">{m.name}</span>
                        <EditorIcon name="chevron_right" size={20} style={{ color: "#303030", flexShrink: 0 }} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: "12px 20px 20px", borderTop: "1px solid var(--admin-border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="settings-btn--outline" style={{ fontSize: 13 }} onClick={closeElement}>
              Avbryt
            </button>
            {elementMode !== "map" && (
              <button
                className="settings-btn--connect"
                style={{ fontSize: 13, padding: "5px 16px" }}
                disabled={!canSaveElement}
                onClick={handleElementSave}
              >
                Spara
              </button>
            )}
          </div>
        </div>
      </div>
    )}

    {open && elementMode === null && !docPickerOpen && createPortal(
    <div
      ref={popupRef}
      className="lp-popup"
      style={coords ? { top: coords.top, left: coords.left } : { visibility: "hidden" as const }}
    >
      {/* Search */}
      <div className="lp-search">
        <EditorIcon name="search" size={16} style={{ color: "var(--admin-text-secondary)", flexShrink: 0 }} />
        <input
          ref={searchRef}
          type="text"
          className="lp-search__input"
          placeholder="Sök efter länk…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button type="button" className="lp-search__clear" onClick={() => setSearch("")}>
            <EditorIcon name="close" size={14} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="lp-body">
        {/* External URL: skeleton loading → resolved item */}
        {queryIsExternal && (
          <div className="lp-external">
            {externalLoading ? (
              <div className="lp-skeleton">
                <div className="lp-skeleton__item" />
                <div className="lp-skeleton__item" />
                <div className="lp-skeleton__item" />
              </div>
            ) : resolvedExternal ? (
              <button
                type="button"
                className="lp-item"
                onClick={() => {
                  onSelect(resolvedExternal, resolvedExternal);
                  onClose();
                }}
              >
                <span className="lp-item__name">{resolvedExternal}</span>
                <span className="lp-item__external">
                  <EditorIcon name="open_in_new" size={16} />
                </span>
              </button>
            ) : null}
          </div>
        )}

        {!queryIsExternal && !hasResults ? (
          <div className="lp-empty">Inga resultat</div>
        ) : !queryIsExternal ? (
          filtered.map((cat) => (
            <div key={cat.label} className="lp-accordion">
              <button
                type="button"
                className="lp-accordion__trigger"
                onClick={() => toggleCat(cat.label)}
              >
                <span className="lp-accordion__label">{cat.label}</span>
                <EditorIcon
                  name="expand_more"
                  size={18}
                  className="lp-accordion__chevron"
                  style={{ transform: expandedCats.has(cat.label) ? "rotate(180deg)" : undefined }}
                />
              </button>
              {expandedCats.has(cat.label) && (
                <div className="lp-accordion__content">
                  {cat.items.map((item) => (
                    <button
                      key={item.url + item.label}
                      type="button"
                      className="lp-item"
                      onClick={() => {
                        if (item.url === ACTION_DOCUMENT) {
                          setDocData({ fileUrl: "", fileName: "", fileDescription: "" });
                          setDocPickerOpen(true);
                          return;
                        }
                        if (item.url === ACTION_MAP) {
                          setElementMode("map");
                          return;
                        }
                        if (item.url === ACTION_TEXT) {
                          setTextData({ title: "", content: "" });
                          setElementMode("text");
                          return;
                        }
                        onSelect(item.url, item.label);
                        onClose();
                      }}
                    >
                      <span className="lp-item__icon">
                        <EditorIcon name={item.icon} size={18} />
                      </span>
                      <span className="lp-item__name">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        ) : null}
      </div>
    </div>,
    document.body,
  )}
  </>);
}
