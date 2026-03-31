"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type MouseEvent as ReactMouseEvent,
} from "react";
import Link from "next/link";
import { EditorIcon } from "@/app/_components/EditorIcon";
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
};

type AccommodationOption = {
  id: string;
  name: string;
  slug: string;
  externalCode: string | null;
  linked: boolean;
};

type SpotMapData = {
  id: string;
  imageUrl: string;
  addonPrice: number;
  currency: string;
  category: { id: string; title: string };
};

export type EditorInitialData = {
  spotMap: SpotMapData;
  markers: MarkerData[];
  accommodations: AccommodationOption[];
};

type Props = {
  initialData: EditorInitialData;
};

type PendingMarker = { x: number; y: number };

// ── Component ───────────────────────────────────────────────────

export function SpotBookingEditor({ initialData }: Props) {
  const { spotMap } = initialData;

  // State
  const [markers, setMarkers] = useState<MarkerData[]>(initialData.markers);
  const [accommodations, setAccommodations] = useState<AccommodationOption[]>(
    initialData.accommodations,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placingMode, setPlacingMode] = useState(false);
  const [pending, setPending] = useState<PendingMarker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editLabelValue, setEditLabelValue] = useState("");

  // New marker form
  const [newLabel, setNewLabel] = useState("");
  const [newAccId, setNewAccId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Pan/zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // ── Toast helper ────────────────────────────────────────────

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // ── Pan handlers ────────────────────────────────────────────

  const handleCanvasMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (placingMode) return; // placement uses click, not drag
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

  // ── Zoom handler ────────────────────────────────────────────

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

  // ── Placement click ─────────────────────────────────────────

  const handleCanvasClick = useCallback(
    (e: ReactMouseEvent) => {
      if (!placingMode || isDragging) return;
      const img = imageRef.current;
      if (!img) return;

      const rect = img.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      if (x < 0 || x > 100 || y < 0 || y > 100) return;

      setPending({ x, y });
      setPlacingMode(false);
      setSelectedId(null);
      setNewLabel("");
      setNewAccId(null);
      setSearchQuery("");
      setError(null);
    },
    [placingMode, isDragging],
  );

  // ── Save new marker ─────────────────────────────────────────

  const handleSaveMarker = useCallback(async () => {
    if (!pending || !newAccId || !newLabel.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/apps/spot-booking/markers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spotMapId: spotMap.id,
          accommodationId: newAccId,
          label: newLabel.trim(),
          x: pending.x,
          y: pending.y,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Kunde inte spara markering");
        setSaving(false);
        return;
      }

      const created: MarkerData = data.marker;
      setMarkers((prev) => [...prev, created]);
      setAccommodations((prev) =>
        prev.map((a) =>
          a.id === newAccId ? { ...a, linked: true } : a,
        ),
      );
      setPending(null);
      setNewLabel("");
      setNewAccId(null);
      setSearchQuery("");
      showToast("Plats sparad");
    } catch {
      setError("Natverksfel — forsok igen");
    } finally {
      setSaving(false);
    }
  }, [pending, newAccId, newLabel, spotMap.id, showToast]);

  // ── Delete marker ───────────────────────────────────────────

  const handleDelete = useCallback(
    async (markerId: string) => {
      const marker = markers.find((m) => m.id === markerId);
      if (!marker) return;

      setSaving(true);
      try {
        const res = await fetch(
          `/api/apps/spot-booking/markers/${markerId}`,
          { method: "DELETE" },
        );

        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? "Kunde inte ta bort markering");
          setSaving(false);
          return;
        }

        setMarkers((prev) => prev.filter((m) => m.id !== markerId));
        setAccommodations((prev) =>
          prev.map((a) =>
            a.id === marker.accommodationId ? { ...a, linked: false } : a,
          ),
        );
        if (selectedId === markerId) setSelectedId(null);
        setConfirmDelete(null);
        showToast("Plats borttagen");
      } catch {
        setError("Natverksfel — forsok igen");
      } finally {
        setSaving(false);
      }
    },
    [markers, selectedId, showToast],
  );

  // ── Save label edit ─────────────────────────────────────────

  const handleSaveLabel = useCallback(
    async (markerId: string) => {
      if (!editLabelValue.trim()) return;

      setSaving(true);
      try {
        const res = await fetch(
          `/api/apps/spot-booking/markers/${markerId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: editLabelValue.trim() }),
          },
        );

        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? "Kunde inte uppdatera");
          setSaving(false);
          return;
        }

        const data = await res.json();
        setMarkers((prev) =>
          prev.map((m) =>
            m.id === markerId ? { ...m, label: data.marker.label } : m,
          ),
        );
        setEditingLabel(null);
        showToast("Etikett uppdaterad");
      } catch {
        setError("Natverksfel — forsok igen");
      } finally {
        setSaving(false);
      }
    },
    [editLabelValue, showToast],
  );

  // ── Filtered accommodations for search ──────────────────────

  const availableAccommodations = accommodations.filter((a) => !a.linked);
  const filteredAccommodations = searchQuery
    ? availableAccommodations.filter((a) =>
        a.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : availableAccommodations;

  // ── View mode ───────────────────────────────────────────────

  const showForm = pending !== null;

  // ── Canvas class ────────────────────────────────────────────

  let canvasClass = "sbe__canvas";
  if (placingMode) canvasClass += " sbe__canvas--placing";
  else if (isDragging) canvasClass += " sbe__canvas--dragging";

  return (
    <div className="sbe__layout">
      {/* Top bar */}
      <div className="sbe__topbar">
        <Link href="/apps" className="sbe__topbar-back">
          <EditorIcon name="arrow_back" size={18} />
          Appar
        </Link>
        <h1 className="sbe__topbar-title">Platsbokning</h1>
        <span className="sbe__topbar-meta">
          {spotMap.category.title} · {markers.length} platser
        </span>
      </div>

      {/* Map canvas */}
      <div
        ref={canvasRef}
        className={canvasClass}
        onMouseDown={handleCanvasMouseDown}
        onClick={handleCanvasClick}
      >
        {/* Toolbar */}
        <div className="sbe__canvas-toolbar">
          <button
            className={`sbe__toolbar-btn${placingMode ? " sbe__toolbar-btn--active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setPlacingMode(!placingMode);
              if (pending) setPending(null);
            }}
          >
            <EditorIcon name="add_location" size={16} />
            {placingMode ? "Avbryt" : "Lagg till plats"}
          </button>
          <button
            className="sbe__toolbar-btn"
            onClick={(e) => {
              e.stopPropagation();
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            <EditorIcon name="fit_screen" size={16} />
            Aterstall
          </button>
        </div>

        {/* Zoom indicator */}
        <div className="sbe__zoom-indicator">{Math.round(zoom * 100)}%</div>

        {/* Map image + markers */}
        <div
          className="sbe__canvas-inner"
          style={{
            transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={spotMap.imageUrl}
            alt="Karta"
            className="sbe__canvas-image"
            draggable={false}
          />

          {/* Placed markers */}
          {markers.map((m) => (
            <div
              key={m.id}
              className={`sbe__marker${selectedId === m.id ? " sbe__marker--selected" : ""}`}
              style={{ left: `${m.x}%`, top: `${m.y}%` }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(selectedId === m.id ? null : m.id);
                setPending(null);
              }}
            >
              <div className="sbe__marker-dot">
                {m.label.slice(0, 3)}
              </div>
              <div className="sbe__marker-label">{m.label}</div>
            </div>
          ))}

          {/* Pending marker */}
          {pending && (
            <div
              className="sbe__marker sbe__marker--pending"
              style={{ left: `${pending.x}%`, top: `${pending.y}%` }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sbe__marker-dot">
                <EditorIcon name="add" size={16} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="sbe__panel">
        <div className="sbe__panel-header">
          <h2 className="sbe__panel-title">
            {showForm ? "Konfigurera plats" : "Platser"}
          </h2>
          {!showForm && (
            <p className="sbe__panel-subtitle">
              {markers.length} {markers.length === 1 ? "plats" : "platser"} markerade
            </p>
          )}
        </div>

        <div className="sbe__panel-body">
          {error && (
            <div className="sbe__error">
              <EditorIcon name="error" size={14} />
              {error}
            </div>
          )}

          {showForm ? (
            /* ── New marker form ── */
            <div className="sbe__form">
              <div className="sbe__field">
                <label className="sbe__field-label">Etikett</label>
                <input
                  type="text"
                  className="admin-input--sm"
                  placeholder="t.ex. 32a"
                  maxLength={20}
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  autoFocus
                />
                <span className="sbe__field-hint">Max 20 tecken</span>
              </div>

              <div className="sbe__field">
                <label className="sbe__field-label">Boende</label>
                <div className="sbe__search-select">
                  <input
                    type="text"
                    className="admin-input--sm sbe__search-input"
                    placeholder="Sok boende..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <div className="sbe__search-list">
                    {filteredAccommodations.length === 0 ? (
                      <div className="sbe__search-empty">
                        Inga tillgangliga boenden
                      </div>
                    ) : (
                      filteredAccommodations.map((a) => (
                        <div
                          key={a.id}
                          className={`sbe__search-item${newAccId === a.id ? " sbe__search-item--selected" : ""}`}
                          onClick={() => {
                            setNewAccId(a.id);
                            setSearchQuery(a.name);
                          }}
                        >
                          {a.name}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="sbe__field">
                <span className="sbe__field-hint">
                  Position: ({pending.x.toFixed(1)}%, {pending.y.toFixed(1)}%)
                </span>
              </div>
            </div>
          ) : markers.length === 0 ? (
            /* ── Empty state ── */
            <div className="sbe__empty">
              <div className="sbe__empty-icon">
                <EditorIcon name="location_on" size={40} />
              </div>
              <p className="sbe__empty-text">
                Inga platser tillagda an. Klicka pa &quot;Lagg till plats&quot; och sedan pa kartan for att borja.
              </p>
            </div>
          ) : (
            /* ── Marker list ── */
            <div className="sbe__marker-list">
              {markers.map((m) => (
                <div
                  key={m.id}
                  className={`sbe__marker-row${selectedId === m.id ? " sbe__marker-row--selected" : ""}`}
                  onClick={() =>
                    setSelectedId(selectedId === m.id ? null : m.id)
                  }
                >
                  <div className="sbe__marker-row-dot">
                    {m.label.slice(0, 2)}
                  </div>
                  <div className="sbe__marker-row-info">
                    {editingLabel === m.id ? (
                      <div className="sbe__inline-edit">
                        <input
                          type="text"
                          className="admin-input--sm sbe__inline-edit-input"
                          value={editLabelValue}
                          maxLength={20}
                          onChange={(e) => setEditLabelValue(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveLabel(m.id);
                            if (e.key === "Escape") setEditingLabel(null);
                          }}
                          autoFocus
                        />
                        <button
                          className="sbe__action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveLabel(m.id);
                          }}
                          disabled={saving}
                        >
                          <EditorIcon name="check" size={16} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="sbe__marker-row-label">{m.label}</div>
                        <div className="sbe__marker-row-acc">
                          {m.accommodationName}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="sbe__marker-row-actions">
                    <button
                      className="sbe__action-btn"
                      title="Redigera etikett"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingLabel(m.id);
                        setEditLabelValue(m.label);
                      }}
                    >
                      <EditorIcon name="edit" size={14} />
                    </button>
                    <button
                      className="sbe__action-btn sbe__action-btn--danger"
                      title="Ta bort"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(m.id);
                      }}
                    >
                      <EditorIcon name="delete" size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer — only for new marker form */}
        {showForm && (
          <div className="sbe__panel-footer">
            <button
              className="admin-btn admin-btn--outline admin-btn--sm"
              onClick={() => {
                setPending(null);
                setError(null);
              }}
            >
              Avbryt
            </button>
            <button
              className="admin-btn admin-btn--accent admin-btn--sm"
              disabled={!newLabel.trim() || !newAccId || saving}
              onClick={handleSaveMarker}
            >
              {saving ? "Sparar..." : "Spara plats"}
            </button>
          </div>
        )}
      </div>

      {/* Confirm delete dialog */}
      {confirmDelete && (
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
              Boendet blir synligt i sokresultaten igen.
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
                disabled={saving}
                onClick={() => handleDelete(confirmDelete)}
              >
                {saving ? "Tar bort..." : "Ta bort"}
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
