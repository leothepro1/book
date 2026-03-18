"use client";

import React, { useCallback, useState, useMemo, useRef } from "react";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { LinkPicker } from "@/app/_components/LinkPicker";
import { PreviewProvider, usePreview } from "../_components/GuestPreview";
import { PublishBarProvider, PublishBar, usePublishBar } from "../_components/PublishBar";
import { useDraftUpdate } from "../_hooks/useDraftUpdate";
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
import { createPortal } from "react-dom";
import type { TenantConfig, MenuConfig, MenuItemConfig } from "@/app/(guest)/_lib/tenant/types";
import { getMapThumbnail } from "../maps/maps-constants";
import "./menus.css";

// ─── ID helpers ─────────────────────────────────────────────

function createMenuId(): string {
  return `menu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createMenuItemId(): string {
  return `mi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Entry Point ────────────────────────────────────────────

type Props = { initialConfig: TenantConfig };

export default function MenusClient({ initialConfig }: Props) {
  return (
    <PreviewProvider initialConfig={initialConfig} enableRealtime={false}>
      <PublishBarProvider>
        <MenusContent />
        <PublishBar />
      </PublishBarProvider>
    </PreviewProvider>
  );
}

// ─── Views ──────────────────────────────────────────────────

type MenuView = "list" | "edit" | "create";

function MenusContent() {
  const { config } = usePreview();
  const draftUpdate = useDraftUpdate();
  const { pushUndo } = usePublishBar();

  const menus: MenuConfig[] = config?.menus ?? [];
  const [view, setView] = useState<MenuView>("list");
  const [editingId, setEditingId] = useState<string | null>(null);

  // ── Save helpers ──

  const saveMenus = useCallback(
    async (updated: MenuConfig[]) => {
      if (config) pushUndo({ menus: config.menus ?? [] });
      await draftUpdate({ menus: updated } as Partial<TenantConfig>);
    },
    [config, draftUpdate, pushUndo],
  );

  // ── Navigation ──

  const openEdit = (menu: MenuConfig) => {
    setEditingId(menu.id);
    setView("edit");
  };

  const openCreate = () => {
    setEditingId(null);
    setView("create");
  };

  const goBack = () => {
    setView("list");
    setEditingId(null);
  };

  // ── List view ──

  if (view === "list") {
    return (
      <div className="admin-page admin-page--no-preview menus-page">
        <div className="admin-editor">
          <div className="admin-header">
            <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="material-symbols-rounded" style={{ fontSize: 22 }}>menu_book</span>
              Menyer
            </h1>
            <div className="admin-actions">
              <button
                className="settings-btn--connect"
                style={{ fontSize: 13, padding: "5px 12px" }}
                onClick={openCreate}
              >
                Skapa meny
              </button>
            </div>
          </div>
          <div className="admin-content">
            {menus.length === 0 ? (
              <div className="menus-empty">
                <div className="menus-empty__icon">
                  <EditorIcon name="menu_book" size={40} />
                </div>
                <div className="menus-empty__title">Inga menyer</div>
                <div className="menus-empty__desc">
                  Skapa din första meny för att hantera navigeringslänkar i sidfoten och andra delar av portalen.
                </div>
              </div>
            ) : (
              <div className="menus-list">
                <div className="menus-list__header">
                  <span className="menus-list__col-name">Meny</span>
                  <span className="menus-list__col-items">Menyobjekt</span>
                  <span className="menus-list__col-action" />
                </div>
                {menus.map((menu) => (
                  <div
                    key={menu.id}
                    className="menus-list__row"
                    onClick={() => openEdit(menu)}
                  >
                    <span className="menus-list__col-name">{menu.title}</span>
                    <span className="menus-list__col-items">{menu.items.map(i => i.label).join(", ")}</span>
                    <span className="menus-list__col-action">
                      <EditorIcon name="chevron_right" size={18} className="menus-list__chevron" />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Edit / Create view ──

  const editingMenu = editingId ? menus.find((m) => m.id === editingId) ?? null : null;
  const isCreate = view === "create";

  return (
    <MenuEditor
      menu={editingMenu}
      isCreate={isCreate}
      menus={menus}
      saveMenus={saveMenus}
      goBack={goBack}
    />
  );
}

// ─── Menu Editor ────────────────────────────────────────────

// ─── Menu Item Card ─────────────────────────────────────────

// ─── Link Input — displays formatted label for special links ──

function isSpecialLink(url: string): boolean {
  return url.startsWith("#map:") || url.startsWith("#text:") || url.startsWith("#doc:") ||
    (url.includes("cloudinary.com") && url.includes(".pdf"));
}

function getLinkDisplay(url: string, maps: { id: string; name: string }[]): { prefix: string; name: string } | null {
  if (url.startsWith("#map:")) {
    const mapId = url.replace("#map:", "");
    const map = maps.find((m) => m.id === mapId);
    return { prefix: "Karta:", name: map?.name ?? mapId };
  }
  if (url.startsWith("#text:")) {
    const content = decodeURIComponent(url.replace("#text:", ""));
    const title = content.length > 40 ? content.slice(0, 40) + "…" : content;
    return { prefix: "Text —", name: title };
  }
  if (url.includes(".pdf") || url.startsWith("#doc:")) {
    const filename = url.split("/").pop()?.split("?")[0] ?? "dokument";
    return { prefix: "Dokument:", name: filename };
  }
  return null;
}

const LinkInput = React.forwardRef<HTMLDivElement, {
  value: string;
  maps: { id: string; name: string }[];
  onChange: (url: string) => void;
  onFocus: () => void;
}>(function LinkInput({ value, maps, onChange, onFocus }, ref) {
  const display = isSpecialLink(value) ? getLinkDisplay(value, maps) : null;

  if (display) {
    return (
      <div
        ref={ref}
        className="menus-items__input mi-link-display"
        onClick={onFocus}
        tabIndex={0}
        onFocus={onFocus}
      >
        <span className="mi-link-display__prefix">{display.prefix}</span>
        {" "}
        <span className="mi-link-display__name">{display.name}</span>
      </div>
    );
  }

  return (
    <input
      ref={ref as React.Ref<HTMLInputElement>}
      type="text"
      className="menus-items__input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      placeholder="T.ex. /stays"
    />
  );
});

function MenuItemCard({
  item,
  editing,
  onEdit,
  onDoneEdit,
  onDelete,
  onUpdate,
  maps,
  dragHandleProps,
}: {
  item: MenuItemConfig;
  editing: boolean;
  onEdit: () => void;
  onDoneEdit: () => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<MenuItemConfig>) => void;
  maps: { id: string; name: string }[];
  dragHandleProps?: Record<string, unknown>;
}) {
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);

  return (
    <div className={`mi-card${editing ? " mi-card--editing" : ""}`}>
      <div className="mi-card__row">
        <div className="mi-card__handle" {...(dragHandleProps ?? {})}>
          <EditorIcon name="drag_indicator" size={20} />
        </div>
        {editing ? (
          <div className="mi-card__inline-edit">
            <div className="mi-card__inline-field">
              <label className="mi-card__field-label">Namn</label>
              <input
                type="text"
                className="menus-items__input"
                value={item.label}
                onChange={(e) => onUpdate({ label: e.target.value })}
                placeholder="T.ex. Hem"
                autoFocus
              />
            </div>
            <div className="mi-card__inline-field">
              <label className="mi-card__field-label">Länk</label>
              <LinkInput
                ref={linkInputRef}
                value={item.url}
                maps={maps}
                onChange={(url) => onUpdate({ url })}
                onFocus={() => setLinkPickerOpen(true)}
              />
              <LinkPicker
                open={linkPickerOpen}
                anchorRef={linkInputRef}
                maps={maps}
                onSelect={(url, label) => {
                  onUpdate({ url, ...(item.label ? {} : { label }) });
                  setLinkPickerOpen(false);
                }}
                onClose={() => setLinkPickerOpen(false)}
              />
            </div>
          </div>
        ) : (
          <span className="mi-card__label">{item.label || "Utan namn"}</span>
        )}
        <div className="mi-card__actions">
          {editing ? (
            <button type="button" className="mi-card__btn" onClick={onDoneEdit} aria-label="Klar">
              <EditorIcon name="check" size={20} />
            </button>
          ) : (
            <button type="button" className="mi-card__btn" onClick={onEdit} aria-label="Redigera">
              <EditorIcon name="edit" size={20} />
            </button>
          )}
          <button type="button" className="mi-card__btn mi-card__btn--danger" onClick={onDelete} aria-label="Ta bort">
            <EditorIcon name="delete" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SortableMenuItemCard(props: {
  item: MenuItemConfig;
  editing: boolean;
  onEdit: () => void;
  onDoneEdit: () => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<MenuItemConfig>) => void;
  maps: { id: string; name: string }[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.item.id });
  const style: React.CSSProperties = isDragging
    ? { opacity: 0, transition }
    : { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style}>
      <MenuItemCard {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

// ─── Delete Confirmation Modal ──────────────────────────────

function DeleteItemModal({ itemName, onConfirm, onCancel }: { itemName: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onCancel}
    >
      <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
      <div
        style={{
          position: "relative", zIndex: 1, background: "var(--admin-surface)",
          borderRadius: 16, width: 400,
          animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "20px 20px 16px", background: "#fafafa", borderRadius: "16px 16px 0 0" }}>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Ta bort menyobjekt?</h3>
        </div>
        <div style={{ padding: "16px 20px" }}>
          <p style={{ fontSize: 14, color: "var(--admin-text-secondary)", lineHeight: 1.5, margin: 0 }}>
            Detta tar bort menyobjektet <strong>{itemName}</strong>.
          </p>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px 20px", background: "#fafafa", borderRadius: "0 0 16px 16px" }}>
          <button className="settings-btn--outline" style={{ fontSize: 13 }} onClick={onCancel}>Avbryt</button>
          <button className="settings-btn--danger-solid" style={{ fontSize: 13 }} onClick={onConfirm}>Ta bort</button>
        </div>
      </div>
    </div>
  );
}

// ─── Menu Editor ────────────────────────────────────────────

function MenuEditor({
  menu,
  isCreate,
  menus,
  saveMenus,
  goBack,
}: {
  menu: MenuConfig | null;
  isCreate: boolean;
  menus: MenuConfig[];
  saveMenus: (updated: MenuConfig[]) => Promise<void>;
  goBack: () => void;
}) {
  const { config } = usePreview();
  const configMaps = useMemo(
    () => (config?.maps ?? []).map((m) => ({ id: m.id, name: m.name, thumbnail: getMapThumbnail(m.style) })),
    [config?.maps],
  );

  // For create: we need a local ID so we can save incrementally
  const [menuId] = useState(() => menu?.id ?? createMenuId());
  const [createdAt] = useState(() => menu?.createdAt ?? new Date().toISOString());

  // Resolve current menu from config (live source of truth after first save)
  const liveMenu = menus.find((m) => m.id === menuId);
  const title = liveMenu?.title ?? menu?.title ?? "";
  const items = liveMenu?.items ?? menu?.items ?? [];

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [deletingItem, setDeletingItem] = useState<MenuItemConfig | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const itemIds = useMemo(() => items.map((i) => i.id), [items]);

  // Save the full menu to draft on every change
  const persistMenu = useCallback(
    async (patch: { title?: string; items?: MenuItemConfig[] }) => {
      const now = new Date().toISOString();
      const updatedMenu: MenuConfig = {
        id: menuId,
        title: patch.title ?? title,
        handle: (patch.title ?? title).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        items: patch.items ?? items,
        createdAt,
        updatedAt: now,
      };
      const existing = menus.find((m) => m.id === menuId);
      if (existing) {
        await saveMenus(menus.map((m) => (m.id === menuId ? updatedMenu : m)));
      } else {
        await saveMenus([...menus, updatedMenu]);
      }
    },
    [menuId, title, items, menus, saveMenus, createdAt],
  );

  const handleTitleChange = (newTitle: string) => {
    persistMenu({ title: newTitle });
  };

  const addItem = () => {
    const newId = createMenuItemId();
    const newItems = [...items, { id: newId, label: "", url: "" }];
    persistMenu({ items: newItems });
    setEditingItemId(newId);
  };

  const updateItem = (id: string, patch: Partial<MenuItemConfig>) => {
    const newItems = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    persistMenu({ items: newItems });
  };

  const confirmDelete = () => {
    if (deletingItem) {
      const newItems = items.filter((i) => i.id !== deletingItem.id);
      persistMenu({ items: newItems });
      if (editingItemId === deletingItem.id) setEditingItemId(null);
      setDeletingItem(null);
    }
  };

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveDragId(e.active.id as string);
  }, []);

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    persistMenu({ items: arrayMove(items, oldIdx, newIdx) });
  }, [items, persistMenu]);

  const dragItem = activeDragId ? items.find((i) => i.id === activeDragId) : null;

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: "0.75rem",
    padding: "16px",
    boxShadow: "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
  };

  return (
    <div className="admin-page admin-page--no-preview menus-page">
      <div className="admin-editor">
        <div className="menus-editor-view">
          <div className="admin-header">
            <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <button
                type="button"
                className="menus-breadcrumb__icon"
                onClick={goBack}
                aria-label="Tillbaka till menyer"
              >
                <span className="material-symbols-rounded" style={{ fontSize: 22 }}>menu_book</span>
              </button>
              <EditorIcon name="chevron_right" size={16} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
              <span style={{ marginLeft: 3 }}>
                {isCreate ? "Skapa meny" : (menu?.title ?? "Redigera meny")}
              </span>
            </h1>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Container 1: Namn */}
            <div style={cardStyle}>
              <label className="admin-label">Namn</label>
              <input
                type="text"
                className="email-sender__input"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="T.ex. Sidfotsmeny"
              />
            </div>

            {/* Container 2: Menyobjekt */}
            <div style={{ ...cardStyle, padding: 0 }}>
              <div style={{ padding: "16px 16px 12px" }}>
                <label className="admin-label" style={{ marginBottom: 0 }}>Menyobjekt</label>
              </div>

              {items.length > 0 && (
                <DndContext
                  sensors={sensors}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                    <div className="mi-card-list">
                      {items.map((item) => (
                        <SortableMenuItemCard
                          key={item.id}
                          item={item}
                          editing={editingItemId === item.id}
                          onEdit={() => setEditingItemId(item.id)}
                          onDoneEdit={() => setEditingItemId(null)}
                          onDelete={() => setDeletingItem(item)}
                          onUpdate={(patch) => updateItem(item.id, patch)}
                          maps={configMaps}
                        />
                      ))}
                    </div>
                  </SortableContext>
                  {typeof document !== "undefined" && createPortal(
                    <DragOverlay>
                      {dragItem && (
                        <MenuItemCard
                          item={dragItem}
                          editing={false}
                          onEdit={() => {}}
                          onDoneEdit={() => {}}
                          onDelete={() => {}}
                          onUpdate={() => {}}
                          maps={[]}
                        />
                      )}
                    </DragOverlay>,
                    document.body,
                  )}
                </DndContext>
              )}

              <div style={{ padding: "12px 16px 16px" }}>
                <button
                  type="button"
                  className="settings-btn--muted"
                  style={{ fontSize: 13, padding: "5px 12px" }}
                  onClick={addItem}
                >
                  Lägg till menyobjekt
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deletingItem && (
        <DeleteItemModal
          itemName={deletingItem.label || "Utan namn"}
          onConfirm={confirmDelete}
          onCancel={() => setDeletingItem(null)}
        />
      )}
    </div>
  );
}
