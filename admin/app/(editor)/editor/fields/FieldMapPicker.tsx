"use client";

/**
 * FieldMapPicker — Searchable dropdown to select a saved map.
 *
 * Fetches lightweight map summaries (id, name, style, markerCount)
 * instead of full MapConfig to minimise payload in the editor.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { getMapSummaries, type MapSummary } from "@/app/(admin)/_lib/tenant/getMaps";
import { getMapThumbnail } from "@/app/(admin)/maps/maps-constants";
import { FieldWrapper } from "./FieldRenderer";
import { EditorIcon } from "@/app/_components/EditorIcon";

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
};

const STYLE_LABELS: Record<string, string> = {
  light: "Ljus",
  dark: "Mörk",
  streets: "Gator",
  satellite: "Satellit",
  outdoors: "Utomhus",
  custom: "Anpassad",
};

export function FieldMapPicker({ field, value, onChange }: Props) {
  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedId = (value as string) || "";

  // Fetch lightweight summaries on mount
  useEffect(() => {
    getMapSummaries()
      .then((m) => setMaps(m))
      .catch(() => setMaps([]))
      .finally(() => setLoading(false));
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus search when opening
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return maps;
    const q = search.toLowerCase();
    return maps.filter((m) => m.name.toLowerCase().includes(q));
  }, [maps, search]);

  const selected = maps.find((m) => m.id === selectedId);

  const handleSelect = (mapId: string) => {
    onChange(field.key, mapId);
    setOpen(false);
    setSearch("");
  };

  const handleClear = () => {
    onChange(field.key, "");
  };

  return (
    <FieldWrapper field={field}>
      <div className="fmp" ref={containerRef}>
        {/* Trigger button */}
        <button
          type="button"
          className="fmp-trigger"
          onClick={() => setOpen(!open)}
        >
          {loading ? (
            <span className="fmp-placeholder">Laddar...</span>
          ) : selected ? (
            <span className="fmp-selected">
              <img
                className="fmp-thumb"
                src={getMapThumbnail(selected.style)}
                alt=""
                draggable={false}
              />
              <span className="fmp-selected__name">{selected.name}</span>
              <span className="fmp-selected__style">
                {STYLE_LABELS[selected.style] || selected.style}
              </span>
            </span>
          ) : (
            <span className="fmp-placeholder">Välj karta...</span>
          )}
          <EditorIcon
            name="expand_more"
            size={16}
            className={`fmp-chevron${open ? " fmp-chevron--open" : ""}`}
          />
        </button>

        {/* Clear button */}
        {selected && (
          <button
            type="button"
            className="fmp-clear"
            onClick={handleClear}
            aria-label="Rensa val"
          >
            <EditorIcon name="close" size={14} />
          </button>
        )}

        {/* Dropdown */}
        {open && (
          <div className="fmp-dropdown">
            {/* Search */}
            <div className="fmp-search">
              <EditorIcon name="search" size={16} />
              <input
                ref={searchRef}
                type="text"
                className="fmp-search__input"
                placeholder="Sök karta..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Options */}
            <div className="fmp-options">
              {filtered.length === 0 ? (
                <div className="fmp-empty">
                  {maps.length === 0
                    ? "Inga kartor skapade. Gå till Kartor i menyn."
                    : "Inga kartor matchar sökningen."}
                </div>
              ) : (
                filtered.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`fmp-option${m.id === selectedId ? " fmp-option--active" : ""}`}
                    onClick={() => handleSelect(m.id)}
                  >
                    <img
                      className="fmp-thumb"
                      src={getMapThumbnail(m.style)}
                      alt=""
                      draggable={false}
                    />
                    <span className="fmp-option__name">{m.name}</span>
                    <span className="fmp-option__meta">
                      {STYLE_LABELS[m.style] || m.style}
                      {m.markerCount > 0 && ` · ${m.markerCount} markörer`}
                    </span>
                    {m.id === selectedId && (
                      <EditorIcon name="check" size={16} className="fmp-option__check" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </FieldWrapper>
  );
}
