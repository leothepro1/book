"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { Tooltip } from "@/app/_components/Tooltip";
import "@/app/(admin)/_components/PublishBar/publish-bar.css";
import "@/app/(editor)/editor/editor.css";
import {
  saveMapDraft,
  publishMapDraft,
  discardMapDraft,
  type MapDraftConfig,
  type DraftMarker,
} from "@/app/_lib/apps/spot-booking/draft-actions";
import { resolveMarkerPrice } from "@/app/_lib/apps/spot-booking/pricing";
import { updateSpotMapAccommodations } from "@/app/_lib/apps/spot-booking/wizard-actions";
import { resolveContrastPalette } from "@/app/_lib/color/contrast";
import { ColorTokenField } from "@/app/(editor)/editor/panels/ColorTokenField";
import { MediaLibraryModal } from "@/app/(admin)/_components/MediaLibrary";
import type { MediaLibraryResult } from "@/app/(admin)/_components/MediaLibrary";
import "@/app/(admin)/_components/ImageUpload/image-upload.css";
import "./spot-booking-editor.css";

// ── Types ───────────────────────────────────────────────────────

type MarkerData = {
  id: string;
  label: string;
  x: number;
  y: number;
  accommodationId: string;
  accommodationName: string;
  accommodationSlug: string;
  accommodationUnitId: string | null;
  unitName: string | null;
  priceOverride: number | null;
  color: string | null;
};

type AccommodationOption = {
  id: string;
  name: string;
  slug: string;
  externalCode: string | null;
  imageUrl: string | null;
  linked: boolean;
  assignedToThisMap: boolean;
  assignedToOtherMap: boolean;
};

type UnitOption = {
  id: string;
  name: string;
  externalId: string | null;
  accommodationId: string;
  accommodationName: string;
  assigned: boolean;
};

type SpotMapData = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  imagePublicId: string;
  addonPrice: number;
  currency: string;
  accommodationItems: { id: string; name: string }[];
  version: number;
  draftConfig: Record<string, unknown> | null;
};

export type EditorInitialData = {
  spotMap: SpotMapData;
  markers: MarkerData[];
  accommodations: AccommodationOption[];
  units: UnitOption[];
};

type Props = {
  initialData: EditorInitialData;
};

type PendingMarker = { x: number; y: number };

// ── Deep equal (key-order independent) ──────────────────────────

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
}

// ── Normalize config for comparison ─────────────────────────────

function normalizeForCompare(config: MapDraftConfig): MapDraftConfig {
  return {
    ...config,
    markers: [...config.markers]
      .sort((a, b) => a.accommodationId.localeCompare(b.accommodationId))
      .map((m) => ({
        label: m.label,
        x: m.x,
        y: m.y,
        accommodationId: m.accommodationId,
        accommodationName: m.accommodationName,
        accommodationUnitId: m.accommodationUnitId ?? null,
        unitName: m.unitName ?? null,
        priceOverride: m.priceOverride ?? null,
        color: m.color ?? null,
      })),
  };
}

function buildConfigFromInitial(data: EditorInitialData): MapDraftConfig {
  return {
    title: data.spotMap.title,
    subtitle: data.spotMap.subtitle,
    addonPrice: data.spotMap.addonPrice,
    currency: data.spotMap.currency,
    imageUrl: data.spotMap.imageUrl,
    imagePublicId: data.spotMap.imagePublicId,
    markers: data.markers.map((m) => ({
      id: m.id,
      label: m.label,
      x: m.x,
      y: m.y,
      accommodationId: m.accommodationId,
      accommodationName: m.accommodationName,
      accommodationUnitId: m.accommodationUnitId ?? null,
      unitName: m.unitName ?? null,
      priceOverride: m.priceOverride ?? null,
      color: m.color ?? null,
    })),
  };
}

// ── Debounce constants ──────────────────────────────────────────

const PERSIST_DEBOUNCE_MS = 300;
const UNDO_COALESCE_MS = 500;

// ── Component ───────────────────────────────────────────────────

export function SpotBookingEditor({ initialData }: Props) {
  const { spotMap } = initialData;

  // Build the live snapshot (what's actually published)
  const liveSnapshot = useRef<MapDraftConfig>(
    buildConfigFromInitial(initialData),
  );

  // Working config — initialized from draft if resuming, else live
  const [currentConfig, setCurrentConfig] = useState<MapDraftConfig>(() => {
    if (spotMap.draftConfig) {
      const draft = spotMap.draftConfig as unknown as MapDraftConfig;
      // Backfill fields added after draft was saved
      return {
        ...buildConfigFromInitial(initialData),
        ...draft,
        title: draft.title ?? spotMap.title,
        subtitle: draft.subtitle ?? spotMap.subtitle,
        markers: (draft.markers ?? []).map((m) => ({
          ...m,
          accommodationUnitId: m.accommodationUnitId ?? null,
          unitName: m.unitName ?? null,
          priceOverride: m.priceOverride ?? null,
          color: m.color ?? null,
        })),
      };
    }
    return buildConfigFromInitial(initialData);
  });

  // Version tracking for optimistic locking
  const versionRef = useRef(spotMap.version);

  // Accommodations (for the picker)
  const [accommodations] = useState<AccommodationOption[]>(
    initialData.accommodations,
  );

  // Panel state
  type PanelView = "spots" | "settings";
  const [activePanel, setActivePanel] = useState<PanelView>("spots");

  // UI state
  const markers = currentConfig.markers;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [placingMode, setPlacingMode] = useState(false);
  const [pending, setPending] = useState<PendingMarker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [mapLibraryOpen, setMapLibraryOpen] = useState(false);
  const [editLabelValue, setEditLabelValue] = useState("");


  // Pan/zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // ── Undo / Redo ──────────────────────────────────────────────

  const [undoStack, setUndoStack] = useState<MapDraftConfig[]>([]);
  const [redoStack, setRedoStack] = useState<MapDraftConfig[]>([]);
  const coalesceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCoalescing = useRef(false);

  const pushUndo = useCallback(
    (snapshot: MapDraftConfig) => {
      if (isCoalescing.current) return;
      isCoalescing.current = true;

      setUndoStack((prev) => [...prev.slice(-49), snapshot]);
      setRedoStack([]);

      if (coalesceTimer.current) clearTimeout(coalesceTimer.current);
      coalesceTimer.current = setTimeout(() => {
        isCoalescing.current = false;
      }, UNDO_COALESCE_MS);
    },
    [],
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s, currentConfig]);
    setCurrentConfig(prev);
  }, [undoStack, currentConfig]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s, currentConfig]);
    setCurrentConfig(next);
  }, [redoStack, currentConfig]);

  // ── Dirty state (deep equal comparison) ───────────────────────

  const hasChanges = useMemo(
    () =>
      !deepEqual(
        normalizeForCompare(liveSnapshot.current),
        normalizeForCompare(currentConfig),
      ),
    [currentConfig],
  );

  // ── Auto-save debounce (300ms) ────────────────────────────────

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingConfig = useRef<MapDraftConfig | null>(null);

  const flushDraft = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const config = pendingConfig.current;
    if (!config) return;
    pendingConfig.current = null;
    const result = await saveMapDraft(spotMap.id, config);
    if (!result.ok) {
      setError(`Autospar misslyckades: ${result.error}`);
    }
  }, [spotMap.id]);

  useEffect(() => {
    // Only auto-save if there are actual changes vs live
    const dirty = !deepEqual(
      normalizeForCompare(liveSnapshot.current),
      normalizeForCompare(currentConfig),
    );
    if (!dirty) {
      pendingConfig.current = null;
      return;
    }

    pendingConfig.current = currentConfig;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      flushDraft();
    }, PERSIST_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [currentConfig, flushDraft]);

  // ── Publish / Discard state ───────────────────────────────────

  const [isPublishing, setIsPublishing] = useState(false);
  const [isLingeringAfterPublish, setIsLingeringAfterPublish] = useState(false);

  const handlePublish = useCallback(async () => {
    setIsPublishing(true);
    setError(null);

    // Cancel pending debounce and force-save current state
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingConfig.current = null;
    const saveResult = await saveMapDraft(spotMap.id, currentConfig);
    if (!saveResult.ok) {
      setError(`Kunde inte spara utkast: ${saveResult.error}`);
      setIsPublishing(false);
      return;
    }

    const result = await publishMapDraft(spotMap.id, versionRef.current);

    if (!result.ok) {
      setError(result.error);
      setIsPublishing(false);
      return;
    }

    // Update live snapshot to match current state
    liveSnapshot.current = { ...currentConfig };
    versionRef.current = result.data.version;

    // Clear undo/redo
    setUndoStack([]);
    setRedoStack([]);

    setIsPublishing(false);
    setIsLingeringAfterPublish(true);
    setTimeout(() => setIsLingeringAfterPublish(false), 1000);
  }, [spotMap.id, currentConfig, flushDraft]);

  const handleDiscard = useCallback(async () => {
    // Cancel pending saves
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingConfig.current = null;

    await discardMapDraft(spotMap.id);

    // Reset to live snapshot
    setCurrentConfig({ ...liveSnapshot.current });
    setUndoStack([]);
    setRedoStack([]);
    setPending(null);
    setSelectedId(null);
    setError(null);
  }, [spotMap.id]);

  // ── Navigation guard (beforeunload) ───────────────────────────

  useEffect(() => {
    if (!hasChanges) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges]);

  // ── Toast helper ──────────────────────────────────────────────

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // ── Pan handlers ──────────────────────────────────────────────

  const handleCanvasMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (placingMode) return;
      if (e.button !== 0) return;
      setIsDragging(true);
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    },
    [placingMode, pan],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: globalThis.MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPan({
        x: dragStart.current.panX + dx / zoom,
        y: dragStart.current.panY + dy / zoom,
      });
    };

    const handleUp = () => setIsDragging(false);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging, zoom]);

  // ── Zoom handler ──────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((z) => Math.min(4, Math.max(1, z * delta)));
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);

  // ── Placement click ───────────────────────────────────────────

  const handleCanvasClick = useCallback(
    (e: ReactMouseEvent) => {
      if (!placingMode || isDragging) return;
      const img = imageRef.current;
      if (!img) return;

      const rect = img.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      if (x < 0 || x > 100 || y < 0 || y > 100) return;

      // Create marker immediately with auto-generated label
      const nextNum = markers.length + 1;
      const autoLabel = String(nextNum);
      const firstAcc = accommodations[0];

      pushUndo(currentConfig);

      const newMarker: DraftMarker = {
        label: autoLabel,
        x,
        y,
        accommodationId: firstAcc?.id ?? "",
        accommodationName: firstAcc?.name ?? "",
        accommodationUnitId: null,
        unitName: null,
        priceOverride: null,
        color: null,
      };

      setCurrentConfig((prev) => {
        const updated = { ...prev, markers: [...prev.markers, newMarker] };
        // Open detail panel for the newly added marker
        const newIndex = updated.markers.length - 1;
        setTimeout(() => {
          setDetailIndex(newIndex);
          setSelectedId(getMarkerKey(newMarker, newIndex));
        }, 0);
        return updated;
      });

      setPlacingMode(false);
      setPending(null);
      setError(null);
    },
    [placingMode, isDragging, markers.length, accommodations, currentConfig, pushUndo],
  );

  // ── Draft mutations (in-memory, no API calls) ─────────────────

  const deleteMarker = useCallback(
    (index: number) => {
      pushUndo(currentConfig);
      setCurrentConfig((prev) => ({
        ...prev,
        markers: prev.markers.filter((_, i) => i !== index),
      }));
      setSelectedId(null);
      setConfirmDelete(null);
      showToast("Plats borttagen");
    },
    [currentConfig, pushUndo, showToast],
  );

  const saveLabel = useCallback(
    (index: number) => {
      if (!editLabelValue.trim()) return;
      pushUndo(currentConfig);
      setCurrentConfig((prev) => ({
        ...prev,
        markers: prev.markers.map((m, i) =>
          i === index ? { ...m, label: editLabelValue.trim() } : m,
        ),
      }));
      setEditingLabel(null);
      showToast("Etikett uppdaterad");
    },
    [editLabelValue, currentConfig, pushUndo, showToast],
  );

  // ── Settings mutations ─────────────────────────────────────────

  const updateSetting = useCallback(
    (key: keyof MapDraftConfig, value: unknown) => {
      pushUndo(currentConfig);
      setCurrentConfig((prev) => ({ ...prev, [key]: value }));
    },
    [currentConfig, pushUndo],
  );

  // ── Derived state ─────────────────────────────────────────────

  const linkedAccIds = new Set(markers.map((m) => m.accommodationId));
  const availableAccommodations = accommodations.filter(
    (a) => !linkedAccIds.has(a.id),
  );
  const [units, setUnits] = useState<UnitOption[]>(initialData.units);

  const refreshUnits = useCallback(async () => {
    try {
      const res = await fetch(`/api/apps/spot-booking/${spotMap.id}/units`);
      if (!res.ok) return;
      const data = await res.json();
      setUnits(data.units);
    } catch {
      // Silent fail — units will be stale until next page load
    }
  }, [spotMap.id]);
  let canvasClass = "sbe__canvas";
  if (placingMode) canvasClass += " sbe__canvas--placing";
  else if (isDragging) canvasClass += " sbe__canvas--dragging";

  // Use index as key for markers (draft markers may not have IDs)
  const getMarkerKey = (m: DraftMarker, i: number) =>
    m.id ?? `new-${i}-${m.accommodationId}`;

  return (
    <div className="sbe__editor">
      {/* ── Header (mirrors editor-header) ── */}
      <header className="sbe__header">
        <div className="editor-header__nav">
          <Tooltip label="Lamna" placement="bottom">
            <Link href="/apps/spot-booking" className="editor-header__back">
              <EditorIcon name="logout" size={18} style={{ transform: "rotate(180deg)" }} />
            </Link>
          </Tooltip>

          <nav className="editor-header__rail" aria-label="Verktyg">
            <div className="editor-header__rail-divider" />
            <Tooltip label="Platser" placement="bottom">
              <button
                type="button"
                className={`editor-rail__btn${activePanel === "spots" ? " editor-rail__btn--active" : ""}`}
                onClick={() => setActivePanel("spots")}
                aria-pressed={activePanel === "spots"}
              >
                <EditorIcon name="distance" size={20} />
              </button>
            </Tooltip>
            <Tooltip label="Inställningar" placement="bottom">
              <button
                type="button"
                className={`editor-rail__btn${activePanel === "settings" ? " editor-rail__btn--active" : ""}`}
                onClick={() => setActivePanel("settings")}
                aria-pressed={activePanel === "settings"}
              >
                <EditorIcon name="settings" size={18} />
              </button>
            </Tooltip>
          </nav>
        </div>

        <div className="editor-header__spacer" />

        <div className="sbe__header-center">
          <span className="sbe__header-info">{spotMap.accommodationItems.length} boenden</span>
          <span className={`editor-header__status ${hasChanges ? "editor-header__status--unsaved" : "editor-header__status--live"}`}>
            <span className="editor-header__status-dot" />
            {hasChanges ? "Utkast" : "Live"}
          </span>
        </div>

        <div className="editor-header__spacer" />

        {/* ── Publish bar (mirrors EditorPublishBar exactly) ── */}
        <div className="editor-publish">
          <div className="editor-publish__group">
            <Tooltip label="Angra">
              <button
                type="button"
                className="editor-publish__icon-btn"
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                aria-label="Angra"
              >
                <EditorIcon name="undo" size={20} />
              </button>
            </Tooltip>
            <Tooltip label="Gor om">
              <button
                type="button"
                className="editor-publish__icon-btn"
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                aria-label="Gor om"
              >
                <EditorIcon name="redo" size={20} />
              </button>
            </Tooltip>
          </div>

          <Tooltip label="Publicera">
            <button
              type="button"
              className="editor-publish__btn"
              onClick={handlePublish}
              disabled={!hasChanges || isPublishing || isLingeringAfterPublish}
            >
              <PublishSpinner visible={isPublishing} />
              <span>{isLingeringAfterPublish ? "Publicerad" : "Publicera"}</span>
            </button>
          </Tooltip>
        </div>
      </header>

      {/* ── Body (panel + canvas) ── */}
      <div className="sbe__body">
        {/* ── Left panel ── */}
        <div className="sbe__panel">
          {activePanel === "settings" ? (
            <>
              <div className="sbe__panel-header">
                <span className="sbe__panel-title">Inställningar</span>
              </div>
              <div className="sbe__panel-body">
                {error && (
                  <div className="sbe__error">
                    <EditorIcon name="error" size={14} />
                    {error}
                  </div>
                )}
                <div className="sbe__form">
                  <div className="sbe__field">
                    <label className="sbe__field-label">Boenden</label>
                    <span className="sbe__field-hint">Kartan visas vid bokning av dessa boenden</span>
                    <MapAccommodationPicker
                      mapId={spotMap.id}
                      accommodations={initialData.accommodations}
                      assigned={spotMap.accommodationItems}
                      onUpdated={async (items) => {
                        spotMap.accommodationItems = items;
                        await refreshUnits();
                      }}
                    />
                  </div>
                  <div className="sf-field">
                    <label className="sf-label">Kartbild</label>
                    <div className="img-upload">
                      <div
                        className="img-upload-result"
                        onClick={() => setMapLibraryOpen(true)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={currentConfig.imageUrl} alt="Karta" className="img-upload-result-img" />
                        <span className="img-upload-result-filename">Ändra kartbild</span>
                      </div>
                    </div>
                    <MediaLibraryModal
                      open={mapLibraryOpen}
                      onClose={() => setMapLibraryOpen(false)}
                      onConfirm={(asset: MediaLibraryResult) => {
                        setMapLibraryOpen(false);
                        pushUndo(currentConfig);
                        setCurrentConfig((prev) => ({
                          ...prev,
                          imageUrl: asset.url,
                          imagePublicId: asset.publicId ?? prev.imagePublicId,
                        }));
                      }}
                      currentValue={currentConfig.imageUrl}
                      uploadFolder="spot-maps"
                      accept="image"
                    />
                  </div>
                  <div className="sf-field">
                    <label className="sf-label">Rubrik</label>
                    <input
                      type="text"
                      className="sf-input"
                      placeholder="Välj din plats"
                      value={currentConfig.title}
                      onChange={(e) => updateSetting("title", e.target.value)}
                    />
                  </div>
                  <div className="sf-field">
                    <label className="sf-label">Beskrivning</label>
                    <textarea
                      className="sf-textarea"
                      placeholder="Välj exakt var du vill bo på området"
                      value={currentConfig.subtitle}
                      onChange={(e) => updateSetting("subtitle", e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="sbe__field">
                    <label className="sbe__field-label">Tilläggsavgift</label>
                    <span className="sbe__field-hint">
                      Standardpris — gästen betalar detta för att välja en specifik plats
                    </span>
                    <div className="sbe__price-input-wrap">
                      <input
                        type="number"
                        className="admin-input--sm sbe__price-input"
                        value={Math.round(currentConfig.addonPrice / 100)}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (!isNaN(v) && v >= 0) updateSetting("addonPrice", v * 100);
                        }}
                        min={0}
                        step={1}
                      />
                      <span className="sbe__price-suffix">kr</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* ── Spots panel — two-pane slide (mirrors editor section tree) ── */
            <div className="sp-transition">
              <div className={`sp-transition__track${detailIndex !== null ? " sp-transition__track--detail" : ""}`}>
                {/* ── Pane 1: Marker list ── */}
                <div className="sp-transition__pane">
                  <div className="sbe__panel-header">
                    <span className="sbe__panel-title">Platser</span>
                    <span className="sbe__panel-count">{markers.length}</span>
                  </div>
                  <div className="sbe__panel-body">
                    {error && (
                      <div className="sbe__error">
                        <EditorIcon name="error" size={14} />
                        {error}
                      </div>
                    )}
                    <div className="sbe__marker-list">
                      {markers.map((m, i) => {
                        const key = getMarkerKey(m, i);
                        return (
                          <div
                            key={key}
                            className={`sbe__marker-row${selectedId === key ? " sbe__marker-row--selected" : ""}`}
                            onClick={() => {
                              setSelectedId(key);
                              setDetailIndex(i);
                            }}
                          >
                            <div
                              className="sbe__marker-row-dot"
                              style={m.color ? { background: m.color, color: resolveContrastPalette(m.color).text } : undefined}
                            >
                              {m.label.slice(0, 2)}
                            </div>
                            <div className="sbe__marker-row-info">
                              <span className="sbe__marker-row-acc">{m.unitName ?? m.accommodationName}</span>
                            </div>
                            <EditorIcon name="chevron_right" size={18} className="sbe__marker-row-chevron" />
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        className="sbe__add-marker-btn"
                        onClick={() => { setPlacingMode(true); setSelectedId(null); }}
                      >
                        <EditorIcon name="add_circle" size={20} />
                        Lägg till markör
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Pane 2: Marker detail panel ── */}
                <div className="sp-transition__pane">
                  {detailIndex !== null && markers[detailIndex] && (
                    <MarkerDetailPanel
                      marker={markers[detailIndex]}
                      index={detailIndex}
                      defaultPrice={currentConfig.addonPrice}
                      accommodations={accommodations}
                      units={units}
                      allMarkers={markers}
                      onBack={() => { setDetailIndex(null); setSelectedId(null); }}
                      onUpdate={(index, patch) => {
                        pushUndo(currentConfig);
                        setCurrentConfig((prev) => ({
                          ...prev,
                          markers: prev.markers.map((mk, idx) =>
                            idx === index ? { ...mk, ...patch } : mk,
                          ),
                        }));
                      }}
                      onDelete={(index) => setConfirmDelete(String(index))}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Canvas ── */}
        <div
          ref={canvasRef}
          className={canvasClass}
          onMouseDown={handleCanvasMouseDown}
          onClick={handleCanvasClick}
        >
          <div
            className="sbe__canvas-inner"
            style={{
              transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={currentConfig.imageUrl}
              alt="Karta"
              className="sbe__canvas-image"
              draggable={false}
            />

            {markers.map((m, i) => {
              const key = getMarkerKey(m, i);
              const dotStyle: React.CSSProperties = m.color
                ? { background: m.color, color: resolveContrastPalette(m.color).text }
                : {};
              return (
                <div
                  key={key}
                  className={`sbe__marker${selectedId === key ? " sbe__marker--selected" : ""}`}
                  style={{ left: `${m.x}%`, top: `${m.y}%` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(selectedId === key ? null : key);
                    setPending(null);
                  }}
                >
                  <div className="sbe__marker-dot" style={dotStyle}>
                    {m.label.slice(0, 3)}
                  </div>
                </div>
              );
            })}

          </div>
        </div>
      </div>

      {/* Confirm delete dialog */}
      {confirmDelete !== null && (
        <div
          className="sbe__confirm-overlay"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="sbe__confirm-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="sbe__confirm-title">Ta bort plats?</h3>
            <p className="sbe__confirm-text">
              Platsen tas bort fran utkastet. Publicera for att tilllampa andringen.
            </p>
            <div className="sbe__confirm-actions">
              <button
                className="admin-btn admin-btn--outline admin-btn--sm"
                onClick={() => setConfirmDelete(null)}
              >
                Avbryt
              </button>
              <button
                className="admin-btn admin-btn--danger admin-btn--sm"
                onClick={() => deleteMarker(parseInt(confirmDelete, 10))}
              >
                Ta bort
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="sbe__toast">{toast}</div>}

    </div>
  );
}

// ── Marker detail panel (mirrors editor DetailPanel) ──────────────

function MarkerDetailPanel({
  marker,
  index,
  defaultPrice,
  accommodations,
  units,
  allMarkers,
  onBack,
  onUpdate,
  onDelete,
}: {
  marker: DraftMarker;
  index: number;
  defaultPrice: number;
  accommodations: AccommodationOption[];
  units: UnitOption[];
  allMarkers: DraftMarker[];
  onBack: () => void;
  onUpdate: (index: number, patch: Partial<DraftMarker>) => void;
  onDelete: (index: number) => void;
}) {
  const [labelValue, setLabelValue] = useState(marker.label);
  const [priceValue, setPriceValue] = useState(
    marker.priceOverride != null ? String(Math.round(marker.priceOverride / 100)) : "",
  );

  // Sync local state when marker changes (undo/redo, external update)
  useEffect(() => { setLabelValue(marker.label); }, [marker.label]);
  useEffect(() => {
    if (marker.priceOverride != null) {
      setPriceValue(String(Math.round(marker.priceOverride / 100)));
    } else {
      setPriceValue("");
    }
  }, [marker.priceOverride]);

  // Available accommodations: exclude those already linked by OTHER markers
  const linkedByOthers = new Set(
    allMarkers
      .filter((_, i) => i !== index)
      .map((m) => m.accommodationId),
  );

  return (
    <>
      <div className="dp-header">
        <button
          type="button"
          className="dp-header__back"
          onClick={onBack}
          aria-label="Tillbaka"
        >
          <EditorIcon name="arrow_back" size={18} />
        </button>
        <span className="dp-header__title">{marker.label}</span>
        <div className="dp-header__spacer" />
        <button
          type="button"
          className="sbe__action-btn sbe__action-btn--danger"
          title="Ta bort"
          onClick={() => onDelete(index)}
        >
          <EditorIcon name="delete" size={16} />
        </button>
      </div>
      <div className="dp-divider" />
      <div className="dp-body">
        {/* ── Label ── */}
        <div className="sbe__dp-section">
          <label className="sbe__dp-label">Etikett</label>
          <input
            type="text"
            className="admin-input--sm"
            value={labelValue}
            maxLength={20}
            onChange={(e) => setLabelValue(e.target.value)}
            onBlur={() => {
              const trimmed = labelValue.trim();
              if (trimmed && trimmed !== marker.label) {
                onUpdate(index, { label: trimmed });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const trimmed = labelValue.trim();
                if (trimmed && trimmed !== marker.label) {
                  onUpdate(index, { label: trimmed });
                }
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        </div>

        {/* ── Unit (physical resource picker) ── */}
        <div className="sbe__dp-section">
          <label className="sbe__dp-label">Enhet</label>
          <UnitPicker
            units={units}
            selectedId={marker.accommodationUnitId ?? null}
            linkedByOthers={linkedByOthers}
            allMarkers={allMarkers}
            currentIndex={index}
            onSelect={(unit) => {
              if (unit) {
                const parentAcc = accommodations.find((a) => a.id === unit.accommodationId);
                onUpdate(index, {
                  accommodationUnitId: unit.id,
                  unitName: unit.name,
                  accommodationId: unit.accommodationId,
                  accommodationName: parentAcc?.name ?? unit.accommodationName,
                });
              } else {
                onUpdate(index, {
                  accommodationUnitId: null,
                  unitName: null,
                });
              }
            }}
          />
        </div>

        {/* ── Price ── */}
        <div className="sbe__dp-section">
          <label className="sbe__dp-label">Pris</label>
          <div className="sbe__price-input-wrap sbe__dp-price-input">
            <input
              type="number"
              className="admin-input--sm sbe__price-input"
              value={priceValue || String(Math.round(defaultPrice / 100))}
              onChange={(e) => {
                const raw = e.target.value;
                setPriceValue(raw);
                const v = parseInt(raw, 10);
                if (!isNaN(v) && v >= 0) {
                  const isDefault = v * 100 === defaultPrice;
                  onUpdate(index, { priceOverride: isDefault ? null : v * 100 });
                }
              }}
              min={0}
              step={1}
            />
            <span className="sbe__price-suffix">kr</span>
          </div>
        </div>

        {/* ── Marker color ── */}
        <div className="sbe__dp-section">
          <ColorTokenField
            label="Markörfärg"
            value={marker.color ?? "#4f6df5"}
            onChange={(hex) => onUpdate(index, { color: hex })}
          />
        </div>
      </div>
    </>
  );
}

// ── Map accommodation picker (multi-select) ─────────────────────

function MapAccommodationPicker({
  mapId,
  accommodations,
  assigned,
  onUpdated,
}: {
  mapId: string;
  accommodations: AccommodationOption[];
  assigned: { id: string; name: string }[];
  onUpdated: (items: { id: string; name: string }[]) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(assigned.map((a) => a.id)));
  const [saving, setSaving] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupTop, setPopupTop] = useState(0);

  // Only show accommodations that are available (assigned to this map OR unassigned)
  const pickable = accommodations.filter((a) => a.assignedToThisMap || !a.assignedToOtherMap);

  const query = search.trim().toLowerCase();
  const filtered = query
    ? pickable.filter((a) => a.name.toLowerCase().includes(query))
    : pickable;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        handleClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, selected]);

  const openPopup = () => {
    if (triggerRef.current) {
      setPopupTop(triggerRef.current.getBoundingClientRect().top);
    }
    setOpen(true);
    setSearch("");
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleClose = async () => {
    // Check if selection changed
    const originalIds = new Set(assigned.map((a) => a.id));
    const changed = selected.size !== originalIds.size || [...selected].some((id) => !originalIds.has(id));

    if (changed && selected.size > 0) {
      setSaving(true);
      const result = await updateSpotMapAccommodations(mapId, Array.from(selected));
      setSaving(false);
      if (result.ok) {
        const newItems = Array.from(selected).map((id) => {
          const acc = accommodations.find((a) => a.id === id);
          return { id, name: acc?.name ?? "" };
        });
        await onUpdated(newItems);
      }
    }

    setOpen(false);
    setSearch("");
  };

  const displayName = assigned[0]?.name ?? "Välj boenden...";
  const extra = assigned.length > 1 ? ` + ${assigned.length - 1}` : "";

  const popupContent = open && typeof document !== "undefined" && createPortal(
    <div className="sp-resource-popup" ref={popupRef} style={{ top: popupTop }}>
      <div className="pk-popup__search">
        <svg className="pk-popup__search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M11.5 11.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <input
          type="text"
          className="pk-popup__search-input"
          placeholder="Sök boende..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
        {search && (
          <button type="button" className="pk-popup__search-clear" onClick={() => setSearch("")}>
            <EditorIcon name="close" size={14} />
          </button>
        )}
      </div>
      <div className="sp-resource-popup__list">
        {filtered.length === 0 ? (
          <div className="sp-resource-popup__empty">Inga resultat</div>
        ) : (
          filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`sp-resource-popup__item${selected.has(a.id) ? " sp-resource-popup__item--active" : ""}`}
              onClick={() => toggle(a.id)}
            >
              {a.imageUrl ? (
                <img src={a.imageUrl} alt="" className="sp-resource-popup__item-img" />
              ) : (
                <div className="sp-resource-popup__item-img sp-resource-popup__item-img--empty">
                  <EditorIcon name="hotel" size={12} />
                </div>
              )}
              <span className="sp-resource-popup__item-title">{a.name}</span>
              {selected.has(a.id) && (
                <EditorIcon name="check" size={16} style={{ color: "var(--admin-accent)", flexShrink: 0 }} />
              )}
            </button>
          ))
        )}
      </div>
    </div>,
    document.body,
  );

  return (
    <div className="sp-resource-picker">
      <button
        ref={triggerRef}
        type="button"
        className="sp-resource-picker__trigger"
        onClick={() => open ? handleClose() : openPopup()}
      >
        <div className="sp-resource-picker__thumb sp-resource-popup__item-img--empty">
          <EditorIcon name="hotel" size={14} />
        </div>
        <span className="sp-resource-picker__trigger-text">
          <span className="sp-resource-picker__value">
            {saving ? "Sparar..." : `${displayName}${extra}`}
          </span>
        </span>
        <EditorIcon name="unfold_more" size={16} className="sp-resource-picker__icon" />
      </button>
      {popupContent}
    </div>
  );
}

// ── Unit picker (sp-resource-picker pattern) ─────────────────────

function UnitPicker({
  units,
  selectedId,
  linkedByOthers,
  allMarkers,
  currentIndex,
  onSelect,
}: {
  units: UnitOption[];
  selectedId: string | null;
  linkedByOthers: Set<string>;
  allMarkers: DraftMarker[];
  currentIndex: number;
  onSelect: (unit: UnitOption | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupTop, setPopupTop] = useState(0);

  const selected = units.find((u) => u.id === selectedId) ?? null;

  // Units already assigned to OTHER markers in this draft
  const assignedByOthers = new Set(
    allMarkers
      .filter((_, i) => i !== currentIndex)
      .map((m) => m.accommodationUnitId)
      .filter(Boolean) as string[],
  );

  const query = search.trim().toLowerCase();
  const filtered = (query
    ? units.filter((u) => u.name.toLowerCase().includes(query) || u.accommodationName.toLowerCase().includes(query))
    : units
  ).filter((u) => u.id === selectedId || !assignedByOthers.has(u.id));

  // Group units by accommodation name
  const groups = useMemo(() => {
    const map = new Map<string, UnitOption[]>();
    for (const u of filtered) {
      const group = map.get(u.accommodationName) ?? [];
      group.push(u);
      map.set(u.accommodationName, group);
    }
    return map;
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); setSearch(""); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const openPopup = () => {
    if (triggerRef.current) {
      setPopupTop(triggerRef.current.getBoundingClientRect().top);
    }
    setOpen(true);
    setSearch("");
  };

  const popupContent = open && typeof document !== "undefined" && createPortal(
    <div className="sp-resource-popup" ref={popupRef} style={{ top: popupTop }}>
      <div className="pk-popup__search">
        <svg className="pk-popup__search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M11.5 11.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <input
          type="text"
          className="pk-popup__search-input"
          placeholder="Sök enhet..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
          autoFocus
        />
        {search && (
          <button type="button" className="pk-popup__search-clear" onClick={() => setSearch("")}>
            <EditorIcon name="close" size={14} />
          </button>
        )}
      </div>
      <div className="sp-resource-popup__list">
        {units.length === 0 ? (
          <div className="sp-resource-popup__empty">Inga enheter synkade ännu. Kör en PMS-synk för att hämta platser.</div>
        ) : filtered.length === 0 ? (
          <div className="sp-resource-popup__empty">Inga tillgängliga enheter</div>
        ) : (
          [...groups.entries()].map(([groupName, groupUnits]) => (
            <div key={groupName}>
              {groups.size > 1 && (
                <div className="sp-resource-popup__group-label">{groupName}</div>
              )}
              {groupUnits.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={`sp-resource-popup__item${u.id === selectedId ? " sp-resource-popup__item--active" : ""}`}
                  onClick={() => { onSelect(u); setOpen(false); setSearch(""); }}
                >
                  <div className="sp-resource-popup__item-img sp-resource-popup__item-img--empty">
                    <EditorIcon name="location_on" size={12} />
                  </div>
                  <div className="sp-resource-popup__item-info">
                    <span className="sp-resource-popup__item-title">{u.name}</span>
                    {groups.size <= 1 && (
                      <span className="sp-resource-popup__item-sub">{u.accommodationName}</span>
                    )}
                  </div>
                  {u.id === selectedId && (
                    <EditorIcon name="check" size={16} style={{ color: "var(--admin-accent)", flexShrink: 0 }} />
                  )}
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>,
    document.body,
  );

  return (
    <div className="sp-resource-picker">
      <button
        ref={triggerRef}
        type="button"
        className="sp-resource-picker__trigger"
        onClick={() => open ? setOpen(false) : openPopup()}
      >
        <div className="sp-resource-picker__thumb sp-resource-popup__item-img--empty">
          <EditorIcon name="location_on" size={14} />
        </div>
        <span className="sp-resource-picker__trigger-text">
          <span className="sp-resource-picker__value">
            {selected?.name ?? "Välj enhet..."}
          </span>
        </span>
        <EditorIcon name="unfold_more" size={16} className="sp-resource-picker__icon" />
      </button>
      {popupContent}
    </div>
  );
}

// ── Publish spinner (matches EditorPublishBar) ──────────────────

function PublishSpinner({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [animState, setAnimState] = useState<"enter" | "exit" | "idle">("idle");
  const prevVisible = useRef(visible);

  useEffect(() => {
    if (visible && !prevVisible.current) {
      setMounted(true);
      setAnimState("enter");
    } else if (!visible && prevVisible.current) {
      setAnimState("exit");
    }
    prevVisible.current = visible;
  }, [visible]);

  const handleAnimationEnd = () => {
    if (animState === "exit") {
      setMounted(false);
      setAnimState("idle");
    } else if (animState === "enter") {
      setAnimState("idle");
    }
  };

  if (!mounted) return null;

  return (
    <svg
      className={`publish-spinner ${animState === "exit" ? "publish-spinner--out" : ""}`}
      width="18"
      height="18"
      viewBox="0 0 21 21"
      fill="none"
      onAnimationEnd={handleAnimationEnd}
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" strokeDasharray="33 14.1" strokeLinecap="round" />
    </svg>
  );
}
