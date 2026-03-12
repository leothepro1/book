"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { MapConfig } from "./maps-constants";
import { STYLE_OPTIONS, getMapThumbnail } from "./maps-constants";

export function MapListView({
  maps,
  onEdit,
  onDelete,
  onDuplicate,
  onCreate,
}: {
  maps: MapConfig[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onCreate: () => void;
}) {
  if (maps.length === 0) {
    return (
      <div className="maps-empty">
        <span className="material-symbols-rounded" style={{ fontSize: 48, color: "#C8C7C5" }}>
          map
        </span>
        <h2 className="maps-empty__title">Inga kartor ännu</h2>
        <p className="maps-empty__desc">
          Skapa din första karta och använd den i gästportalen.
        </p>
        <button className="maps-create-btn" onClick={onCreate}>
          <span className="material-symbols-rounded" style={{ fontSize: 18 }}>add</span>
          Skapa karta
        </button>
      </div>
    );
  }

  return (
    <div className="maps-grid">
      {maps.map((map) => (
        <MapCard
          key={map.id}
          map={map}
          onEdit={() => onEdit(map.id)}
          onDelete={() => onDelete(map.id)}
          onDuplicate={() => onDuplicate(map.id)}
        />
      ))}
    </div>
  );
}

function MapCard({
  map,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  map: MapConfig;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuListRef = useRef<HTMLDivElement>(null);
  const styleLabel = STYLE_OPTIONS.find((s) => s.value === map.style)?.label || map.style;
  const mapName = map.name || "Namnlös karta";

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuBtnRef.current?.contains(t)) return;
      if (menuListRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <>
      <div className="maps-card" onClick={onEdit}>
        <div className="maps-card__preview">
          <img
            className="maps-card__thumbnail"
            src={getMapThumbnail(map.style)}
            alt={styleLabel}
            draggable={false}
          />
          <button
            ref={menuBtnRef}
            className="maps-card__menu-btn"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            aria-label="Alternativ"
          >
            <span className="material-symbols-rounded" style={{ fontSize: 20 }}>more_vert</span>
          </button>
          {menuOpen && (() => {
            const rect = menuBtnRef.current?.getBoundingClientRect();
            if (!rect) return null;
            return createPortal(
              <div
                ref={menuListRef}
                className="maps-card__menu"
                style={{ top: rect.bottom + 4, left: rect.right - 180 }}
              >
                <button
                  className="maps-card__menu-item"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(); }}
                >
                  <span className="material-symbols-rounded" style={{ fontSize: 18 }}>edit</span>
                  Byt namn
                </button>
                <button
                  className="maps-card__menu-item"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDuplicate(); }}
                >
                  <span className="material-symbols-rounded" style={{ fontSize: 18 }}>content_copy</span>
                  Duplicera
                </button>
                <button
                  className="maps-card__menu-item maps-card__menu-item--danger"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setConfirmOpen(true); }}
                >
                  <span className="material-symbols-rounded" style={{ fontSize: 18 }}>delete</span>
                  Ta bort
                </button>
              </div>,
              document.body
            );
          })()}
        </div>
        <div className="maps-card__body">
          <div className="maps-card__name">{mapName}</div>
          <div className="maps-card__meta">
            {styleLabel}
            {map.markers.length > 0 && ` · ${map.markers.length} markörer`}
            {map.buildings3d && " · 3D"}
          </div>
        </div>
      </div>

      {confirmOpen && createPortal(
        <DeleteConfirmModal
          name={mapName}
          onClose={() => setConfirmOpen(false)}
          onConfirm={async () => {
            await onDelete();
            setConfirmOpen(false);
          }}
        />,
        document.body
      )}
    </>
  );
}

function DeleteConfirmModal({
  name,
  onClose,
  onConfirm,
}: {
  name: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    await onConfirm();
  }, [deleting, onConfirm]);

  return (
    <div className="maps-confirm-overlay" onClick={onClose}>
      <div className="maps-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="maps-confirm-title">Ta bort {name}</h3>
        <p className="maps-confirm-body">
          Borttagna kartor kan inte återställas. Vill du ändå fortsätta?
        </p>
        <div className="maps-confirm-actions">
          <button
            className="maps-confirm-btn maps-confirm-btn--cancel"
            onClick={onClose}
            disabled={deleting}
          >
            Avbryt
          </button>
          <button
            className="maps-confirm-btn maps-confirm-btn--delete"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting && (
              <svg className="maps-confirm-spinner" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="28" strokeDashoffset="8" />
              </svg>
            )}
            {deleting ? "Tar bort..." : "Ta bort"}
          </button>
        </div>
      </div>
    </div>
  );
}
