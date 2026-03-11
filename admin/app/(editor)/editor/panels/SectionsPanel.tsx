"use client";

/**
 * Sections Panel
 * ──────────────
 * Left panel content when the "sections" rail tab is active.
 *
 * Structure:
 *   ┌──────────────────────┐
 *   │ Startsida            │  ← page name
 *   ├──────────────────────┤
 *   │ Mall                 │  ← template label
 *   │                      │
 *   │ ── divider ──────    │  ← hover: + button to insert at position
 *   │ [≡] Hero Slider 🗑👁 │  ← section row (drag, name, delete, visibility)
 *   │ ── divider ──────    │
 *   │ [+] Lägg till avsnitt│  ← always at bottom
 *   └──────────────────────┘
 *
 * DND: vertical reorder via @dnd-kit.
 * Dividers: hidden, appear on hover with + button.
 * Visibility: eye icon toggles isActive.
 * Delete: trash icon — confirms if section has blocks, immediate if empty.
 * Picker: enterprise-grade modal (section/block/element) via PickerModal.
 */

import React, { useCallback, useState, useRef, useMemo, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  closestCenter,
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
import { usePreview } from "@/app/(admin)/_components/GuestPreview";
import { usePublishBar } from "@/app/(admin)/_components/PublishBar";
import { useDraftUpdate } from "@/app/(admin)/_hooks/useDraftUpdate";
import type { SectionInstance, ElementInstance } from "@/app/_lib/sections/types";
import { createSectionId, createBlockId } from "@/app/_lib/sections/types";
import { ensureSectionsRegistered, getElementDefinition, getSectionDefinition } from "@/app/_lib/sections/registry";
import { Tooltip } from "@/app/_components/Tooltip";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { useEditor } from "../EditorContext";
import { DetailPanel } from "./DetailPanel";
import {
  PickerModal,
  buildSectionPickerData,
  buildElementPickerData,
  getSectionPresets,
  getElementPresets,
  createSectionFromPicker,
  createElementFromPicker,
} from "./PickerModal";
import type { SlotDefinition, ElementType } from "@/app/_lib/sections/types";

// ─── Main Component ─────────────────────────────────────────

export function SectionsPanel() {
  const { detailTarget } = useEditor();
  const showDetail = detailTarget !== null;

  // Track previous state to determine slide direction
  const [animState, setAnimState] = useState<"list" | "detail" | "to-detail" | "to-list">(
    showDetail ? "detail" : "list"
  );
  const prevShowDetail = useRef(showDetail);

  useLayoutEffect(() => {
    if (showDetail && !prevShowDetail.current) {
      // Transitioning list → detail
      setAnimState("to-detail");
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimState("detail"));
      });
      prevShowDetail.current = true;
      return () => cancelAnimationFrame(frame);
    }
    if (!showDetail && prevShowDetail.current) {
      // Transitioning detail → list
      setAnimState("to-list");
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimState("list"));
      });
      prevShowDetail.current = false;
      return () => cancelAnimationFrame(frame);
    }
  }, [showDetail]);

  return (
    <div className="sp-transition">
      <div
        className={`sp-transition__track${
          animState === "detail" || animState === "to-detail" ? " sp-transition__track--detail" : ""
        }`}
      >
        <div className="sp-transition__pane">
          <SectionListPane />
        </div>
        <div className="sp-transition__pane">
          <DetailPanel />
        </div>
      </div>
    </div>
  );
}

// ─── Section List (the original content) ────────────────────

function SectionListPane() {
  const { config } = usePreview();
  const { pushUndo } = usePublishBar();
  const saveDraft = useDraftUpdate();
  const { openDetail } = useEditor();

  const sections: SectionInstance[] = config?.home?.sections ?? [];

  // ── DND state ──
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sectionsBeforeDragRef = useRef<SectionInstance[]>(sections);

  // ── Section picker ──
  const [pickerInsertIndex, setPickerInsertIndex] = useState<number | null>(null);
  const [registryReady, setRegistryReady] = useState(false);

  useEffect(() => {
    ensureSectionsRegistered().then(() => setRegistryReady(true));
  }, []);

  // ── Element picker (test) ──
  const [elementPickerOpen, setElementPickerOpen] = useState(false);

  // ── Delete confirmation ──
  const [deleteConfirm, setDeleteConfirm] = useState<{
    sectionId: string;
    sectionTitle: string;
    blockCount: number;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // ── Persistence ──

  const saveSections = useCallback(
    (updated: SectionInstance[]) => {
      if (!config) return;
      pushUndo({ home: config.home });
      saveDraft({ home: { ...config.home, sections: updated } });
    },
    [config, pushUndo, saveDraft]
  );

  // ── Section actions ──

  const handleToggleVisibility = useCallback(
    (id: string) => {
      const updated = sections.map((s) =>
        s.id === id ? { ...s, isActive: !s.isActive } : s
      );
      saveSections(updated);
    },
    [sections, saveSections]
  );

  const handleRequestDelete = useCallback(
    (id: string) => {
      const section = sections.find((s) => s.id === id);
      if (!section) return;

      if (section.blocks.length === 0) {
        const updated = sections
          .filter((s) => s.id !== id)
          .map((s, i) => ({ ...s, sortOrder: i }));
        saveSections(updated);
      } else {
        setDeleteConfirm({
          sectionId: id,
          sectionTitle: section.title || section.definitionId,
          blockCount: section.blocks.length,
        });
      }
    },
    [sections, saveSections]
  );

  const handleConfirmDelete = useCallback(() => {
    if (!deleteConfirm) return;
    const updated = sections
      .filter((s) => s.id !== deleteConfirm.sectionId)
      .map((s, i) => ({ ...s, sortOrder: i }));
    saveSections(updated);
    setDeleteConfirm(null);
  }, [deleteConfirm, sections, saveSections]);

  // ── Picker: open / close / select ──

  const handleOpenPicker = useCallback(
    (atIndex?: number) => {
      setPickerInsertIndex(atIndex ?? sections.length);
    },
    [sections.length]
  );

  const handlePickSection = useCallback(
    (definitionId: string, presetKey?: string) => {
      const newSection = createSectionFromPicker(definitionId, presetKey);
      if (!newSection) return;

      const insertAt = pickerInsertIndex ?? sections.length;
      const updated = [...sections];
      updated.splice(insertAt, 0, newSection);
      saveSections(updated.map((s, i) => ({ ...s, sortOrder: i })));
      setPickerInsertIndex(null);
    },
    [sections, saveSections, pickerInsertIndex]
  );

  // ── Picker data (memoised, rebuilt when registry is ready) ──

  const pickerData = useMemo(() => {
    if (!registryReady) return { items: [], categories: [] };
    return buildSectionPickerData();
  }, [registryReady]);

  // ── Element picker data (test — allows all element types) ──

  const testSlotDef: SlotDefinition = useMemo(() => ({
    key: "test",
    name: "Test",
    description: "Alla element",
    allowedElements: ["heading", "text", "richtext", "collapsible", "button", "image", "divider", "icon", "map"] as ElementType[],
    minElements: 0,
    maxElements: -1,
    defaultElements: [],
  }), []);

  const elementPickerData = useMemo(() => {
    if (!registryReady) return { items: [], categories: [] };
    return buildElementPickerData(testSlotDef);
  }, [registryReady, testSlotDef]);

  const handlePickElement = useCallback(
    (elementType: string, presetKey?: string) => {
      const el = createElementFromPicker(elementType as ElementType, presetKey);
      if (!el) return;

      // Test mode: wrap element in a lightweight section so it renders in the preview.
      // Creates a minimal "loose-element" section with one block and one slot.
      const looseSection: SectionInstance = {
        id: createSectionId(),
        definitionId: "__loose-element",
        definitionVersion: "1.0.0",
        presetKey: "default",
        presetVersion: "1.0.0",
        sortOrder: sections.length,
        isActive: true,
        settings: {},
        presetSettings: {},
        blocks: [
          {
            id: createBlockId(),
            type: "wrapper",
            settings: {},
            slots: { content: [el] },
            sortOrder: 0,
            isActive: true,
          },
        ],
        title: getElementDefinition(el.type)?.name ?? el.type,
      };

      saveSections([...sections, looseSection].map((s, i) => ({ ...s, sortOrder: i })));
      setElementPickerOpen(false);
    },
    [sections, saveSections]
  );

  // ── DND handlers ──

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveDragId(event.active.id as string);
      sectionsBeforeDragRef.current = sections;
    },
    [sections]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragId(null);

      if (!over || active.id === over.id) return;

      const oldIndex = sections.findIndex((s) => s.id === active.id);
      const newIndex = sections.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(sections, oldIndex, newIndex).map((s, i) => ({
        ...s,
        sortOrder: i,
      }));

      saveSections(reordered);
    },
    [sections, saveSections]
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
  }, []);

  // ── Sorted sections ──

  const sorted = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
  const activeDragSection = activeDragId
    ? sections.find((s) => s.id === activeDragId) ?? null
    : null;

  return (
    <>
      {/* ── Page header ── */}
      <div className="sp-page-header">
        <span className="sp-page-name">Startsida</span>
      </div>

      <div className="sp-template-label">Mall</div>

      {/* ── Section list ── */}
      <div className="sp-list">
        <DndContext
          id="sections-dnd"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext
            items={sorted.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            {sorted.length === 0 ? (
              <div className="sp-empty">
                Inga sektioner ännu.
              </div>
            ) : (
              sorted.map((section, index) => (
                <React.Fragment key={section.id}>
                  {index === 0 && !activeDragId && (
                    <SectionDivider onClick={() => handleOpenPicker(0)} />
                  )}
                  <SortableSectionRow
                    section={section}
                    onToggleVisibility={handleToggleVisibility}
                    onDelete={handleRequestDelete}
                    onClick={() => openDetail({ sectionId: section.id })}
                  />
                  {/* Child rows: blocks and elements */}
                  {(section.blocks ?? [])
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((block) => {
                      const elements = Object.values(block.slots).flat().sort((a, b) => a.sortOrder - b.sortOrder);
                      return (
                        <React.Fragment key={block.id}>
                          {section.blocks.length > 1 && (
                            <ChildRow
                              label={block.type}
                              indent={1}
                              onClick={() => openDetail({ sectionId: section.id, blockId: block.id })}
                            />
                          )}
                          {elements.map((el) => (
                            <ChildRow
                              key={el.id}
                              label={getElementName(el.type)}
                              indent={section.blocks.length > 1 ? 2 : 1}
                              icon={el.type}
                              onClick={() => openDetail({ sectionId: section.id, blockId: block.id, elementId: el.id })}
                            />
                          ))}
                        </React.Fragment>
                      );
                    })}
                  {!activeDragId && (
                    <SectionDivider onClick={() => handleOpenPicker(index + 1)} />
                  )}
                </React.Fragment>
              ))
            )}
          </SortableContext>

          <DragOverlay>
            {activeDragSection ? (
              <SectionRow
                section={activeDragSection}
                onToggleVisibility={() => {}}
                onDelete={() => {}}
                isOverlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* ── Add section button (always at bottom) ── */}
        <button
          type="button"
          className="sp-add-row"
          onClick={() => handleOpenPicker()}
        >
          <EditorIcon name="add_circle" size={16} />
          <span>Lägg till avsnitt</span>
        </button>

        {/* ── Add element button (test) ── */}
        <button
          type="button"
          className="sp-add-row"
          onClick={() => setElementPickerOpen(true)}
        >
          <EditorIcon name="add_circle" size={16} />
          <span>Lägg till element</span>
        </button>
      </div>

      {/* ── Section picker modal ── */}
      {pickerInsertIndex !== null && (
        <PickerModal
          title="Lägg till sektion"
          items={pickerData.items}
          categories={pickerData.categories}
          getPresets={getSectionPresets}
          presetLabel="Sektions"
          onSelect={handlePickSection}
          onClose={() => setPickerInsertIndex(null)}
        />
      )}

      {/* ── Element picker modal (test) ── */}
      {elementPickerOpen && (
        <PickerModal
          title="Lägg till element"
          items={elementPickerData.items}
          categories={elementPickerData.categories}
          getPresets={getElementPresets}
          presetLabel="Element"
          onSelect={handlePickElement}
          onClose={() => setElementPickerOpen(false)}
        />
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteConfirm && (
        <DeleteSectionModal
          title={deleteConfirm.sectionTitle}
          blockCount={deleteConfirm.blockCount}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </>
  );
}

// ─── Delete Confirmation Modal ──────────────────────────────

function DeleteSectionModal({
  title,
  blockCount,
  onConfirm,
  onCancel,
}: {
  title: string;
  blockCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return createPortal(
    <>
      <div className="sp-modal-backdrop" onClick={onCancel} />
      <div className="sp-modal" role="alertdialog" aria-labelledby="sp-modal-title">
        <h3 className="sp-modal__title" id="sp-modal-title">
          Ta bort &ldquo;{title}&rdquo;?
        </h3>
        <p className="sp-modal__desc">
          Den här sektionen innehåller {blockCount} {blockCount === 1 ? "block" : "block"}.
          Allt innehåll tas bort tillsammans med sektionen.
        </p>
        <div className="sp-modal__actions">
          <button type="button" className="sp-modal__btn sp-modal__btn--cancel" onClick={onCancel}>
            Avbryt
          </button>
          <button type="button" className="sp-modal__btn sp-modal__btn--danger" onClick={onConfirm}>
            Ta bort
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

// ─── Sortable Section Row ───────────────────────────────────

function SortableSectionRow({
  section,
  onToggleVisibility,
  onDelete,
  onClick,
}: {
  section: SectionInstance;
  onToggleVisibility: (id: string) => void;
  onDelete: (id: string) => void;
  onClick?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.04 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <SectionRow
        section={section}
        onToggleVisibility={onToggleVisibility}
        onDelete={onDelete}
        onClick={onClick}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

// ─── Section Row ────────────────────────────────────────────

function SectionRow({
  section,
  onToggleVisibility,
  onDelete,
  onClick,
  dragHandleProps,
  isOverlay,
}: {
  section: SectionInstance;
  onToggleVisibility: (id: string) => void;
  onDelete: (id: string) => void;
  onClick?: () => void;
  dragHandleProps?: Record<string, unknown>;
  isOverlay?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`sp-row${!section.isActive ? " sp-row--inactive" : ""}${isOverlay ? " sp-row--overlay" : ""}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : undefined }}
    >
      {/* Drag handle / section icon */}
      <div
        className="sp-row__handle"
        {...(dragHandleProps ?? {})}
        title="Dra för att sortera"
      >
        {isHovered && !isOverlay ? <DragIcon /> : <SectionIcon />}
      </div>

      {/* Section name — for loose-element sections, resolve the element name */}
      <span className="sp-row__name">
        {section.definitionId === "__loose-element"
          ? (() => {
              const firstEl = (section.blocks ?? [])[0]?.slots?.content?.[0];
              return firstEl ? (getElementDefinition(firstEl.type)?.name ?? section.title ?? section.definitionId) : (section.title || section.definitionId);
            })()
          : (section.title || getSectionDefinition(section.definitionId)?.name || section.definitionId)}
      </span>

      {/* Action buttons */}
      <div className="sp-row__actions">
        {/* Delete — only when active + hovered */}
        {section.isActive && isHovered && !isOverlay && (
          <Tooltip label="Radera">
            <button
              type="button"
              className="sp-row__action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(section.id);
              }}
              aria-label="Radera sektion"
            >
              <TrashIcon />
            </button>
          </Tooltip>
        )}

        {/* Visibility toggle — always visible when inactive, hover-only when active */}
        {(!section.isActive || (isHovered && !isOverlay)) && (
          <Tooltip label={section.isActive ? "Dölj" : "Visa"}>
            <button
              type="button"
              className={`sp-row__action-btn${!section.isActive ? " sp-row__action-btn--muted" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility(section.id);
              }}
              aria-label={section.isActive ? "Dölj sektion" : "Visa sektion"}
            >
              {section.isActive ? <EyeOpenIcon /> : <EyeClosedIcon />}
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

// ─── Child Row (block / element) ─────────────────────────────

function getElementName(type: string): string {
  const def = getElementDefinition(type as import("@/app/_lib/sections/types").ElementType);
  return def?.name || type;
}

const ELEMENT_ICONS: Record<string, React.ReactNode> = {
  heading: <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><path d="M4 4v10M14 4v10M4 9h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  text: <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><path d="M3 5h12M3 9h10M3 13h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  button: <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><rect x="2" y="5" width="14" height="8" rx="4" stroke="currentColor" strokeWidth="1.2"/><path d="M6 9h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  image: <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/><circle cx="6.5" cy="7" r="1.5" stroke="currentColor" strokeWidth="1"/><path d="M2 13l4-3 3 2 3-2 4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  divider: <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><path d="M3 9h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2"/></svg>,
  icon: <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><path d="M9 2l2.5 5 5.5.8-4 3.9.9 5.3L9 14.5 4.1 17l.9-5.3-4-3.9L6.5 7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  richtext: <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><path d="M4 4v4M10 4v4M4 6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M3 11h12M3 14h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  collapsible: <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><path d="M3 5h12M3 8h10M3 11h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M9 14l2-1.5M9 14l-2-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  map: <EditorIcon name="map" size={14} />,
};

function ChildRow({ label, indent, icon, onClick }: {
  label: string;
  indent: number;
  icon?: string;
  onClick: () => void;
}) {
  return (
    <div
      className="sp-child-row"
      style={{ paddingLeft: indent * 20 + 12 }}
      onClick={onClick}
    >
      {icon && (
        <span className="sp-child-row__icon">
          {ELEMENT_ICONS[icon] || ELEMENT_ICONS.heading}
        </span>
      )}
      <span className="sp-child-row__name">{label}</span>
    </div>
  );
}

// ─── Section Divider ────────────────────────────────────────

function SectionDivider({ onClick }: { onClick: () => void }) {
  return (
    <div className="sp-divider">
      <div className="sp-divider__line" />
      <button
        type="button"
        className="sp-divider__btn"
        onClick={onClick}
        aria-label="Lägg till sektion här"
      >
        <EditorIcon name="add_circle" size={16} style={{ color: "#0075DE" }} />
      </button>
      <div className="sp-divider__line" />
    </div>
  );
}

// ─── Icons ──────────────────────────────────────────────────

function SectionIcon() {
  return <EditorIcon name="grid_view" size={16} />;
}

function DragIcon() {
  return <EditorIcon name="drag_indicator" size={16} />;
}

function TrashIcon() {
  return <EditorIcon name="delete" size={16} />;
}

function EyeOpenIcon() {
  return <EditorIcon name="visibility" size={16} />;
}

function EyeClosedIcon() {
  return <EditorIcon name="visibility_off" size={16} />;
}
