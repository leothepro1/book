"use client";

/**
 * FieldMarkers — Custom CRUD editor for map markers.
 *
 * Stores markers as a JSON string in the flat settings system.
 * Provides inline add/edit/delete with expandable cards.
 *
 * Each marker: { id, lat, lng, title, description, icon, color }
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { EditorIcon } from "@/app/_components/EditorIcon";

// ─── Types ───────────────────────────────────────────────────

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  description: string;
  icon: string;
  color: string;
};

function createId(): string {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function parseMarkers(raw: unknown): MapMarker[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const DEFAULT_MARKER: Omit<MapMarker, "id"> = {
  lat: 0,
  lng: 0,
  title: "",
  description: "",
  icon: "location_on",
  color: "#E74C3C",
};

// ─── Component ───────────────────────────────────────────────

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
};

export function FieldMarkers({ field, value, onChange }: Props) {
  const markers = parseMarkers(value);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const save = useCallback(
    (updated: MapMarker[]) => {
      onChange(field.key, JSON.stringify(updated));
    },
    [field.key, onChange]
  );

  const handleAdd = useCallback(() => {
    const newMarker: MapMarker = { ...DEFAULT_MARKER, id: createId() };
    const updated = [...markers, newMarker];
    save(updated);
    setExpandedId(newMarker.id);
  }, [markers, save]);

  const handleUpdate = useCallback(
    (id: string, patch: Partial<MapMarker>) => {
      save(markers.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    },
    [markers, save]
  );

  const handleDelete = useCallback(
    (id: string) => {
      save(markers.filter((m) => m.id !== id));
      if (expandedId === id) setExpandedId(null);
    },
    [markers, save, expandedId]
  );

  const handleReorder = useCallback(
    (fromIndex: number, direction: "up" | "down") => {
      const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
      if (toIndex < 0 || toIndex >= markers.length) return;
      const updated = [...markers];
      [updated[fromIndex], updated[toIndex]] = [updated[toIndex], updated[fromIndex]];
      save(updated);
    },
    [markers, save]
  );

  return (
    <div className="fm">
      {markers.length === 0 && (
        <div className="fm-empty">Inga markörer ännu.</div>
      )}

      {markers.map((marker, index) => (
        <MarkerCard
          key={marker.id}
          marker={marker}
          index={index}
          total={markers.length}
          expanded={expandedId === marker.id}
          onToggle={() => setExpandedId(expandedId === marker.id ? null : marker.id)}
          onUpdate={(patch) => handleUpdate(marker.id, patch)}
          onDelete={() => handleDelete(marker.id)}
          onReorder={(dir) => handleReorder(index, dir)}
        />
      ))}

      <button type="button" className="fm-add" onClick={handleAdd}>
        <EditorIcon name="add_circle" size={16} />
        <span>Lägg till markör</span>
      </button>
    </div>
  );
}

// ─── Marker Card ─────────────────────────────────────────────

function MarkerCard({
  marker,
  index,
  total,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
  onReorder,
}: {
  marker: MapMarker;
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<MapMarker>) => void;
  onDelete: () => void;
  onReorder: (dir: "up" | "down") => void;
}) {
  return (
    <div className={`fm-card${expanded ? " fm-card--expanded" : ""}`}>
      {/* Header — always visible */}
      <button type="button" className="fm-card__header" onClick={onToggle}>
        <span className="fm-card__color" style={{ background: marker.color }} />
        <span className="fm-card__title">
          {marker.title || `Markör ${index + 1}`}
        </span>
        <EditorIcon
          name="expand_more"
          size={16}
          className={`fm-card__chevron${expanded ? " fm-card__chevron--open" : ""}`}
        />
      </button>

      {/* Body — expandable */}
      {expanded && (
        <div className="fm-card__body">
          {/* Title */}
          <label className="fm-field">
            <span className="fm-field__label">Titel</span>
            <input
              type="text"
              className="fm-field__input"
              value={marker.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
              placeholder="T.ex. Receptionen"
            />
          </label>

          {/* Description */}
          <label className="fm-field">
            <span className="fm-field__label">Beskrivning</span>
            <textarea
              className="fm-field__textarea"
              value={marker.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="Visas vid klick på markören"
              rows={2}
            />
          </label>

          {/* Coordinates */}
          <div className="fm-field-row">
            <label className="fm-field fm-field--half">
              <span className="fm-field__label">Latitud</span>
              <input
                type="number"
                className="fm-field__input"
                value={marker.lat}
                onChange={(e) => onUpdate({ lat: parseFloat(e.target.value) || 0 })}
                step="0.0001"
              />
            </label>
            <label className="fm-field fm-field--half">
              <span className="fm-field__label">Longitud</span>
              <input
                type="number"
                className="fm-field__input"
                value={marker.lng}
                onChange={(e) => onUpdate({ lng: parseFloat(e.target.value) || 0 })}
                step="0.0001"
              />
            </label>
          </div>

          {/* Icon */}
          <label className="fm-field">
            <span className="fm-field__label">Ikon</span>
            <div className="fm-field__icon-row">
              <input
                type="text"
                className="fm-field__input"
                value={marker.icon}
                onChange={(e) => onUpdate({ icon: e.target.value })}
                placeholder="location_on"
              />
              {marker.icon && (
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 20, color: marker.color, flexShrink: 0 }}
                  aria-hidden="true"
                >
                  {marker.icon}
                </span>
              )}
            </div>
          </label>

          {/* Color */}
          <label className="fm-field">
            <span className="fm-field__label">Färg</span>
            <div className="fm-field__color-row">
              <input
                type="color"
                className="fm-field__color-input"
                value={marker.color}
                onChange={(e) => onUpdate({ color: e.target.value })}
              />
              <input
                type="text"
                className="fm-field__input"
                value={marker.color}
                onChange={(e) => onUpdate({ color: e.target.value })}
              />
            </div>
          </label>

          {/* Actions */}
          <div className="fm-card__actions">
            <button
              type="button"
              className="fm-card__action-btn"
              onClick={() => onReorder("up")}
              disabled={index === 0}
              aria-label="Flytta upp"
            >
              <EditorIcon name="arrow_upward" size={14} />
            </button>
            <button
              type="button"
              className="fm-card__action-btn"
              onClick={() => onReorder("down")}
              disabled={index === total - 1}
              aria-label="Flytta ner"
            >
              <EditorIcon name="arrow_downward" size={14} />
            </button>
            <button
              type="button"
              className="fm-card__action-btn fm-card__action-btn--danger"
              onClick={onDelete}
              aria-label="Ta bort markör"
            >
              <EditorIcon name="delete" size={14} />
              <span>Ta bort</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
