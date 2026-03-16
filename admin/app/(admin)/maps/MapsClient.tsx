"use client";

/**
 * MapsClient — Full CRUD admin page for map configurations.
 *
 * Split into modules:
 *   - maps-constants.ts    — shared constants, helpers, types
 *   - MapPreview.tsx        — live Mapbox GL preview
 *   - MapListView.tsx       — card grid list view
 *   - MapDetailView.tsx     — detail form (address, style, camera, toggles)
 *   - MarkersSection.tsx    — marker cards, DnD, rich text editor, panels
 */

import { useCallback, useState, useEffect, useMemo } from "react";
import { PreviewProvider, usePreview } from "../_components/GuestPreview";
import { PublishBarProvider, PublishBar, usePublishBar } from "../_components/PublishBar";
import { useDraftUpdate } from "../_hooks/useDraftUpdate";
import { useNavigationGuard } from "../_components/NavigationGuard";
import { themeToStyleAttr } from "@/app/(guest)/_lib/theme/applyTheme";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import type { MapConfig } from "./maps-constants";
import { createId, createMarkerId, DEFAULT_MAP } from "./maps-constants";
import { MapPreview } from "./MapPreview";
import { MapListView } from "./MapListView";
import { MapDetailView } from "./MapDetailView";
import "../_components/admin-page.css";
import "../home/home.css";
import "../design/design.css";
import "./maps.css";

// ─── Entry Point ────────────────────────────────────────────

type Props = { initialConfig: TenantConfig };

export default function MapsClient({ initialConfig }: Props) {
  return (
    <PreviewProvider initialConfig={initialConfig} enableRealtime={false}>
      <MapsInner />
    </PreviewProvider>
  );
}

function MapsInner() {
  return (
    <PublishBarProvider>
      <MapsContent />
    </PublishBarProvider>
  );
}

// ─── Main Content ───────────────────────────────────────────

function MapsContent() {
  const { config } = usePreview();
  const draftUpdate = useDraftUpdate();
  const { pushUndo } = usePublishBar();
  const { guardAction } = useNavigationGuard();

  const maps: MapConfig[] = config?.maps ?? [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingMap = editingId ? maps.find((m) => m.id === editingId) ?? null : null;

  // Local state for instant preview (bypasses debounce to DB)
  const [localOverrides, setLocalOverrides] = useState<Partial<MapConfig>>({});
  const previewMap = editingMap ? { ...editingMap, ...localOverrides } : null;

  // Reset local overrides when switching maps
  useEffect(() => {
    setLocalOverrides({});
  }, [editingId]);

  // ── CRUD operations ──

  const saveMaps = useCallback(
    async (updated: MapConfig[]) => {
      if (config) pushUndo({ maps: config.maps ?? [] });
      await draftUpdate({ maps: updated } as Partial<TenantConfig>);
    },
    [config, draftUpdate, pushUndo]
  );

  const handleCreate = useCallback(async () => {
    const now = new Date().toISOString();
    const newMap: MapConfig = {
      ...DEFAULT_MAP,
      id: createId(),
      name: `Karta ${maps.length + 1}`,
      createdAt: now,
      updatedAt: now,
    };
    await saveMaps([...maps, newMap]);
    setEditingId(newMap.id);
  }, [maps, saveMaps]);

  const handleUpdate = useCallback(
    async (id: string, patch: Partial<MapConfig>) => {
      setLocalOverrides((prev) => ({ ...prev, ...patch }));
      const updated = maps.map((m) =>
        m.id === id ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m
      );
      await saveMaps(updated);
      // Only clear the keys we just saved — don't nuke concurrent edits
      setLocalOverrides((prev) => {
        const cleaned = { ...prev };
        for (const key of Object.keys(patch)) delete cleaned[key as keyof typeof cleaned];
        return Object.keys(cleaned).length > 0 ? cleaned : {};
      });
    },
    [maps, saveMaps]
  );

  const handleLocalUpdate = useCallback((patch: Partial<MapConfig>) => {
    setLocalOverrides((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      await saveMaps(maps.filter((m) => m.id !== id));
      if (editingId === id) setEditingId(null);
    },
    [maps, saveMaps, editingId]
  );

  const handleDuplicate = useCallback(
    async (id: string) => {
      const source = maps.find((m) => m.id === id);
      if (!source) return;
      const now = new Date().toISOString();
      const copy: MapConfig = {
        ...source,
        id: createId(),
        name: `${source.name} (kopia)`,
        markers: source.markers.map((m) => ({ ...m, id: createMarkerId() })),
        createdAt: now,
        updatedAt: now,
      };
      await saveMaps([...maps, copy]);
      setEditingId(copy.id);
    },
    [maps, saveMaps]
  );

  const isEditing = !!editingMap;

  // Tenant theme CSS vars so MarkerSheet CTA uses correct button styling
  const themeStyle = useMemo(
    () => config?.theme ? themeToStyleAttr(config.theme) : undefined,
    [config?.theme]
  );

  return (
    <div className={`admin-page${isEditing ? "" : " admin-page--no-preview"}`}>
      <div className="admin-editor">
        <div className="admin-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {editingMap && (
              <button
                className="maps-back-btn"
                onClick={() => guardAction(() => setEditingId(null))}
              >
                <span className="material-symbols-rounded" style={{ fontSize: 20 }}>
                  arrow_back
                </span>
              </button>
            )}
            <h1 className="admin-title">
              {editingMap ? editingMap.name || "Ny karta" : "Kartor"}
            </h1>
          </div>
          <div className="admin-actions">
            {editingMap && <PublishBar />}
            {!editingMap && (
              <button className="maps-create-btn" onClick={handleCreate}>
                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>
                  add
                </span>
                Skapa karta
              </button>
            )}
          </div>
        </div>

        <div className="admin-content">
          {editingMap ? (
            <MapDetailView
              map={editingMap}
              onUpdate={(patch) => handleUpdate(editingMap.id, patch)}
              onLocalUpdate={handleLocalUpdate}
            />
          ) : (
            <MapListView
              maps={maps}
              onEdit={setEditingId}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onCreate={handleCreate}
            />
          )}
        </div>
      </div>

      {/* Live map preview — only when editing */}
      {isEditing && previewMap && (
        <div className="admin-preview">
          <div className="maps-preview-header">
            <MapStatusPill />
          </div>
          <div className="maps-preview-container" style={themeStyle}>
            <MapPreview map={previewMap} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Status Header (above map preview) ──────────────────────

function MapStatusPill() {
  const { hasUnsavedChanges } = usePublishBar();
  const unsaved = hasUnsavedChanges;

  return (
    <span
      className="maps-status-pill"
      style={{
        background: unsaved ? "#D5EBFF" : "#AFFEBF",
        color: unsaved ? "#003A5A" : "#014B40",
      }}
    >
      <span
        className="maps-status-pill__dot"
        style={{ background: unsaved ? "#003A5A" : "#014B40" }}
      />
      {unsaved ? "Osparade ändringar" : "Aktiv"}
    </span>
  );
}
