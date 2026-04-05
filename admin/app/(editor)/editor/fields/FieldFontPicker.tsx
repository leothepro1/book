"use client";

/**
 * FieldFontPicker — Font picker field for the editor settings panel.
 * Uses the same sp-font-selector trigger + sp-font-overlay panel
 * used in TypographyAccordion and page settings.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { FONT_CATALOG, batchFontsUrl } from "@/app/_lib/fonts/catalog";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { FieldWrapper } from "./FieldRenderer";

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
};

const FONTS_PER_PAGE = 30;

const FONT_OPTIONS = FONT_CATALOG.map((f) => ({
  key: f.key,
  label: f.label,
  family: `${f.label}, ${f.serif ? "serif" : "sans-serif"}`,
}));

const INITIAL_BATCH_URL = batchFontsUrl(FONT_CATALOG.slice(0, FONTS_PER_PAGE));

export function FieldFontPicker({ field, value, onChange }: Props) {
  const fontKey = (value as string) ?? (field.default as string) ?? "inter";
  const fontOption = FONT_OPTIONS.find((f) => f.key === fontKey);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <FieldWrapper field={field}>
      <button
        type="button"
        className="sp-font-selector"
        onClick={() => setPickerOpen(true)}
      >
        <span
          className="sp-font-selector__name"
          style={{ fontFamily: fontOption?.family ?? "sans-serif" }}
        >
          {fontOption?.label ?? fontKey}
        </span>
        <span className="sp-font-selector__chevron">
          <EditorIcon name="chevron_right" size={18} />
        </span>
      </button>
      {pickerOpen && (
        <FontPickerOverlay
          title={`Välj typsnitt för ${field.label.toLowerCase()}`}
          currentFont={fontKey}
          onSelect={(key) => {
            onChange(field.key, key);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </FieldWrapper>
  );
}

// ─── Font Picker Overlay (same as InPanelFontPicker in SettingsPanel) ───

function FontPickerOverlay({
  title,
  currentFont,
  onSelect,
  onClose,
}: {
  title: string;
  currentFont: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(FONTS_PER_PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const loadedUrlsRef = useRef<Set<string>>(new Set(INITIAL_BATCH_URL ? [INITIAL_BATCH_URL] : []));

  const isSearching = search.trim().length > 0;

  const searchResults = isSearching
    ? FONT_OPTIONS.filter((f) => f.label.toLowerCase().includes(search.trim().toLowerCase()))
    : null;

  const displayFonts = searchResults ?? FONT_OPTIONS.slice(0, visibleCount);
  const hasMore = !isSearching && visibleCount < FONT_OPTIONS.length;

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const loadFontsForSearch = useCallback((fonts: typeof FONT_OPTIONS) => {
    const catalogEntries = fonts.map((f) => FONT_CATALOG.find((c) => c.key === f.key)!).filter(Boolean);
    const url = batchFontsUrl(catalogEntries);
    if (!url || loadedUrlsRef.current.has(url)) return;
    loadedUrlsRef.current.add(url);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
  }, []);

  if (searchResults && searchResults.length > 0) {
    loadFontsForSearch(searchResults);
  }

  const handleShowMore = useCallback(() => {
    setLoadingMore(true);
    const nextEnd = Math.min(visibleCount + FONTS_PER_PAGE, FONT_CATALOG.length);
    const batch = FONT_CATALOG.slice(visibleCount, nextEnd);
    const url = batchFontsUrl(batch);

    if (url && !loadedUrlsRef.current.has(url)) {
      loadedUrlsRef.current.add(url);
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.onload = () => { setVisibleCount(nextEnd); setLoadingMore(false); };
      link.onerror = () => { setVisibleCount(nextEnd); setLoadingMore(false); };
      document.head.appendChild(link);
    } else {
      setVisibleCount(nextEnd);
      setLoadingMore(false);
    }
  }, [visibleCount]);

  return (
    <div className="sp-font-overlay">
      {INITIAL_BATCH_URL && <link rel="stylesheet" href={INITIAL_BATCH_URL} />}

      <div className="sp-font-header">
        <button type="button" className="sp-font-header__back" onClick={onClose} aria-label="Tillbaka">
          <EditorIcon name="chevron_left" size={18} />
        </button>
        <span className="sp-font-header__title">{title}</span>
      </div>

      <div className="sp-font-search">
        <div className="sp-font-search__wrap">
          <svg className="sp-font-search__icon" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            className="sp-font-search__input"
            placeholder="Sök typsnitt..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="sp-font-list">
        {displayFonts.map(({ key, label, family }) => (
          <button
            key={key}
            type="button"
            className="sp-font-item"
            onClick={() => onSelect(key)}
            style={{ fontFamily: family }}
          >
            <span>{label}</span>
            {currentFont === key && (
              <span className="sp-font-item__check material-symbols-rounded">check</span>
            )}
          </button>
        ))}
        {isSearching && displayFonts.length === 0 && (
          <div className="sp-font-empty">Inga typsnitt hittades</div>
        )}
        {hasMore && (
          <div className="sp-font-load-more">
            <button type="button" className="sp-font-load-more__btn" onClick={handleShowMore} disabled={loadingMore}>
              Visa fler
            </button>
            <span className="sp-font-load-more__count">Visar {visibleCount} av {FONT_OPTIONS.length}</span>
          </div>
        )}
      </div>
    </div>
  );
}
