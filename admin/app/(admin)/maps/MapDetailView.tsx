"use client";

import React, { useCallback, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { MapConfig } from "./maps-constants";
import { STYLE_OPTIONS, MAPBOX_TOKEN } from "./maps-constants";
import { MarkersSection } from "./MarkersSection";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── Address Search (Mapbox Geocoding) ───────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type GeoResult = { place_name: string; center: [number, number] };

function AddressSearch({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (address: string, lat: number, lng: number) => void;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<GeoResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim() || !MAPBOX_TOKEN) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_TOKEN}&limit=5&language=sv`;
        const res = await fetch(url);
        const data = await res.json();
        const features: GeoResult[] = (data.features || []).map((f: { place_name: string; center: [number, number] }) => ({
          place_name: f.place_name,
          center: f.center,
        }));
        setResults(features);
        setOpen(features.length > 0);
      } catch { setResults([]); setOpen(false); }
    }, 300);
  }, []);

  const handleSelect = (r: GeoResult) => {
    setQuery(r.place_name);
    setResults([]);
    setOpen(false);
    onSelect(r.place_name, r.center[1], r.center[0]);
  };

  return (
    <div className="maps-address" ref={containerRef}>
      <div className="maps-address__input-wrap">
        <span className="maps-address__icon material-symbols-outlined">search</span>
        <input
          type="text"
          className="maps-input maps-address__input"
          value={query}
          placeholder="Sök adress eller plats..."
          onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
        />
      </div>
      {open && results.length > 0 && (() => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return null;
        return createPortal(
          <ul ref={listRef} className="maps-address__list maps-address__list--fixed"
            style={{ top: rect.bottom + 4, left: rect.left, width: rect.width }}>
            {results.map((r, i) => (
              <li key={i}>
                <button type="button" className="maps-address__item" onClick={() => handleSelect(r)}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#8C8B89" }}>location_on</span>
                  <span className="maps-address__text">{r.place_name}</span>
                </button>
              </li>
            ))}
          </ul>,
          document.body
        );
      })()}
    </div>
  );
}

export function MarkerAddressSearch({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (address: string, lat: number, lng: number) => void;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<GeoResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim() || !MAPBOX_TOKEN) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_TOKEN}&limit=5&language=sv`;
        const res = await fetch(url);
        const data = await res.json();
        const features: GeoResult[] = (data.features || []).map((f: { place_name: string; center: [number, number] }) => ({
          place_name: f.place_name,
          center: f.center,
        }));
        setResults(features);
        setOpen(features.length > 0);
      } catch { setResults([]); setOpen(false); }
    }, 300);
  }, []);

  const handleSelect = (r: GeoResult) => {
    setQuery(r.place_name);
    setResults([]);
    setOpen(false);
    onSelect(r.place_name, r.center[1], r.center[0]);
  };

  return (
    <div className="maps-address" ref={containerRef}>
      <div className="maps-address__input-wrap">
        <span className="maps-address__icon material-symbols-outlined">search</span>
        <input
          type="text"
          className="maps-input maps-address__input"
          value={query}
          placeholder="Sök adress eller plats..."
          onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
        />
      </div>
      {open && results.length > 0 && (() => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return null;
        return createPortal(
          <ul ref={listRef} className="maps-address__list maps-address__list--fixed"
            style={{ top: rect.bottom + 4, left: rect.left, width: rect.width }}>
            {results.map((r, i) => (
              <li key={i}>
                <button type="button" className="maps-address__item" onClick={() => handleSelect(r)}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#8C8B89" }}>location_on</span>
                  <span className="maps-address__text">{r.place_name}</span>
                </button>
              </li>
            ))}
          </ul>,
          document.body
        );
      })()}
    </div>
  );
}

function StyleDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLabel = STYLE_OPTIONS.find((s) => s.value === value)?.label || "Ljus";

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="maps-style-dropdown" ref={containerRef}>
      <button type="button" className="maps-style-dropdown__trigger" onClick={() => setOpen(!open)}>
        <span className="maps-style-dropdown__value">{activeLabel}</span>
        <span className="material-symbols-outlined maps-style-dropdown__chevron" style={{ fontSize: 20 }}>
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>
      {open && (
        <ul className="maps-style-dropdown__list">
          {STYLE_OPTIONS.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                className={`maps-style-dropdown__item${opt.value === value ? " maps-style-dropdown__item--active" : ""}`}
                onClick={() => { onChange(opt.value); setOpen(false); }}
              >
                <span>{opt.label}</span>
                {opt.value === value && (
                  <span className="material-symbols-outlined" style={{ fontSize: 24, color: "#0075DE" }}>check</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── Detail View ─────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function MapDetailView({
  map,
  onUpdate,
  onLocalUpdate,
}: {
  map: MapConfig;
  onUpdate: (patch: Partial<MapConfig>) => void;
  onLocalUpdate: (patch: Partial<MapConfig>) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingRef = useRef<Partial<MapConfig>>({});

  const debouncedUpdate = useCallback(
    (patch: Partial<MapConfig>) => {
      onLocalUpdate(patch);
      pendingRef.current = { ...pendingRef.current, ...patch };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onUpdate(pendingRef.current);
        pendingRef.current = {};
      }, 400);
    },
    [onUpdate, onLocalUpdate]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        if (Object.keys(pendingRef.current).length > 0) {
          onUpdate(pendingRef.current);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const immediateUpdate = useCallback(
    (patch: Partial<MapConfig>) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
      onUpdate({ ...pendingRef.current, ...patch });
      pendingRef.current = {};
    },
    [onUpdate]
  );

  const [showAddressHelp, setShowAddressHelp] = useState(false);

  return (
    <div className="maps-detail">
      {/* ── Container 1: Namn & Adress ── */}
      <div className="maps-container">
        <div className="maps-section">
          <label className="maps-label">Namn</label>
          <input
            type="text"
            className="maps-input"
            value={map.name}
            onChange={(e) => immediateUpdate({ name: e.target.value })}
            placeholder="T.ex. Områdeskarta"
          />
        </div>

        <div className="maps-section">
          <div className="maps-label-row">
            <label className="maps-label" style={{ marginBottom: 0 }}>Adress</label>
            <button type="button" className="maps-help-btn" onClick={() => setShowAddressHelp(true)}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>help</span>
            </button>
          </div>
          <AddressSearch
            value={map.address || ""}
            onSelect={(addr, lat, lng) => immediateUpdate({ address: addr, centerLat: lat, centerLng: lng })}
          />
        </div>
      </div>

      {/* ── Container 2: Kartstil, Kamera & Funktioner ── */}
      <div className="maps-container">
        <div className="maps-section">
          <label className="maps-label">Kartstil</label>
          <StyleDropdown value={map.style} onChange={(v) => immediateUpdate({ style: v })} />
        </div>

        <div className="maps-section">
          <label className="maps-label">Kamera</label>
          <RangeField label="Zoom" value={map.zoom} min={1} max={20} step={0.5}
            onChange={(v) => debouncedUpdate({ zoom: v })} />
          <RangeField label="Lutning" value={map.pitch} min={0} max={85} step={5} unit="°"
            onChange={(v) => debouncedUpdate({ pitch: v })} />
          <RangeField label="Rotation" value={map.bearing} min={0} max={360} step={5} unit="°"
            onChange={(v) => debouncedUpdate({ bearing: v })} />
        </div>

        <div className="maps-section">
          <label className="maps-label">Funktioner</label>
          <ToggleField label="3D-byggnader" checked={map.buildings3d}
            onChange={(v) => immediateUpdate({ buildings3d: v })} />
          <ToggleField label="Scroll-zoom" checked={map.scrollZoom}
            onChange={(v) => immediateUpdate({ scrollZoom: v })} />
          <ToggleField label="Platsnamn" checked={map.showPlaceLabels ?? true}
            onChange={(v) => immediateUpdate({ showPlaceLabels: v })} />
          <ToggleField label="Vägar" checked={map.showRoadLabels ?? true}
            onChange={(v) => immediateUpdate({ showRoadLabels: v })} />
        </div>
      </div>

      {/* ── Container 3: Markörer ── */}
      <div className="maps-container">
        <label className="maps-label">Markörer</label>
        <MarkersSection
          markers={map.markers}
          onUpdate={(markers) => immediateUpdate({ markers })}
        />
      </div>

      {/* ── Address help modal ── */}
      {showAddressHelp && createPortal(
        <div className="home-confirm-overlay" onClick={() => setShowAddressHelp(false)}>
          <div className="home-confirm-modal" onClick={e => e.stopPropagation()}>
            <h3 className="home-confirm-title">Adress</h3>
            <p className="home-confirm-body">
              Sök efter en adress eller plats för att centrera kartan. Adressen används för att automatiskt sätta kartans centrumpunkt (latitud och longitud).
            </p>
            <div className="home-confirm-actions">
              <button type="button" className="home-confirm-btn home-confirm-btn--confirm" onClick={() => setShowAddressHelp(false)}>
                Uppfattat
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Shared Controls ────────────────────────────────────────

function RangeField({
  label, value, min, max, step, unit, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; unit?: string;
  onChange: (v: number) => void;
}) {
  const [active, setActive] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) setLocalValue(value);
  }, [value, active]);

  const displayValue = active ? localValue : value;
  const pct = ((displayValue - min) / (max - min)) * 100;

  const resolve = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return displayValue;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = min + ratio * (max - min);
      const snapped = Math.round(raw / step) * step;
      return Math.max(min, Math.min(max, +snapped.toFixed(4)));
    },
    [min, max, step, displayValue],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setActive(true);
      const v = resolve(e.clientX);
      setLocalValue(v);
      if (v !== value) onChange(v);
    },
    [resolve, onChange, value],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!active) return;
      const v = resolve(e.clientX);
      setLocalValue(v);
      if (v !== value) onChange(v);
    },
    [active, resolve, onChange, value],
  );

  const onPointerUp = useCallback(() => setActive(false), []);

  return (
    <div className="maps-range">
      <span className="maps-range__label">{label}</span>
      <div
        ref={trackRef}
        className="maps-range__track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="maps-range__fill" style={{ width: `${pct}%` }} />
        <div className={`maps-range__thumb${active ? " maps-range__thumb--active" : ""}`} style={{ left: `${pct}%` }}>
          <div className="maps-range__pin">
            <span className="maps-range__pin-value">{displayValue}{unit || ""}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleField({
  label, checked, onChange,
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="maps-toggle">
      <span className="maps-toggle__label">{label}</span>
      <button type="button" className={`admin-toggle${checked ? " admin-toggle-on" : ""}`}
        onClick={() => onChange(!checked)}>
        <span className="admin-toggle-icon admin-toggle-icon--check material-symbols-outlined">check</span>
        <span className="admin-toggle-icon admin-toggle-icon--remove material-symbols-outlined">remove</span>
        <span className="admin-toggle-thumb" />
      </button>
    </div>
  );
}
