"use client";

/**
 * Sections Panel
 * ──────────────
 * Left panel content when the "sections" rail tab is active.
 *
 * DnD model (three scoped levels):
 *   - Section: reorder within the page-level section list
 *   - Block:   reorder within the parent section only
 *   - Element: reorder within the parent block only
 *
 * Each level has its own DndContext. Active drag highlights the valid
 * drop zone with a dashed border. Cross-scope drops are structurally
 * impossible (separate DndContexts).
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
import type { SectionInstance, ElementInstance, BlockInstance } from "@/app/_lib/sections/types";
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
import {
  insertBlockIntoSection,
  insertElementIntoBlock,
  getAddBlockLabel as resolveAddBlockLabel,
  canAddBlock,
  canAddElement,
  hasMultipleBlockTypes,
  getPresetForSection,
} from "@/app/_lib/sections/mutations";

// ─── Drag Scope Types ───────────────────────────────────────
// Each drag level is scoped to its own DndContext.
// Cross-level moves are structurally impossible.

type DragLevel = "section" | "block" | "element";

interface ActiveDrag {
  level: DragLevel;
  id: string;
  /** For block: the parent section ID */
  sectionId?: string;
  /** For element: the parent block ID */
  blockId?: string;
}

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
      setAnimState("to-detail");
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimState("detail"));
      });
      prevShowDetail.current = true;
      return () => cancelAnimationFrame(frame);
    }
    if (!showDetail && prevShowDetail.current) {
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

  // ── Stable refs ──
  // These break the cascade: config/sections change → handler recreated → all props change.
  // Handlers read from refs instead, keeping their identity stable across renders.
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const configRef = useRef(config);
  configRef.current = config;
  const pushUndoRef = useRef(pushUndo);
  pushUndoRef.current = pushUndo;
  const saveDraftRef = useRef(saveDraft);
  saveDraftRef.current = saveDraft;

  // ── Collapse state (UI only, not persisted) ──
  // Sections start expanded, blocks start collapsed
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    const blockIds = new Set<string>();
    for (const s of sections) {
      for (const b of s.blocks ?? []) blockIds.add(b.id);
    }
    return blockIds;
  });

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ── Active drag tracking (all levels) ──
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
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

  // ── Persistence (stable — reads from refs) ──

  const saveSections = useCallback(
    (updated: SectionInstance[]) => {
      const cfg = configRef.current;
      if (!cfg) return;
      pushUndoRef.current({ home: cfg.home });
      saveDraftRef.current({ home: { ...cfg.home, sections: updated } });
    },
    []
  );

  // ── Section actions ──

  const handleToggleVisibility = useCallback(
    (id: string) => {
      const updated = sectionsRef.current.map((s) =>
        s.id === id ? { ...s, isActive: !s.isActive } : s
      );
      saveSections(updated);
    },
    [saveSections]
  );

  const handleRequestDelete = useCallback(
    (id: string) => {
      const section = sectionsRef.current.find((s) => s.id === id);
      if (!section) return;

      if (section.blocks.length === 0) {
        const updated = sectionsRef.current
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
    [saveSections]
  );

  const handleConfirmDelete = useCallback(() => {
    if (!deleteConfirm) return;
    const updated = sectionsRef.current
      .filter((s) => s.id !== deleteConfirm.sectionId)
      .map((s, i) => ({ ...s, sortOrder: i }));
    saveSections(updated);
    setDeleteConfirm(null);
  }, [deleteConfirm, saveSections]);

  // ── Block actions ──

  const handleToggleBlockVisibility = useCallback(
    (sectionId: string, blockId: string) => {
      const updated = sectionsRef.current.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          blocks: s.blocks.map((b) =>
            b.id === blockId ? { ...b, isActive: !b.isActive } : b
          ),
        };
      });
      saveSections(updated);
    },
    [saveSections]
  );

  const handleDeleteBlock = useCallback(
    (sectionId: string, blockId: string) => {
      const updated = sectionsRef.current.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          blocks: s.blocks
            .filter((b) => b.id !== blockId)
            .map((b, i) => ({ ...b, sortOrder: i })),
        };
      });
      saveSections(updated);
    },
    [saveSections]
  );

  // ── Element actions ──

  const handleDeleteElement = useCallback(
    (sectionId: string, blockId: string, elementId: string) => {
      const updated = sectionsRef.current.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          blocks: s.blocks.map((b) => {
            if (b.id !== blockId) return b;
            const newSlots: Record<string, ElementInstance[]> = {};
            for (const [key, elements] of Object.entries(b.slots)) {
              newSlots[key] = elements.filter((el) => el.id !== elementId);
            }
            return { ...b, slots: newSlots };
          }),
        };
      });
      saveSections(updated);
    },
    [saveSections]
  );

  // ── Add block to section (inserts at top) ──

  const handleAddBlock = useCallback(
    (sectionId: string) => {
      const updated = insertBlockIntoSection(sectionsRef.current, sectionId);
      if (!updated) return;
      saveSections(updated);
    },
    [saveSections]
  );

  // ── Add element to block (via picker) ──

  const [elementPickerTarget, setElementPickerTarget] = useState<{
    sectionId: string;
    blockId: string;
  } | null>(null);

  // Build a merged SlotDefinition for the target block's allowed elements
  const elementPickerSlotDef: SlotDefinition | null = useMemo(() => {
    if (!elementPickerTarget || !registryReady) return null;
    const section = sections.find((s) => s.id === elementPickerTarget.sectionId);
    if (!section) return null;
    const preset = getPresetForSection(section);
    const block = section.blocks.find((b) => b.id === elementPickerTarget.blockId);
    if (!preset || !block) return null;
    const blockTypeDef = preset.blockTypes.find((bt) => bt.type === block.type);
    if (!blockTypeDef) return null;

    // Merge allowed elements from all slots (deduplicated)
    const allowed = new Set<ElementType>();
    for (const slot of blockTypeDef.slots) {
      for (const el of slot.allowedElements) allowed.add(el);
    }

    return {
      key: "__picker",
      name: "Element",
      description: "",
      allowedElements: [...allowed],
      minElements: 0,
      maxElements: -1,
      defaultElements: [],
    };
  }, [elementPickerTarget, sections, registryReady]);

  const blockElementPickerData = useMemo(() => {
    if (!elementPickerSlotDef) return { items: [], categories: [] };
    return buildElementPickerData(elementPickerSlotDef);
  }, [elementPickerSlotDef]);

  const handleOpenElementPicker = useCallback(
    (sectionId: string, blockId: string) => {
      setElementPickerTarget({ sectionId, blockId });
    },
    []
  );

  const elementPickerTargetRef = useRef(elementPickerTarget);
  elementPickerTargetRef.current = elementPickerTarget;

  const handlePickElementForBlock = useCallback(
    (elementType: string, presetKey?: string) => {
      const target = elementPickerTargetRef.current;
      if (!target) return;
      const { sectionId, blockId } = target;

      const updated = insertElementIntoBlock(
        sectionsRef.current, sectionId, blockId, elementType as ElementType, presetKey
      );
      if (!updated) return;
      saveSections(updated);
      setElementPickerTarget(null);
    },
    [saveSections]
  );

  // ── Section picker: open / close / select ──

  const handleOpenPicker = useCallback(
    (atIndex?: number) => {
      setPickerInsertIndex(atIndex ?? sectionsRef.current.length);
    },
    []
  );

  const pickerInsertIndexRef = useRef(pickerInsertIndex);
  pickerInsertIndexRef.current = pickerInsertIndex;

  const handlePickSection = useCallback(
    (definitionId: string, presetKey?: string) => {
      const newSection = createSectionFromPicker(definitionId, presetKey);
      if (!newSection) return;

      const cur = sectionsRef.current;
      const insertAt = pickerInsertIndexRef.current ?? cur.length;
      const updated = [...cur];
      updated.splice(insertAt, 0, newSection);
      saveSections(updated.map((s, i) => ({ ...s, sortOrder: i })));
      setPickerInsertIndex(null);
    },
    [saveSections]
  );

  // ── Picker data (memoised, rebuilt when registry is ready) ──

  const pickerData = useMemo(() => {
    if (!registryReady) return { items: [], categories: [] };
    return buildSectionPickerData();
  }, [registryReady]);

  // ── Standalone element picker (test — allows all element types) ──

  const testSlotDef: SlotDefinition = useMemo(() => ({
    key: "test",
    name: "Test",
    description: "Alla element",
    allowedElements: ["heading", "text", "richtext", "collapsible", "button", "image", "video", "gallery", "divider", "icon", "map"] as ElementType[],
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

      const cur = sectionsRef.current;
      const looseSection: SectionInstance = {
        id: createSectionId(),
        definitionId: "__loose-element",
        definitionVersion: "1.0.0",
        presetKey: "default",
        presetVersion: "1.0.0",
        sortOrder: cur.length,
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

      saveSections([...cur, looseSection].map((s, i) => ({ ...s, sortOrder: i })));
      setElementPickerOpen(false);
    },
    [saveSections]
  );

  // ── Section DND handlers ──

  const handleSectionDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveDrag({ level: "section", id: event.active.id as string });
      sectionsBeforeDragRef.current = sectionsRef.current;
    },
    []
  );

  const handleSectionDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDrag(null);

      if (!over || active.id === over.id) return;

      const cur = sectionsRef.current;
      const oldIndex = cur.findIndex((s) => s.id === active.id);
      const newIndex = cur.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(cur, oldIndex, newIndex).map((s, i) => ({
        ...s,
        sortOrder: i,
      }));

      saveSections(reordered);
    },
    [saveSections]
  );

  const handleSectionDragCancel = useCallback(() => {
    setActiveDrag(null);
  }, []);

  // ── Block DND handlers (scoped to a section) ──
  // Factory functions — stable identity. BlockDropZone memoizes the call internally.

  const handleBlockDragStart = useCallback(
    (sectionId: string) => (event: DragStartEvent) => {
      setActiveDrag({ level: "block", id: event.active.id as string, sectionId });
    },
    []
  );

  const handleBlockDragEnd = useCallback(
    (sectionId: string) => (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDrag(null);

      if (!over || active.id === over.id) return;

      const cur = sectionsRef.current;
      const section = cur.find((s) => s.id === sectionId);
      if (!section) return;

      const blocks = [...section.blocks].sort((a, b) => a.sortOrder - b.sortOrder);
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(blocks, oldIndex, newIndex).map((b, i) => ({
        ...b,
        sortOrder: i,
      }));

      const updated = cur.map((s) =>
        s.id === sectionId ? { ...s, blocks: reordered } : s
      );
      saveSections(updated);
    },
    [saveSections]
  );

  const handleBlockDragCancel = useCallback(() => {
    setActiveDrag(null);
  }, []);

  // ── Element DND handlers (scoped to a block within a section) ──
  // Factory functions — stable identity. ElementDropZone memoizes the call internally.

  const handleElementDragStart = useCallback(
    (sectionId: string, blockId: string) => (event: DragStartEvent) => {
      setActiveDrag({ level: "element", id: event.active.id as string, sectionId, blockId });
    },
    []
  );

  const handleElementDragEnd = useCallback(
    (sectionId: string, blockId: string) => (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDrag(null);

      if (!over || active.id === over.id) return;

      const cur = sectionsRef.current;
      const section = cur.find((s) => s.id === sectionId);
      if (!section) return;
      const block = section.blocks.find((b) => b.id === blockId);
      if (!block) return;

      for (const [slotKey, elements] of Object.entries(block.slots)) {
        const oldIndex = elements.findIndex((el) => el.id === active.id);
        const newIndex = elements.findIndex((el) => el.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          const reordered = arrayMove(elements, oldIndex, newIndex).map((el, i) => ({
            ...el,
            sortOrder: i,
          }));

          const updated = cur.map((s) => {
            if (s.id !== sectionId) return s;
            return {
              ...s,
              blocks: s.blocks.map((b) => {
                if (b.id !== blockId) return b;
                return { ...b, slots: { ...b.slots, [slotKey]: reordered } };
              }),
            };
          });
          saveSections(updated);
          return;
        }
      }
    },
    [saveSections]
  );

  const handleElementDragCancel = useCallback(() => {
    setActiveDrag(null);
  }, []);

  // ── Sorted sections (memoized to avoid new array ref every render) ──

  const sorted = useMemo(
    () => [...sections].sort((a, b) => a.sortOrder - b.sortOrder),
    [sections]
  );

  // ── Resolve block type name helper ──

  const getBlockName = useCallback(
    (section: SectionInstance, block: BlockInstance) => {
      const preset = getPresetForSection(section);
      const bt = preset?.blockTypes.find((t) => t.type === block.type);
      return bt?.name || block.type;
    },
    []
  );

  const getBlockIcon = useCallback(
    (section: SectionInstance, block: BlockInstance) => {
      const preset = getPresetForSection(section);
      const bt = preset?.blockTypes.find((t) => t.type === block.type);
      return bt?.icon || "bottom_navigation";
    },
    []
  );

  // Resolve the primary block type name for "Lägg till X" buttons
  const getAddBlockLabel = useCallback(
    (section: SectionInstance): string => resolveAddBlockLabel(section),
    []
  );

  // ── Derive whether drop zones are active ──
  const isDraggingSection = activeDrag?.level === "section";

  return (
    <>
      {/* ── Page header ── */}
      <div className="sp-page-header">
        <span className="sp-page-name">Startsida</span>
      </div>

      <div className="sp-template-label">Mall</div>

      {/* ── Section list ── */}
      <div className={`sp-list${isDraggingSection ? " sp-dropzone--active" : ""}`}>
        <DndContext
          id="sections-dnd"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleSectionDragStart}
          onDragEnd={handleSectionDragEnd}
          onDragCancel={handleSectionDragCancel}
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
              sorted.map((section, index) => {
                // Collapse only the section being dragged, not others
                const isBeingDragged = isDraggingSection && activeDrag?.id === section.id;
                const sectionOpen = !isBeingDragged && !collapsedIds.has(section.id);
                const blocks = (section.blocks ?? [])
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder);
                const hasChildren = blocks.length > 0;

                // Is this section's block area the active drop zone?
                const blockZoneActive =
                  activeDrag?.level === "block" &&
                  activeDrag.sectionId === section.id;

                return (
                  <React.Fragment key={section.id}>
                    {index === 0 && !isDraggingSection && (
                      <SectionDivider onClick={() => handleOpenPicker(0)} />
                    )}
                    <SortableSectionRow
                      section={section}
                      onToggleVisibility={handleToggleVisibility}
                      onDelete={handleRequestDelete}
                      onClick={() => openDetail({ sectionId: section.id })}
                      collapsed={!sectionOpen}
                      onToggleCollapse={() => toggleCollapse(section.id)}
                    />
                    {/* Section content — only when expanded */}
                    {sectionOpen && (
                      <>
                        {/* "Lägg till X" button at top of section */}
                        <AddButton
                          label={`Lägg till ${getAddBlockLabel(section)}`}
                          indent={1}
                          onClick={() => handleAddBlock(section.id)}
                          disabled={!canAddBlock(section)}
                        />
                        {/* Block area with DnD */}
                        {hasChildren && (
                          <BlockDropZone
                            sectionId={section.id}
                            blocks={blocks}
                            section={section}
                            isDropTarget={blockZoneActive}
                            activeDrag={activeDrag}
                            sensors={sensors}
                            collapsedIds={collapsedIds}
                            blockDragStartFactory={handleBlockDragStart}
                            blockDragEndFactory={handleBlockDragEnd}
                            onBlockDragCancel={handleBlockDragCancel}
                            elementDragStartFactory={handleElementDragStart}
                            elementDragEndFactory={handleElementDragEnd}
                            onElementDragCancel={handleElementDragCancel}
                            onToggleCollapse={toggleCollapse}
                            onToggleBlockVisibility={handleToggleBlockVisibility}
                            onDeleteBlock={handleDeleteBlock}
                            onDeleteElement={handleDeleteElement}
                            getBlockName={getBlockName}
                            getBlockIcon={getBlockIcon}
                            openDetail={openDetail}
                            onAddElement={handleOpenElementPicker}
                          />
                        )}
                      </>
                    )}
                    {!isDraggingSection && (
                      <SectionDivider onClick={() => handleOpenPicker(index + 1)} />
                    )}
                  </React.Fragment>
                );
              }))
            }
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {isDraggingSection && activeDrag ? (
              (() => {
                const s = sections.find((s) => s.id === activeDrag.id);
                if (!s) return null;
                return (
                  <SectionRow
                    section={s}
                    onToggleVisibility={() => {}}
                    onDelete={() => {}}
                    isOverlay
                    collapsed
                  />
                );
              })()
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

      {/* ── Element picker for block insertion ── */}
      {elementPickerTarget && blockElementPickerData.items.length > 0 && (
        <PickerModal
          title="Lägg till element"
          items={blockElementPickerData.items}
          categories={blockElementPickerData.categories}
          getPresets={getElementPresets}
          presetLabel="Element"
          onSelect={handlePickElementForBlock}
          onClose={() => setElementPickerTarget(null)}
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

// ─── Block Drop Zone ────────────────────────────────────────
// Wraps a section's blocks in their own DndContext + SortableContext.
// Has its own drop zone highlight when blocks are being dragged.

const BlockDropZone = React.memo(function BlockDropZone({
  sectionId,
  blocks,
  section,
  isDropTarget,
  activeDrag,
  sensors,
  collapsedIds,
  blockDragStartFactory,
  blockDragEndFactory,
  onBlockDragCancel,
  elementDragStartFactory,
  elementDragEndFactory,
  onElementDragCancel,
  onToggleCollapse,
  onToggleBlockVisibility,
  onDeleteBlock,
  onDeleteElement,
  getBlockName,
  getBlockIcon,
  openDetail,
  onAddElement,
}: {
  sectionId: string;
  blocks: BlockInstance[];
  section: SectionInstance;
  isDropTarget: boolean;
  activeDrag: ActiveDrag | null;
  sensors: ReturnType<typeof useSensors>;
  collapsedIds: Set<string>;
  blockDragStartFactory: (sectionId: string) => (event: DragStartEvent) => void;
  blockDragEndFactory: (sectionId: string) => (event: DragEndEvent) => void;
  onBlockDragCancel: () => void;
  elementDragStartFactory: (sectionId: string, blockId: string) => (event: DragStartEvent) => void;
  elementDragEndFactory: (sectionId: string, blockId: string) => (event: DragEndEvent) => void;
  onElementDragCancel: () => void;
  onToggleCollapse: (id: string) => void;
  onToggleBlockVisibility: (sectionId: string, blockId: string) => void;
  onDeleteBlock: (sectionId: string, blockId: string) => void;
  onDeleteElement: (sectionId: string, blockId: string, elementId: string) => void;
  getBlockName: (section: SectionInstance, block: BlockInstance) => string;
  getBlockIcon: (section: SectionInstance, block: BlockInstance) => string;
  openDetail: (target: { sectionId: string; blockId?: string; elementId?: string }) => void;
  onAddElement: (sectionId: string, blockId: string) => void;
}) {
  // Memoize curried handlers inside the component (sectionId is stable for this instance)
  const onBlockDragStart = useMemo(() => blockDragStartFactory(sectionId), [blockDragStartFactory, sectionId]);
  const onBlockDragEnd = useMemo(() => blockDragEndFactory(sectionId), [blockDragEndFactory, sectionId]);

  return (
    <div className={`sp-dropzone${isDropTarget ? " sp-dropzone--active" : ""}`}>
      <DndContext
        id={`blocks-dnd-${sectionId}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onBlockDragStart}
        onDragEnd={onBlockDragEnd}
        onDragCancel={onBlockDragCancel}
      >
        <SortableContext
          items={blocks.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          {blocks.map((block) => {
            const blockBeingDragged = activeDrag?.level === "block" && activeDrag.id === block.id;
            const blockOpen = !blockBeingDragged && !collapsedIds.has(block.id);
            const elements = Object.values(block.slots)
              .flat()
              .sort((a, b) => a.sortOrder - b.sortOrder);
            const hasElements = elements.length > 0;

            const elementZoneActive =
              activeDrag?.level === "element" &&
              activeDrag.blockId === block.id;

            return (
              <React.Fragment key={block.id}>
                <SortableTreeRow
                  id={block.id}
                  icon={getBlockIcon(section, block)}
                  name={getBlockName(section, block)}
                  isActive={block.isActive}
                  indent={1}
                  collapsed={!blockOpen}
                  onToggleCollapse={() => onToggleCollapse(block.id)}
                  onToggleVisibility={() =>
                    onToggleBlockVisibility(sectionId, block.id)
                  }
                  onDelete={() =>
                    onDeleteBlock(sectionId, block.id)
                  }
                  onClick={() =>
                    openDetail({ sectionId, blockId: block.id })
                  }
                />
                {blockOpen && (
                  <>
                    <AddButton
                      label="Lägg till element"
                      indent={2}
                      onClick={() => onAddElement(sectionId, block.id)}
                      disabled={!canAddElement(section, block)}
                    />
                    {hasElements && (
                      <ElementDropZone
                        sectionId={sectionId}
                        blockId={block.id}
                        elements={elements}
                        isDropTarget={elementZoneActive}
                        activeDrag={activeDrag}
                        sensors={sensors}
                        elementDragStartFactory={elementDragStartFactory}
                        elementDragEndFactory={elementDragEndFactory}
                        onElementDragCancel={onElementDragCancel}
                        onDeleteElement={onDeleteElement}
                        openDetail={openDetail}
                      />
                    )}
                  </>
                )}
              </React.Fragment>
            );
          })}
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeDrag?.level === "block" && activeDrag.sectionId === sectionId ? (
            (() => {
              const block = blocks.find((b) => b.id === activeDrag.id);
              if (!block) return null;
              return (
                <TreeRow
                  icon={getBlockIcon(section, block)}
                  name={getBlockName(section, block)}
                  isActive={block.isActive}
                  indent={1}
                  isOverlay
                  collapsed
                />
              );
            })()
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
});

// ─── Element Drop Zone ──────────────────────────────────────
// Wraps a block's elements in their own DndContext + SortableContext.

const ElementDropZone = React.memo(function ElementDropZone({
  sectionId,
  blockId,
  elements,
  isDropTarget,
  activeDrag,
  sensors,
  elementDragStartFactory,
  elementDragEndFactory,
  onElementDragCancel,
  onDeleteElement,
  openDetail,
}: {
  sectionId: string;
  blockId: string;
  elements: ElementInstance[];
  isDropTarget: boolean;
  activeDrag: ActiveDrag | null;
  sensors: ReturnType<typeof useSensors>;
  elementDragStartFactory: (sectionId: string, blockId: string) => (event: DragStartEvent) => void;
  elementDragEndFactory: (sectionId: string, blockId: string) => (event: DragEndEvent) => void;
  onElementDragCancel: () => void;
  onDeleteElement: (sectionId: string, blockId: string, elementId: string) => void;
  openDetail: (target: { sectionId: string; blockId?: string; elementId?: string }) => void;
}) {
  // Memoize curried handlers (sectionId + blockId stable for this instance)
  const onElementDragStart = useMemo(
    () => elementDragStartFactory(sectionId, blockId),
    [elementDragStartFactory, sectionId, blockId]
  );
  const onElementDragEnd = useMemo(
    () => elementDragEndFactory(sectionId, blockId),
    [elementDragEndFactory, sectionId, blockId]
  );

  return (
    <div className={`sp-dropzone${isDropTarget ? " sp-dropzone--active" : ""}`}>
      <DndContext
        id={`elements-dnd-${blockId}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onElementDragStart}
        onDragEnd={onElementDragEnd}
        onDragCancel={onElementDragCancel}
      >
        <SortableContext
          items={elements.map((el) => el.id)}
          strategy={verticalListSortingStrategy}
        >
          {elements.map((el) => (
            <SortableTreeRow
              key={el.id}
              id={el.id}
              icon={ELEMENT_ICON_NAMES[el.type] || "widgets"}
              name={getElementName(el.type)}
              isActive={true}
              indent={2}
              onDelete={() =>
                onDeleteElement(sectionId, blockId, el.id)
              }
              onClick={() =>
                openDetail({
                  sectionId,
                  blockId,
                  elementId: el.id,
                })
              }
            />
          ))}
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeDrag?.level === "element" && activeDrag.blockId === blockId ? (
            (() => {
              const el = elements.find((e) => e.id === activeDrag.id);
              if (!el) return null;
              return (
                <TreeRow
                  icon={ELEMENT_ICON_NAMES[el.type] || "widgets"}
                  name={getElementName(el.type)}
                  isActive={true}
                  indent={2}
                  isOverlay
                />
              );
            })()
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
});

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
  collapsed,
  onToggleCollapse,
}: {
  section: SectionInstance;
  onToggleVisibility: (id: string) => void;
  onDelete: (id: string) => void;
  onClick?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
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
    opacity: isDragging ? 0 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <SectionRow
        section={section}
        onToggleVisibility={onToggleVisibility}
        onDelete={onDelete}
        onClick={onClick}
        dragHandleProps={{ ...attributes, ...listeners }}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />
    </div>
  );
}

// ─── Sortable Tree Row (for blocks & elements) ─────────────

function SortableTreeRow({
  id,
  icon,
  name,
  isActive,
  indent,
  collapsed,
  onToggleCollapse,
  onToggleVisibility,
  onDelete,
  onClick,
}: {
  id: string;
  icon: string;
  name: string;
  isActive: boolean;
  indent: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onToggleVisibility?: () => void;
  onDelete?: () => void;
  onClick?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TreeRow
        icon={icon}
        name={name}
        isActive={isActive}
        indent={indent}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        onToggleVisibility={onToggleVisibility}
        onDelete={onDelete}
        onClick={onClick}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

// ─── Section Row ────────────────────────────────────────────

const SectionRow = React.memo(function SectionRow({
  section,
  onToggleVisibility,
  onDelete,
  onClick,
  dragHandleProps,
  isOverlay,
  collapsed,
  onToggleCollapse,
}: {
  section: SectionInstance;
  onToggleVisibility: (id: string) => void;
  onDelete: (id: string) => void;
  onClick?: () => void;
  dragHandleProps?: Record<string, unknown>;
  isOverlay?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  // Resolve section icon from definition
  const sectionIcon = (() => {
    if (section.definitionId === "__loose-element") return "widgets";
    const def = getSectionDefinition(section.definitionId);
    const bt = def?.presets[0]?.blockTypes[0];
    return bt?.icon || "grid_view";
  })();

  // Resolve display name
  const sectionName = (() => {
    if (section.definitionId === "__loose-element") {
      const firstEl = (section.blocks ?? [])[0]?.slots?.content?.[0];
      return firstEl
        ? (getElementDefinition(firstEl.type)?.name ?? section.title ?? section.definitionId)
        : (section.title || section.definitionId);
    }
    return section.title || getSectionDefinition(section.definitionId)?.name || section.definitionId;
  })();

  return (
    <div
      className={`sp-row${!section.isActive ? " sp-row--inactive" : ""}${isOverlay ? " sp-row--overlay" : ""}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      {onToggleCollapse && (
        <button
          type="button"
          className="sp-row__chevron"
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
          aria-label={collapsed ? "Expandera" : "Fäll ihop"}
        >
          <EditorIcon name={collapsed ? "chevron_right" : "expand_more"} size={16} />
        </button>
      )}
      <div
        className="sp-row__handle"
        {...(dragHandleProps ?? {})}
        title="Dra för att sortera"
      >
        {isHovered && !isOverlay ? <DragIcon /> : <EditorIcon name={sectionIcon} size={16} />}
      </div>

      <span className="sp-row__name">{sectionName}</span>

      <div className="sp-row__actions">
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
});

// ─── Shared helpers ──────────────────────────────────────────

function getElementName(type: string): string {
  const def = getElementDefinition(type as import("@/app/_lib/sections/types").ElementType);
  return def?.name || type;
}

const ELEMENT_ICON_NAMES: Record<string, string> = {
  heading: "title",
  text: "view_headline",
  button: "call_to_action",
  image: "image",
  divider: "horizontal_rule",
  icon: "star",
  richtext: "wysiwyg",
  collapsible: "close_fullscreen",
  map: "map",
  video: "youtube_activity",
  gallery: "gallery_thumbnail",
};

// ─── Tree Row (unified row for blocks & elements) ───────────

const TreeRow = React.memo(function TreeRow({
  icon,
  name,
  isActive,
  indent,
  collapsed,
  onToggleCollapse,
  onToggleVisibility,
  onDelete,
  onClick,
  dragHandleProps,
  isOverlay,
}: {
  icon: string;
  name: string;
  isActive: boolean;
  indent: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onToggleVisibility?: () => void;
  onDelete?: () => void;
  onClick?: () => void;
  dragHandleProps?: Record<string, unknown>;
  isOverlay?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`sp-row${!isActive ? " sp-row--inactive" : ""}${isOverlay ? " sp-row--overlay" : ""}`}
      style={{ marginLeft: indent * 20 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      {onToggleCollapse && (
        <button
          type="button"
          className="sp-row__chevron"
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
          aria-label={collapsed ? "Expandera" : "Fäll ihop"}
        >
          <EditorIcon name={collapsed ? "chevron_right" : "expand_more"} size={16} />
        </button>
      )}
      <div
        className="sp-row__handle"
        {...(dragHandleProps ?? {})}
        title="Dra för att sortera"
      >
        {isHovered && !isOverlay ? <DragIcon /> : <EditorIcon name={icon} size={16} />}
      </div>
      <span className="sp-row__name">{name}</span>
      <div className="sp-row__actions">
        {isActive && isHovered && !isOverlay && onDelete && (
          <Tooltip label="Radera">
            <button
              type="button"
              className="sp-row__action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label="Radera"
            >
              <TrashIcon />
            </button>
          </Tooltip>
        )}
        {onToggleVisibility && (!isActive || (isHovered && !isOverlay)) && (
          <Tooltip label={isActive ? "Dölj" : "Visa"}>
            <button
              type="button"
              className={`sp-row__action-btn${!isActive ? " sp-row__action-btn--muted" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility();
              }}
              aria-label={isActive ? "Dölj" : "Visa"}
            >
              {isActive ? <EyeOpenIcon /> : <EyeClosedIcon />}
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
});

// ─── Section Divider ────────────────────────────────────────

// ─── Add Button (inline add for blocks/elements) ────────

const AddButton = React.memo(function AddButton({ label, indent, onClick, disabled }: { label: string; indent: number; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={`sp-add-inline${disabled ? " sp-add-inline--disabled" : ""}`}
      style={{ marginLeft: indent * 20 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <EditorIcon name="add" size={14} />
      <span>{label}</span>
    </button>
  );
});

const SectionDivider = React.memo(function SectionDivider({ onClick }: { onClick: () => void }) {
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
});

// ─── Icons ──────────────────────────────────────────────────

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
