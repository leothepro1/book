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
    allowedElements: ["heading", "text", "richtext", "collapsible", "button", "image", "divider", "icon"] as ElementType[],
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
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>Lägg till avsnitt</span>
        </button>

        {/* ── Add element button (test) ── */}
        <button
          type="button"
          className="sp-add-row"
          onClick={() => setElementPickerOpen(true)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.2" />
            <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
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
          <button
            type="button"
            className="sp-row__action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(section.id);
            }}
            aria-label="Ta bort sektion"
          >
            <TrashIcon />
          </button>
        )}

        {/* Visibility toggle — always visible when inactive, hover-only when active */}
        {(!section.isActive || (isHovered && !isOverlay)) && (
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
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path fill="#0075DE" d="M0 10C0 4.477 4.477 0 10 0s10 4.477 10 10-4.477 10-10 10S0 15.523 0 10Z" />
          <path stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33" d="M10 5.333v9.334M5.333 10h9.334" />
        </svg>
      </button>
      <div className="sp-divider__line" />
    </div>
  );
}

// ─── Icons ──────────────────────────────────────────────────

function SectionIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M1.5 1.5H6.5V6.5H1.5z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="bevel" fill="transparent" />
      <path d="M1.5 9.5H6.5V14.5H1.5z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="bevel" fill="transparent" />
      <path d="M9.5 1.5H14.5V14.5H9.5z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="bevel" fill="transparent" />
    </svg>
  );
}

function DragIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="5.5" cy="3.5" r="1.5" />
      <circle cx="10.5" cy="3.5" r="1.5" />
      <circle cx="5.5" cy="8" r="1.5" />
      <circle cx="10.5" cy="8" r="1.5" />
      <circle cx="5.5" cy="12.5" r="1.5" />
      <circle cx="10.5" cy="12.5" r="1.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path fillRule="evenodd" d="m6.83 0-.35.15-1.33 1.33-.15.35V3H0v1h2v11.5l.5.5h11l.5-.5V4h2V3h-5V1.83l-.15-.35L9.52.15 9.17 0H6.83ZM10 3v-.96L8.96 1H7.04L6 2.04V3h4ZM5 4H3v11h10V4H5Zm2 3v5H6V7h1Zm3 .5V7H9v5h1V7.5Z" fill="currentColor" />
    </svg>
  );
}

function EyeOpenIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0m-1.5 0a1.5 1.5 0 1 1-3.001-.001 1.5 1.5 0 0 1 3.001.001" />
      <path fillRule="evenodd" d="M8 2c-2.476 0-4.348 1.23-5.577 2.532a9.3 9.3 0 0 0-1.4 1.922 6 6 0 0 0-.37.818c-.082.227-.153.488-.153.728s.071.501.152.728c.088.246.213.524.371.818.317.587.784 1.27 1.4 1.922 1.229 1.302 3.1 2.532 5.577 2.532s4.348-1.23 5.577-2.532a9.3 9.3 0 0 0 1.4-1.922c.158-.294.283-.572.37-.818.082-.227.153-.488.153-.728s-.071-.501-.152-.728a6 6 0 0 0-.371-.818 9.3 9.3 0 0 0-1.4-1.922C12.348 3.23 10.476 2 8 2m-5.999 6.002v-.004c.004-.02.017-.09.064-.223.058-.161.15-.369.278-.608a7.8 7.8 0 0 1 1.17-1.605c1.042-1.104 2.545-2.062 4.487-2.062s3.445.958 4.486 2.062c.52.55.912 1.126 1.17 1.605.13.24.221.447.279.608.047.132.06.203.064.223v.004c-.004.02-.017.09-.064.223-.058.161-.15.369-.278.608a7.8 7.8 0 0 1-1.17 1.605c-1.042 1.104-2.545 2.062-4.487 2.062s-3.445-.958-4.486-2.062a7.7 7.7 0 0 1-1.17-1.605 4.5 4.5 0 0 1-.279-.608c-.047-.132-.06-.203-.064-.223" />
    </svg>
  );
}

function EyeClosedIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M9.977 2.751a7.6 7.6 0 0 0-1.977-.251c-2.444 0-4.196 1.045-5.325 2.233a7.2 7.2 0 0 0-1.243 1.773c-.26.532-.432 1.076-.432 1.494s.171.962.432 1.494c.172.353.4.733.687 1.115l1.074-1.074a5 5 0 0 1-.414-.7c-.221-.453-.279-.753-.279-.835s.058-.382.279-.835a5.7 5.7 0 0 1 .983-1.398c.89-.937 2.264-1.767 4.238-1.767q.36 0 .693.036z" />
      <path fillRule="evenodd" d="M2.25 12.6a.75.75 0 0 0 1.067 1.053l1.062-1.061c.975.543 2.177.908 3.621.908 2.45 0 4.142-1.05 5.24-2.242 1.078-1.17 1.588-2.476 1.738-3.076a.75.75 0 0 0 0-.364c-.15-.6-.66-1.906-1.738-3.076a7 7 0 0 0-.51-.502l.923-.923a.749.749 0 0 0-1.053-1.068l-.008.008-10.335 10.336zm5.75-.6c-.978 0-1.809-.204-2.506-.523l1.108-1.109a2.75 2.75 0 0 0 3.767-3.766l1.298-1.299q.254.221.47.455a6.4 6.4 0 0 1 1.332 2.242 6.4 6.4 0 0 1-1.332 2.242c-.86.933-2.17 1.758-4.137 1.758m0-2.75q-.13-.001-.254-.026l1.478-1.478a1.25 1.25 0 0 1-1.224 1.504" />
    </svg>
  );
}
