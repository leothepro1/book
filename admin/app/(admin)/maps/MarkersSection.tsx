"use client";

import React, { useCallback, useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MediaLibraryModal } from "../_components/MediaLibrary";
import type { MediaLibraryResult } from "../_components/MediaLibrary";
import { ColorPickerPopup } from "../_components/ColorPicker";
import type { MapMarkerConfig } from "./maps-constants";
import { RichTextEditor } from "@/app/_components/RichTextEditor";
import type { RichTextEditorHandle } from "@/app/_components/RichTextEditor";
import { createMarkerId, DEFAULT_MARKER, MAPBOX_TOKEN } from "./maps-constants";
import { MarkerAddressSearch } from "./MapDetailView";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── Markers Card System ─────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Icons (shared with Home pattern) ─────────────────────────

const MkDragIcon = () => (
  <span className="material-symbols-rounded" style={{ fontSize: 19 }}>drag_indicator</span>
);
const MkPenIcon = () => (
  <span className="material-symbols-rounded" style={{ fontSize: 19 }}>edit</span>
);
const MkTrashIcon = () => (
  <span className="material-symbols-rounded" style={{ fontSize: 19 }}>delete</span>
);
const MkCloseIcon = () => (
  <span className="material-symbols-rounded" style={{ fontSize: 19 }}>close</span>
);

// ── Toggle ───────────────────────────────────────────────────

function MkToggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={onChange}
      className={"admin-toggle" + (checked ? " admin-toggle-on" : "")}>
      <span className="admin-toggle-icon admin-toggle-icon--check material-symbols-rounded">check</span>
      <span className="admin-toggle-icon admin-toggle-icon--remove material-symbols-rounded">remove</span>
      <span className="admin-toggle-thumb" />
    </button>
  );
}

// ── Panel types ──────────────────────────────────────────────

type MkPanelKey = "content" | "location" | "appearance" | "delete" | null;
const MK_PANEL_LABELS: Record<Exclude<MkPanelKey, null>, string> = {
  content: "Innehåll", location: "Plats", appearance: "Färger", delete: "Ta bort",
};

// ── Panel contents ───────────────────────────────────────────

function MkLocationPanel({ marker, onUpdate }: { marker: MapMarkerConfig; onUpdate: (m: MapMarkerConfig) => void }) {
  return (
    <div className="tp-fields">
      <div className="mk-panel-intro">
        <span className="mk-panel-intro__label">Sökadress</span>
        <span className="mk-panel-intro__desc">Sök efter en plats för att placera markören på kartan.</span>
      </div>
      <MarkerAddressSearch
        value={marker.address || ""}
        onSelect={(addr, lat, lng) => onUpdate({ ...marker, address: addr, lat, lng })}
      />
      <div className="mk-or-divider">
        <span className="mk-or-divider__line" />
        <span className="mk-or-divider__text">ELLER</span>
        <span className="mk-or-divider__line" />
      </div>
      <div className="mk-coord-row">
        <div className="mk-coord-field">
          <span className="tp-field-label">Latitud</span>
          <input type="number" className="tp-float-input" value={marker.lat}
            onChange={e => onUpdate({ ...marker, lat: parseFloat(e.target.value) || 0 })} step="0.0001" />
        </div>
        <div className="mk-coord-field">
          <span className="tp-field-label">Longitud</span>
          <input type="number" className="tp-float-input" value={marker.lng}
            onChange={e => onUpdate({ ...marker, lng: parseFloat(e.target.value) || 0 })} step="0.0001" />
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── Content Panel — Uses shared RichTextEditor component ────────
//

// ── Component ────────────────────────────────────────────────────
// Old utility functions (rtSanitize, rtNormalize, rtApplyBlock, etc.)
// have been extracted to app/_components/RichTextEditor/richtext-utils.ts
// The RichTextEditor component handles all editing logic.
//
type TextAlign = "left" | "center" | "right"; // kept for type compat

// Old ALIGN_OPTIONS, utility functions, and MkContentPanel removed.
// All rich text editing is now handled by <RichTextEditor /> from
// app/_components/RichTextEditor/. The MkContentPanel below is a
// thin wrapper that adds the intro text + CTA section around it.

function MkContentPanel({ marker, onUpdate }: { marker: MapMarkerConfig; onUpdate: (m: MapMarkerConfig) => void }) {
  const [mediaOpen, setMediaOpen] = useState(false);
  const savedRangeRef = useRef<Range | null>(null);
  const editorHandleRef = useRef<RichTextEditorHandle | null>(null);
  const markerRef = useRef(marker);
  markerRef.current = marker;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const handleContentChange = useCallback((html: string) => {
    onUpdateRef.current({ ...markerRef.current, content: html });
  }, []);

  const handleMediaConfirm = useCallback((asset: MediaLibraryResult) => {
    setMediaOpen(false);
    // Insert image directly into editor DOM — shows immediately
    editorHandleRef.current?.insertImage(asset.url, asset.filename || "", asset.id);
  }, []);

  return (
    <div>
      <div className="mk-panel-intro">
        <span className="mk-panel-intro__label">Beskrivning</span>
        <span className="mk-panel-intro__desc">Skriv en detaljerad beskrivning som visas när gästen klickar på markören.</span>
      </div>
      <RichTextEditor
        value={marker.content || ""}
        onChange={handleContentChange}
        placeholder="Skriv innehåll..."
        showMediaPicker
        onRequestMediaPicker={() => setMediaOpen(true)}
        editorHandle={editorHandleRef}
      />
      <MediaLibraryModal
        open={mediaOpen}
        onClose={() => { setMediaOpen(false); savedRangeRef.current = null; }}
        onConfirm={handleMediaConfirm}
        title="Välj bild"
        accept="image"
      />
      <MkCtaSection marker={marker} onUpdate={onUpdate} />
    </div>
  );
}


// ── CTA Button Section ────────────────────────────────────────

function isValidUrl(str: string): boolean {
  if (!str.trim()) return true; // empty is ok
  try {
    const url = new URL(str.startsWith("http") ? str : `https://${str}`);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function MkCtaSection({ marker, onUpdate }: { marker: MapMarkerConfig; onUpdate: (m: MapMarkerConfig) => void }) {
  const showButton = marker.showButton ?? false;
  const buttonUrl = marker.buttonUrl ?? "";
  const urlValid = isValidUrl(buttonUrl);

  return (
    <div className="mk-cta-section">
      <div className="mk-cta-toggle">
        <span className="mk-cta-toggle__label">Visa en knapp</span>
        <MkToggle checked={showButton} onChange={() => onUpdate({ ...marker, showButton: !showButton })} />
      </div>
      {showButton && (
        <div className="mk-cta-fields">
          <div className="mk-cta-field">
            <span className="tp-field-label">Knappetikett</span>
            <input
              type="text"
              className="tp-float-input"
              value={marker.buttonLabel ?? ""}
              onChange={e => onUpdate({ ...marker, buttonLabel: e.target.value })}
              placeholder="T.ex. Läs mer"
            />
          </div>
          <div className="mk-cta-field">
            <span className="tp-field-label">URL</span>
            <input
              type="url"
              className={"tp-float-input" + (!urlValid ? " mk-cta-input--invalid" : "")}
              value={buttonUrl}
              onChange={e => onUpdate({ ...marker, buttonUrl: e.target.value })}
              placeholder="https://example.com"
            />
            {!urlValid && (
              <span className="mk-cta-error">Ange en giltig URL (https://...)</span>
            )}
          </div>
          <div className="mk-cta-toggle">
            <span className="mk-cta-toggle__label">Öppna länk i en ny flik</span>
            <MkToggle
              checked={marker.buttonOpenNewTab ?? false}
              onChange={() => onUpdate({ ...marker, buttonOpenNewTab: !(marker.buttonOpenNewTab ?? false) })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const MkBoldIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 2h5a3 3 0 0 1 2.1 5.15A3.5 3.5 0 0 1 9.5 14H4V2Zm2 5h3a1 1 0 0 0 0-2H6v2Zm0 2v3h3.5a1.5 1.5 0 0 0 0-3H6Z" fill="currentColor"/></svg>
);
const MkItalicIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 2h6v2h-2.2l-2.6 8H9v2H3v-2h2.2l2.6-8H6V2Z" fill="currentColor"/></svg>
);

function MkAppearancePanel({ marker, onUpdate }: { marker: MapMarkerConfig; onUpdate: (m: MapMarkerConfig) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const swatchRef = useRef<HTMLDivElement>(null);
  return (
    <div className="tp-fields">
      <div>
        <span className="tp-field-label">Ikon</span>
        <input type="text" className="tp-float-input" value={marker.icon}
          onChange={e => onUpdate({ ...marker, icon: e.target.value })}
          placeholder="location_on" />
        <a className="sf-desc-link" href="https://fonts.google.com/icons" target="_blank" rel="noopener noreferrer">
          Se tillgängliga ikoner
          <span className="material-symbols-rounded" style={{ fontSize: 16, verticalAlign: "middle", marginLeft: 2 }}>arrow_right_alt</span>
        </a>
      </div>
      <div>
        <span className="tp-field-label">Färg</span>
        <div className="design-color-input-row">
          <input type="text" className="design-color-input" value={(marker.color || "#E74C3C").toUpperCase()}
            onChange={e => onUpdate({ ...marker, color: e.target.value })} spellCheck={false} autoComplete="off" />
          <div ref={swatchRef} className="design-color-swatch" style={{ background: marker.color || "#E74C3C" }}
            onClick={() => setPickerOpen(!pickerOpen)} />
          {pickerOpen && (
            <ColorPickerPopup
              value={marker.color || "#E74C3C"}
              onChange={v => onUpdate({ ...marker, color: v })}
              onClose={() => setPickerOpen(false)}
              anchorRef={swatchRef}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function MkDeletePanel({ onDelete }: { onDelete: () => void }) {
  return (
    <div className="card-panel-body card-panel-body--delete">
      <div className="delete-panel-options">
        <div className="delete-panel-option">
          <button type="button" className="delete-panel-btn delete-panel-btn--danger" onClick={onDelete}>Ta bort</button>
          <span className="delete-panel-sub">Markören tas bort permanent.</span>
        </div>
      </div>
    </div>
  );
}

// ── Marker Card Item ─────────────────────────────────────────

function MarkerCardItem({
  marker,
  onToggle,
  onDelete,
  onUpdate,
  openPanel,
  onPanelToggle,
  dragHandleProps,
}: {
  marker: MapMarkerConfig;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (updated: MapMarkerConfig) => void;
  openPanel: MkPanelKey;
  onPanelToggle: (id: string, key: Exclude<MkPanelKey, null>) => void;
  dragHandleProps?: Record<string, unknown>;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLSpanElement>(null);
  const panelContentRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState<number | undefined>();
  const panelReadyRef = useRef(false);

  useEffect(() => {
    const el = panelContentRef.current;
    if (!el || !openPanel) {
      setPanelHeight(undefined);
      panelReadyRef.current = false;
      return;
    }
    if (panelReadyRef.current) {
      const frame = requestAnimationFrame(() => setPanelHeight(el.scrollHeight));
      const ro = new ResizeObserver(() => setPanelHeight(el.scrollHeight));
      ro.observe(el);
      return () => { cancelAnimationFrame(frame); ro.disconnect(); };
    }
    let ro: ResizeObserver | null = null;
    const timeout = setTimeout(() => {
      panelReadyRef.current = true;
      setPanelHeight(el.scrollHeight);
      ro = new ResizeObserver(() => setPanelHeight(el.scrollHeight));
      ro.observe(el);
    }, 1050);
    return () => { clearTimeout(timeout); ro?.disconnect(); };
  }, [openPanel]);

  const isActive = marker.isActive !== false;
  const coordsStr = marker.lat || marker.lng
    ? `${marker.lat.toFixed(4)}, ${marker.lng.toFixed(4)}`
    : "";

  const handleTitleBlur = () => {
    setEditingTitle(false);
    const el = titleInputRef.current;
    const newVal = (el?.textContent ?? "").trim();
    if (newVal && newVal !== marker.title) {
      onUpdate({ ...marker, title: newVal });
    } else if (el) {
      el.textContent = marker.title;
    }
  };

  const livePanelContent =
    openPanel === "content" ? <MkContentPanel marker={marker} onUpdate={onUpdate} /> :
    openPanel === "location" ? <MkLocationPanel marker={marker} onUpdate={onUpdate} /> :
    openPanel === "appearance" ? <MkAppearancePanel marker={marker} onUpdate={onUpdate} /> :
    openPanel === "delete" ? <MkDeletePanel onDelete={onDelete} /> : null;

  const lastPanelContentRef = useRef<React.ReactNode>(null);
  if (livePanelContent !== null) {
    lastPanelContentRef.current = livePanelContent;
  }
  const panelContent = livePanelContent ?? lastPanelContentRef.current;

  return (
    <div className={"home-card" + (openPanel ? " home-card--expanded" : "")}>
      <div className="home-card-top">
        <div className="home-card-drag" {...(dragHandleProps ?? {})} title="Dra för att sortera">
          <MkDragIcon />
        </div>
        <div className="home-card-body">
          <div className="home-card-row1">
            <span
              ref={titleInputRef}
              className={"home-card-title" + (!marker.title ? " home-card-title--empty" : "")}
              contentEditable={editingTitle}
              suppressContentEditableWarning
              data-placeholder="Markörnamn"
              onBlur={handleTitleBlur}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLElement).blur(); }
                if (e.key === "Escape") { (e.target as HTMLElement).textContent = marker.title; setEditingTitle(false); }
              }}
            >{marker.title}</span>
            {!editingTitle && (
              <button type="button" className="home-card-icon-btn" aria-label="Redigera titel"
                onClick={() => { setEditingTitle(true); setTimeout(() => { const el = titleInputRef.current; if (el) { el.focus(); const range = document.createRange(); range.selectNodeContents(el); const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range); } }, 0); }}>
                <MkPenIcon />
              </button>
            )}
          </div>
          <div className="home-card-row2">
            <span
              className={"home-card-sub" + (!coordsStr ? " home-card-sub--empty" : "")}
              data-placeholder="Ange koordinater"
            >{coordsStr}</span>
          </div>
          <div className="home-card-row3">
            <div className="home-card-icons">
              <button type="button"
                className={"home-card-icon-btn" + (openPanel === "content" ? " home-card-icon-btn--active" : "")}
                title="Innehåll" onClick={() => onPanelToggle(marker.id, "content")}>
                <span className="material-symbols-rounded" style={{ fontSize: 19 }}>article</span>
              </button>
              <button type="button"
                className={"home-card-icon-btn" + (openPanel === "location" ? " home-card-icon-btn--active" : "")}
                title="Plats" onClick={() => onPanelToggle(marker.id, "location")}>
                <span className="material-symbols-rounded" style={{ fontSize: 19 }}>keep</span>
              </button>
              <button type="button"
                className={"home-card-icon-btn" + (openPanel === "appearance" ? " home-card-icon-btn--active" : "")}
                title="Färger" onClick={() => onPanelToggle(marker.id, "appearance")}>
                <span className="material-symbols-rounded" style={{ fontSize: 19 }}>colors</span>
              </button>
            </div>
          </div>
        </div>
        <div className="home-card-toggle">
          <MkToggle checked={isActive} onChange={onToggle} />
          <button type="button"
            className={"home-card-icon-btn home-card-trash" + (openPanel === "delete" ? " home-card-icon-btn--active" : "")}
            onClick={() => onPanelToggle(marker.id, "delete")} aria-label="Ta bort">
            <MkTrashIcon />
          </button>
        </div>
      </div>
      <div className={"home-card-panel" + (openPanel ? " home-card-panel--open" : "")}>
        <div className="home-card-panel-inner" style={openPanel && panelHeight != null ? { height: panelHeight } : undefined}>
          <div ref={panelContentRef}>
            <div className="home-card-panel-header">
              <div style={{ width: 26, flexShrink: 0 }} />
              <span className="home-card-panel-label">{openPanel ? MK_PANEL_LABELS[openPanel] : ""}</span>
              <button type="button" className="home-card-panel-close"
                onClick={() => { if (openPanel) onPanelToggle(marker.id, openPanel); }}>
                <MkCloseIcon />
              </button>
            </div>
            <div className="card-panel-body">
              {panelContent}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sortable Wrappers ────────────────────────────────────────

function SortableMarkerCard({
  marker, openPanel, onPanelToggle, onToggle, onDelete, onUpdate,
}: {
  marker: MapMarkerConfig;
  openPanel: MkPanelKey;
  onPanelToggle: (id: string, key: Exclude<MkPanelKey, null>) => void;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (updated: MapMarkerConfig) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: marker.id });
  const style: React.CSSProperties = isDragging
    ? { opacity: 0, transition }
    : { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style}>
      <MarkerCardItem
        marker={marker}
        openPanel={openPanel}
        onPanelToggle={onPanelToggle}
        onToggle={onToggle}
        onDelete={onDelete}
        onUpdate={onUpdate}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

// ── Markers Section (main orchestrator) ──────────────────────

export function MarkersSection({
  markers,
  onUpdate,
}: {
  markers: MapMarkerConfig[];
  onUpdate: (markers: MapMarkerConfig[]) => void;
}) {
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<MkPanelKey>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const sorted: MapMarkerConfig[] = useMemo(() => {
    const withDefaults = markers.map((m, i) => ({
      ...m,
      isActive: m.isActive !== false,
      sortOrder: m.sortOrder ?? i,
    }));
    return [...withDefaults].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [markers]);

  const handlePanelToggle = useCallback((id: string, key: Exclude<MkPanelKey, null>) => {
    if (activeCard === id && activePanel === key) {
      setActivePanel(null);
      setActiveCard(null);
    } else {
      setActiveCard(id);
      setActivePanel(key);
    }
  }, [activeCard, activePanel]);

  const save = useCallback((newMarkers: MapMarkerConfig[]) => {
    const normalized = [...newMarkers]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((m, i) => ({ ...m, sortOrder: i }));
    onUpdate(normalized);
  }, [onUpdate]);

  // ── Drag handlers ──

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = sorted.findIndex(m => m.id === active.id);
    const newIndex = sorted.findIndex(m => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(sorted, oldIndex, newIndex);
    save(reordered.map((m, i) => ({ ...m, sortOrder: i })));
  }, [sorted, save]);

  // ── CRUD operations ──

  const handleAdd = useCallback(() => {
    const newMarker: MapMarkerConfig = {
      ...DEFAULT_MARKER,
      id: createMarkerId(),
      title: `Markör ${markers.length + 1}`,
      isActive: true,
      sortOrder: 0,
    };
    const shifted = markers.map(m => ({ ...m, sortOrder: (m.sortOrder ?? 0) + 1 }));
    save([{ ...newMarker, sortOrder: 0 }, ...shifted]);
  }, [markers, save]);

  const handleToggle = useCallback((id: string) => {
    const target = markers.find(m => m.id === id);
    if (!target) return;
    save(markers.map(m => m.id === id ? { ...m, isActive: target.isActive === false } : m));
  }, [markers, save]);

  const handleDelete = useCallback((id: string) => {
    save(markers.filter(m => m.id !== id));
  }, [markers, save]);

  const handleUpdate = useCallback((updated: MapMarkerConfig) => {
    save(markers.map(m => m.id === updated.id ? updated : m));
  }, [markers, save]);

  const activeCount = sorted.filter(m => m.isActive !== false).length;
  const activeDragMarker = activeDragId ? sorted.find(m => m.id === activeDragId) ?? null : null;

  if (sorted.length === 0) {
    return (
      <div className="mk-empty">
        <div className="mk-empty__icon">
          <span className="material-symbols-rounded" style={{ fontSize: 35 }}>pinboard</span>
        </div>
        <h3 className="mk-empty__title">Inga markörer ännu</h3>
        <p className="mk-empty__desc">Lägg till en för att komma igång.</p>
        <button type="button" className="maps-create-btn" onClick={() => handleAdd()}>
          <span className="material-symbols-rounded" style={{ fontSize: 18 }}>add_2</span>
          Lägg till markör
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="home-section-header" style={{ marginBottom: 12 }}>
        <div>
          <div className="home-section-sub">{activeCount} aktiva</div>
        </div>
      </div>

      <DndContext
        id="markers-dnd"
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sorted.map(m => m.id)} strategy={verticalListSortingStrategy}>
          <div className="home-card-list">
            {sorted.map((marker) => (
              <SortableMarkerCard
                key={marker.id}
                marker={marker}
                openPanel={activeCard === marker.id ? activePanel : null}
                onPanelToggle={handlePanelToggle}
                onToggle={() => handleToggle(marker.id)}
                onDelete={() => handleDelete(marker.id)}
                onUpdate={handleUpdate}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeDragMarker ? (
            <div style={{ opacity: 1, borderRadius: 16 }}>
              <MarkerCardItem
                marker={activeDragMarker}
                openPanel={null}
                onPanelToggle={() => {}}
                onToggle={() => {}}
                onDelete={() => {}}
                onUpdate={() => {}}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <button type="button" className="home-add-btn-full" onClick={() => handleAdd()}>
        <span className="material-symbols-rounded" style={{ fontSize: 20 }}>add_2</span>
        Lägg till
      </button>
    </>
  );
}
