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
import { ensureSectionsRegistered, getElementDefinition, getSectionDefinition, getAllSectionDefinitions, getAllElementDefinitions } from "@/app/_lib/sections/registry";
import { Tooltip } from "@/app/_components/Tooltip";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { useEditor } from "../EditorContext";
import { DetailPanel } from "./DetailPanel";
import {
  PickerModal,
  buildSectionPickerData,
  buildElementPickerData,
  createSectionFromPicker,
  createElementFromPicker,
  STANDALONE_PICKER_PREFIX,
  SECTION_PICKER_TABS,
} from "./PickerModal";
import { getPickerPreview, getElementPreview as getElementPickerPreview } from "./picker-previews";
import type { SlotDefinition, ElementType } from "@/app/_lib/sections/types";
import {
  insertBlockIntoSection,
  insertElementIntoBlock,
  getAddBlockLabel as resolveAddBlockLabel,
  canAddBlock,
  canAddElement,
  hasMultipleBlockTypes,
  getPresetForSection,
  isStandaloneSection,
  createStandaloneSection,
  getStandaloneElement,
  STANDALONE_DEFINITION_ID,
} from "@/app/_lib/sections/mutations";
import { getPageLayout, getPageDefinition, getPageSections, getPageUndoSnapshot, buildSectionsPatch, getPageFooter, buildFooterPatch } from "@/app/_lib/pages";
import { PAGE_FOOTER_DEFAULTS } from "@/app/(guest)/_lib/tenant/types";
import { PageResourcePicker } from "./PageResourcePicker";

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
  const { openDetail, inspectorHoveredSectionId, currentPageId } = useEditor();

  // Resolve page layout contract and editor mode from current page
  const pageDef = useMemo(() => getPageDefinition(currentPageId), [currentPageId]);
  const layout = useMemo(() => getPageLayout(currentPageId), [currentPageId]);
  const editorMode = pageDef.editorMode;

  const sections: SectionInstance[] = useMemo(
    () => getPageSections(config, currentPageId),
    [config, currentPageId],
  );

  // ── Stable refs ──
  // These break the cascade: config/sections change → handler recreated → all props change.
  // Handlers read from refs instead, keeping their identity stable across renders.
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const configRef = useRef(config);
  configRef.current = config;
  const currentPageIdRef = useRef(currentPageId);
  currentPageIdRef.current = currentPageId;
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

  // ── Auto-seed locked sections (generic: any definition with scope=locked + lockedTo) ──
  const hasSeededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!registryReady || !config) return;
    if (hasSeededRef.current === currentPageId) return;

    // Find all locked definitions that target this page
    const lockedDefs = getAllSectionDefinitions().filter(
      (d) => {
        if (d.scope !== "locked") return false;
        if (!d.lockedTo) return false;
        if (Array.isArray(d.lockedTo)) return d.lockedTo.includes(currentPageId);
        return d.lockedTo === currentPageId;
      },
    );
    if (lockedDefs.length === 0) {
      hasSeededRef.current = currentPageId;
      return;
    }

    const current = getPageSections(config, currentPageId);
    const existingDefIds = new Set(current.map((s) => s.definitionId));
    const toSeed: SectionInstance[] = [];

    for (const def of lockedDefs) {
      if (existingDefIds.has(def.id)) continue;
      const defaults = def.createDefault();
      toSeed.push({
        id: createSectionId(),
        sortOrder: 0,
        ...defaults,
      });
    }

    hasSeededRef.current = currentPageId;
    if (toSeed.length > 0) {
      saveDraftRef.current(buildSectionsPatch(config, currentPageId, [...toSeed, ...current]));
    }
  }, [registryReady, config, currentPageId]);

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
      pushUndoRef.current(getPageUndoSnapshot(cfg, currentPageIdRef.current));
      saveDraftRef.current(buildSectionsPatch(cfg, currentPageIdRef.current, updated));
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

      if ((section.blocks ?? []).length === 0) {
        const updated = sectionsRef.current
          .filter((s) => s.id !== id)
          .map((s, i) => ({ ...s, sortOrder: i }));
        saveSections(updated);
      } else {
        setDeleteConfirm({
          sectionId: id,
          sectionTitle: section.title || section.definitionId,
          blockCount: (section.blocks ?? []).length,
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

  const handleToggleElementVisibility = useCallback(
    (sectionId: string, blockId: string, elementId: string) => {
      const updated = sectionsRef.current.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          blocks: s.blocks.map((b) => {
            if (b.id !== blockId) return b;
            return {
              ...b,
              slots: Object.fromEntries(
                Object.entries(b.slots).map(([k, els]) => [
                  k,
                  els.map((el) =>
                    el.id === elementId
                      ? { ...el, isActive: !(el.isActive ?? true) }
                      : el
                  ),
                ]),
              ),
            };
          }),
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
    const section = elementPickerTarget
      ? sections.find((s) => s.id === elementPickerTarget.sectionId)
      : undefined;
    return buildElementPickerData(elementPickerSlotDef, {
      pageId: currentPageId,
      sectionDefinitionId: section?.definitionId,
    });
  }, [elementPickerSlotDef, elementPickerTarget, sections, currentPageId]);

  const handleOpenElementPicker = useCallback(
    (sectionId: string, blockId: string) => {
      setElementPickerTarget({ sectionId, blockId });
    },
    []
  );

  const elementPickerTargetRef = useRef(elementPickerTarget);
  elementPickerTargetRef.current = elementPickerTarget;

  const handlePickElementForBlock = useCallback(
    (elementType: string) => {
      const target = elementPickerTargetRef.current;
      if (!target) return;
      const { sectionId, blockId } = target;

      const updated = insertElementIntoBlock(
        sectionsRef.current, sectionId, blockId, elementType as ElementType
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
    (definitionId: string) => {
      let newSection: SectionInstance | null;

      // Standalone element: id is "element:{elementType}"
      if (definitionId.startsWith(STANDALONE_PICKER_PREFIX)) {
        const elementType = definitionId.slice(STANDALONE_PICKER_PREFIX.length) as ElementType;
        newSection = createStandaloneSection(elementType);
      } else {
        const cfg = configRef.current;
        newSection = createSectionFromPicker(
          definitionId,
          undefined,
          cfg?.defaultColorSchemeId ?? undefined,
        );
      }

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
    return buildSectionPickerData({ pageId: currentPageId });
  }, [registryReady, currentPageId]);

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
    (elementType: string) => {
      const el = createElementFromPicker(elementType as ElementType);
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
        <span className="sp-page-name">{pageDef.label}</span>
        {pageDef.previewResource && (
          <PageResourcePicker resource={pageDef.previewResource} pageId={currentPageId} />
        )}
      </div>

      {/* ── Header section (if layout supports it) ── */}
      {layout.header && (
        <>
          <div className="sp-template-label">Sidhuvud</div>
          <div className="sp-list sp-list--header">
            <div
              className="sp-row sp-row--header"
              onClick={() => openDetail({ scope: "header", sectionId: "__header" })}
            >
              <div className="sp-row__handle">
                <EditorIcon name="page_header" size={16} />
              </div>
              <span className="sp-row__name">Sidhuvud</span>
            </div>
          </div>
        </>
      )}

      {/* ── Body template ── */}
      {editorMode === "full" ? (
        <div className="sp-template-label">Mall</div>
      ) : editorMode === "locked" ? (
        <>
          <div className="sp-template-label">Sidinnehåll</div>
          <div className="sp-fixed-body">
            <EditorIcon name="lock" size={16} />
            <span>Denna sida har fast innehåll som styrs av plattformen.</span>
          </div>
        </>
      ) : (
        <div className="sp-fixed-body">
          <span>Anpassning med block är inte tillgängligt för den här sidan.</span>
        </div>
      )}

      {/* ── Section list (if editor mode is full) ── */}
      {editorMode === "full" && (
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
                const firstBlock = blocks[0];

                // ── Standalone mode (first-class element — no tree children) ──
                if (isStandaloneSection(section)) {
                  return (
                    <React.Fragment key={section.id}>
                      {index === 0 && !isDraggingSection && (
                        <SectionDivider onClick={() => handleOpenPicker(0)} />
                      )}
                      <SortableSectionRow
                        section={section}
                        onToggleVisibility={handleToggleVisibility}
                        onDelete={handleRequestDelete}
                        onClick={() => {
                          const el = getStandaloneElement(section);
                          if (el) {
                            openDetail({
                              sectionId: section.id,
                              blockId: section.blocks[0]?.id,
                              elementId: el.id,
                            });
                          } else {
                            openDetail({ sectionId: section.id });
                          }
                        }}
                        collapsed
                        inspectorHighlight={inspectorHoveredSectionId === section.id}
                      />
                      {!isDraggingSection && (
                        <SectionDivider onClick={() => handleOpenPicker(index + 1)} />
                      )}
                    </React.Fragment>
                  );
                }

                // Hybrid tree: sections with maxBlocks > 1 show blocks as items
                // (accordion items, tabs, slides). Others flatten to elements.
                const preset = getPresetForSection(section);
                const showBlocks = preset
                  ? (preset.maxBlocks > 1 || (preset.maxBlocks === -1 && blocks.length > 1))
                  : false;

                if (showBlocks) {
                  // ── Block-visible mode (accordion, tabs, slider) ──
                  const hasChildren = blocks.length > 0;
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
                        collapsed={section.locked ? true : !sectionOpen}
                        onToggleCollapse={section.locked ? undefined : () => toggleCollapse(section.id)}
                        inspectorHighlight={inspectorHoveredSectionId === section.id}
                      >
                        {!section.locked && sectionOpen && (
                          <>
                            <AddButton
                              label={`Lägg till ${getAddBlockLabel(section)}`}
                              indent={1}
                              onClick={() => handleAddBlock(section.id)}
                              disabled={!canAddBlock(section)}
                            />
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
                                onToggleElementVisibility={handleToggleElementVisibility}
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
                      </SortableSectionRow>
                      {!isDraggingSection && (
                        <SectionDivider onClick={() => handleOpenPicker(index + 1)} />
                      )}
                    </React.Fragment>
                  );
                }

                // ── Flat mode (generic sections — blocks hidden, elements direct) ──
                const allElements = blocks.flatMap((b) =>
                  Object.values(b.slots)
                    .flat()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                );
                const hasElements = allElements.length > 0;
                const elementZoneActive =
                  activeDrag?.level === "element" &&
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
                      collapsed={section.locked ? true : !sectionOpen}
                      onToggleCollapse={section.locked ? undefined : () => toggleCollapse(section.id)}
                      inspectorHighlight={inspectorHoveredSectionId === section.id}
                    >
                      {!section.locked && sectionOpen && (
                        <>
                          {firstBlock && (
                            <AddButton
                              label="Lägg till element"
                              indent={1}
                              onClick={() => handleOpenElementPicker(section.id, firstBlock.id)}
                              disabled={!canAddElement(section, firstBlock)}
                            />
                          )}
                          {hasElements && firstBlock && (
                            <ElementDropZone
                              sectionId={section.id}
                              blockId={firstBlock.id}
                              elements={allElements}
                              isDropTarget={elementZoneActive}
                              activeDrag={activeDrag}
                              sensors={sensors}
                              elementDragStartFactory={handleElementDragStart}
                              elementDragEndFactory={handleElementDragEnd}
                              onElementDragCancel={handleElementDragCancel}
                              onToggleElementVisibility={handleToggleElementVisibility}
                              onDeleteElement={handleDeleteElement}
                              openDetail={openDetail}
                              locked={section.locked}
                              indent={1}
                            />
                          )}
                        </>
                      )}
                    </SortableSectionRow>
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

        {/* ── Add section/element button (always at bottom) ── */}
        <button
          type="button"
          className="sp-add-row"
          onClick={() => handleOpenPicker()}
        >
          <EditorIcon name="add_circle" size={16} />
          <span>Lägg till avsnitt</span>
        </button>
      </div>
      )}

      {/* ── Footer section (if layout supports it) ── */}
      {layout.footer && config && (
        <FooterSectionTree
          config={config}
          currentPageId={currentPageId}
          collapsedIds={collapsedIds}
          toggleCollapse={toggleCollapse}
          openDetail={openDetail}
          pushUndo={pushUndo}
          saveDraft={saveDraft}
        />
      )}

      {/* ── Section picker modal ── */}
      {pickerInsertIndex !== null && (
        <PickerModal
          title="Lägg till"
          searchPlaceholder="Sök..."
          items={pickerData.items}
          categories={pickerData.categories}
          tabs={SECTION_PICKER_TABS}
          defaultTab="sections"
          getPreview={getPickerPreview}
          onSelect={handlePickSection}
          onClose={() => setPickerInsertIndex(null)}
        />
      )}

      {/* ── Element picker modal (test) ── */}
      {elementPickerOpen && (
        <PickerModal
          title="Lägg till element"
          searchPlaceholder="Sök efter element..."
          items={elementPickerData.items}
          categories={elementPickerData.categories}
          getPreview={getElementPickerPreview}
          onSelect={handlePickElement}
          onClose={() => setElementPickerOpen(false)}
        />
      )}

      {/* ── Element picker for block insertion ── */}
      {elementPickerTarget && blockElementPickerData.items.length > 0 && (
        <PickerModal
          title="Lägg till element"
          searchPlaceholder="Sök efter element..."
          items={blockElementPickerData.items}
          categories={blockElementPickerData.categories}
          getPreview={getElementPickerPreview}
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
  onToggleElementVisibility,
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
  onToggleElementVisibility: (sectionId: string, blockId: string, elementId: string) => void;
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
              <SortableTreeRow
                  key={block.id}
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
                  onDelete={section.locked ? undefined : () =>
                    onDeleteBlock(sectionId, block.id)
                  }
                  onClick={() =>
                    openDetail({ sectionId, blockId: block.id })
                  }
                >
                {blockOpen && (
                  <>
                    {!section.locked && (
                    <AddButton
                      label="Lägg till element"
                      indent={2}
                      onClick={() => onAddElement(sectionId, block.id)}
                      disabled={!canAddElement(section, block)}
                    />
                    )}
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
                        onToggleElementVisibility={onToggleElementVisibility}
                        onDeleteElement={onDeleteElement}
                        openDetail={openDetail}
                        locked={section.locked}
                      />
                    )}
                  </>
                )}
              </SortableTreeRow>
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
  onToggleElementVisibility,
  onDeleteElement,
  openDetail,
  locked,
  indent = 2,
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
  onToggleElementVisibility: (sectionId: string, blockId: string, elementId: string) => void;
  onDeleteElement: (sectionId: string, blockId: string, elementId: string) => void;
  openDetail: (target: { sectionId: string; blockId?: string; elementId?: string }) => void;
  locked?: boolean;
  /** Tree indent level for element rows. Default 2 (nested under block). */
  indent?: number;
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
              preview={getElementPreview(el)}
              isActive={el.isActive ?? true}
              indent={indent}
              onToggleVisibility={() =>
                onToggleElementVisibility(sectionId, blockId, el.id)
              }
              onDelete={locked ? undefined : () =>
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
                  preview={getElementPreview(el)}
                  isActive={el.isActive ?? true}
                  indent={indent}
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

// ─── Section tree icon map ──────────────────────────────────

const SECTION_TREE_ICONS: Record<string, string> = {
  "hero-fullscreen": "page_menu_ios",
  "hero-bottom-aligned": "page_menu_ios",
  "product-hero": "page_menu_ios",
  "product-hero-split": "page_menu_ios",
  "fullscreen-slideshow": "page_menu_ios",
  "slideshow-card": "page_menu_ios",
  "carousel": "transition_slide",
  "slider": "transition_slide",
  "text-blocks": "article",
  "accordion": "view_headline",
  "collection-grid": "table_rows",
  "collection-grid-v2": "table_rows",
  "tabs": "tab",
};

// ─── Sortable Section Row ───────────────────────────────────

function SortableSectionRow({
  section,
  onToggleVisibility,
  onDelete,
  onClick,
  collapsed,
  onToggleCollapse,
  inspectorHighlight,
  children,
}: {
  section: SectionInstance;
  onToggleVisibility: (id: string) => void;
  onDelete: (id: string) => void;
  onClick?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  inspectorHighlight?: boolean;
  children?: React.ReactNode;
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
        inspectorHighlight={inspectorHighlight}
      />
      {children}
    </div>
  );
}

// ─── Sortable Tree Row (for blocks & elements) ─────────────

function SortableTreeRow({
  id,
  icon,
  name,
  preview,
  isActive,
  indent,
  collapsed,
  noDragHandle,
  onToggleCollapse,
  onToggleVisibility,
  onDelete,
  onClick,
  children,
}: {
  id: string;
  icon: string;
  name: string;
  preview?: string | null;
  isActive: boolean;
  indent: number;
  collapsed?: boolean;
  noDragHandle?: boolean;
  onToggleCollapse?: () => void;
  onToggleVisibility?: () => void;
  onDelete?: () => void;
  onClick?: () => void;
  children?: React.ReactNode;
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
        preview={preview}
        isActive={isActive}
        indent={indent}
        collapsed={collapsed}
        noDragHandle={noDragHandle}
        onToggleCollapse={onToggleCollapse}
        onToggleVisibility={onToggleVisibility}
        onDelete={onDelete}
        onClick={onClick}
        dragHandleProps={noDragHandle ? undefined : { ...attributes, ...listeners }}
      />
      {children}
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
  inspectorHighlight,
}: {
  section: SectionInstance;
  onToggleVisibility: (id: string) => void;
  onDelete: (id: string) => void;
  onClick?: () => void;
  dragHandleProps?: Record<string, unknown>;
  isOverlay?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  inspectorHighlight?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);

  // Resolve section icon from definition
  const sectionIcon = (() => {
    // Standalone + loose: show the inner element's icon
    if (section.definitionId === STANDALONE_DEFINITION_ID || section.definitionId === "__loose-element") {
      const firstEl = (section.blocks ?? [])[0]?.slots?.content?.[0];
      if (firstEl) {
        const elDef = getElementDefinition(firstEl.type);
        return elDef?.icon || "widgets";
      }
      return "widgets";
    }
    if (section.definitionId === "bokningar") return "confirmation_number";
    // Per-section icon overrides
    const treeIcon = SECTION_TREE_ICONS[section.definitionId];
    if (treeIcon) return treeIcon;
    const def = getSectionDefinition(section.definitionId);
    const bt = def?.presets[0]?.blockTypes[0];
    return bt?.icon || "grid_view";
  })();

  // Resolve display name
  const sectionName = (() => {
    // Standalone + loose: show the inner element's name
    if (section.definitionId === STANDALONE_DEFINITION_ID || section.definitionId === "__loose-element") {
      const firstEl = (section.blocks ?? [])[0]?.slots?.content?.[0];
      return firstEl
        ? (getElementDefinition(firstEl.type)?.name ?? section.title ?? section.definitionId)
        : (section.title || section.definitionId);
    }
    return section.title || getSectionDefinition(section.definitionId)?.name || section.definitionId;
  })();

  return (
    <div
      className={`sp-row${!section.isActive ? " sp-row--inactive" : ""}${isOverlay ? " sp-row--overlay" : ""}${inspectorHighlight ? " sp-row--inspector-hover" : ""}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      {onToggleCollapse ? (
        <button
          type="button"
          className="sp-row__chevron"
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
          aria-label={collapsed ? "Expandera" : "Fäll ihop"}
        >
          <EditorIcon name={collapsed ? "chevron_right" : "expand_more"} size={16} />
        </button>
      ) : (
        <span className="sp-row__chevron" aria-hidden="true" style={{ visibility: "hidden" }}>
          <EditorIcon name="chevron_right" size={16} />
        </span>
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
        {section.isActive && isHovered && !isOverlay && !section.locked && (
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

// ─── Footer Section Tree (shared by app + classic layouts) ──

function FooterSectionTree({
  config,
  currentPageId,
  collapsedIds,
  toggleCollapse,
  openDetail,
  pushUndo,
  saveDraft,
}: {
  config: import("@/app/(guest)/_lib/tenant/types").TenantConfig;
  currentPageId: import("@/app/_lib/pages/types").PageId;
  collapsedIds: Set<string>;
  toggleCollapse: (id: string) => void;
  openDetail: (target: import("../EditorContext").DetailTarget) => void;
  pushUndo: (snapshot: Record<string, unknown>) => void;
  saveDraft: (changes: any) => any;
}) {
  const ftr = { ...PAGE_FOOTER_DEFAULTS, ...getPageFooter(config, currentPageId) };
  const isApp = ftr.footerLayout === "app";
  const footerOpen = !collapsedIds.has("__footer");
  const footerActive = ftr.isActive !== false;

  // Seed classicGroups on first render if missing
  const seededRef = useRef(false);
  const groups = ftr.classicGroups ?? buildDefaultClassicGroups();

  const saveFooter = useCallback((patch: Record<string, unknown>) => {
    pushUndo(getPageUndoSnapshot(config, currentPageId));
    saveDraft(buildFooterPatch(config, currentPageId, { ...ftr, ...patch }));
  }, [pushUndo, saveDraft, config, currentPageId, ftr]);

  useEffect(() => {
    if (!ftr.classicGroups && !seededRef.current) {
      seededRef.current = true;
      saveFooter({ classicGroups: groups });
    }
  }, [ftr.classicGroups, groups, saveFooter]);

  const footerBlockOpen = !collapsedIds.has("__footer_block");
  const menuEl = groups.top[0];

  return (
    <>
      <div className="sp-template-label">Sidfot</div>
      <div className="sp-list sp-list--header">
        <TreeRow
          icon="page_footer"
          name="Sidfot"
          isActive={footerActive}
          indent={0}
          noDragHandle
          collapsed={!footerOpen}
          onToggleCollapse={() => toggleCollapse("__footer")}
          onToggleVisibility={() => saveFooter({ isActive: !footerActive })}
          onClick={() => openDetail({ scope: "footer", sectionId: "__footer" })}
        />

        {footerOpen && isApp && menuEl && (
          <TreeRow
            icon={ELEMENT_ICON_NAMES[menuEl.type] ?? "widgets"}
            name={getElementName(menuEl.type)}
            isActive={menuEl.isActive !== false}
            indent={1}
            noDragHandle
            onToggleVisibility={() => {
              const updated = groups.top.map((el) =>
                el.id === menuEl.id ? { ...el, isActive: !(el.isActive !== false) } : el,
              );
              saveFooter({ classicGroups: { ...groups, top: updated } });
            }}
            onClick={() => openDetail({ scope: "footer-classic-element", sectionId: "__footer", blockId: "top", elementId: menuEl.id })}
          />
        )}

        {footerOpen && !isApp && (
          <FooterElementTree
            groups={groups}
            saveFooter={saveFooter}
            openDetail={openDetail}
          />
        )}
      </div>
    </>
  );
}

// ─── Footer Element Tree (flat, no groups) ──────────────────

function FooterElementTree({
  groups,
  saveFooter,
  openDetail,
}: {
  groups: { top: ElementInstance[]; bottom: ElementInstance[] };
  saveFooter: (patch: Record<string, unknown>) => void;
  openDetail: (target: import("../EditorContext").DetailTarget) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Merge top + bottom into a single flat list
  const allElements = [
    ...groups.top.map((el) => ({ ...el, _group: "top" as const })),
    ...groups.bottom.map((el) => ({ ...el, _group: "bottom" as const })),
  ].sort((a, b) => {
    // top group first, then bottom, preserving sortOrder within each
    if (a._group !== b._group) return a._group === "top" ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });

  const allIds = allElements.map((el) => el.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = allElements.findIndex((el) => el.id === active.id);
    const newIdx = allElements.findIndex((el) => el.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(allElements, oldIdx, newIdx);
    // Split back into top/bottom preserving new order
    const newTop: ElementInstance[] = [];
    const newBottom: ElementInstance[] = [];
    reordered.forEach((el, i) => {
      const clean = { ...el, sortOrder: i };
      delete (clean as any)._group;
      if (el._group === "top") newTop.push(clean);
      else newBottom.push(clean);
    });
    saveFooter({ classicGroups: { top: newTop, bottom: newBottom } });
  };

  const toggleVisibility = (elementId: string) => {
    const el = allElements.find((e) => e.id === elementId);
    if (!el) return;
    const groupKey = el._group;
    const updated = groups[groupKey].map((e) =>
      e.id === elementId ? { ...e, isActive: e.isActive === false } : e,
    );
    saveFooter({ classicGroups: { ...groups, [groupKey]: updated } });
  };

  const deleteElement = (elementId: string) => {
    const el = allElements.find((e) => e.id === elementId);
    if (!el) return;
    const groupKey = el._group;
    const updated = groups[groupKey].filter((e) => e.id !== elementId);
    saveFooter({ classicGroups: { ...groups, [groupKey]: updated } });
  };

  const addElement = (elementType: string) => {
    // Menu elements go to top group (rendered as accordion items)
    // Dividers go to bottom group (rendered as separators)
    const groupKey = elementType === "menu" ? "top" : "bottom";
    const current = groups[groupKey];
    const maxSort = current.reduce((max, el) => Math.max(max, el.sortOrder), -1);
    const newEl = createElementInstance(elementType as ElementType, {}, maxSort + 1);
    saveFooter({ classicGroups: { ...groups, [groupKey]: [...current, newEl] } });
    setPickerOpen(false);
    openDetail({ scope: "footer-classic-element", sectionId: "__footer", blockId: groupKey, elementId: newEl.id });
  };

  // Picker data — only menu and divider allowed in classic footer
  const footerSlotDef: SlotDefinition = {
    key: "__footer_slot",
    name: "Element",
    description: "",
    allowedElements: ["menu", "divider"] as ElementType[],
    minElements: 0,
    maxElements: -1,
    defaultElements: [],
  };
  const { items: pickerItems, categories: pickerCategories } = buildElementPickerData(footerSlotDef);

  return (
    <>
      <AddButton label="Lägg till" indent={1} onClick={() => setPickerOpen(true)} />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setActiveDragId(e.active.id as string)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDragId(null)}
      >
        <SortableContext items={allIds} strategy={verticalListSortingStrategy}>
          {allElements.map((el) => (
            <SortableTreeRow
              key={el.id}
              id={el.id}
              icon={ELEMENT_ICON_NAMES[el.type] ?? "widgets"}
              name={getElementName(el.type)}
              preview={getElementPreview(el)}
              isActive={el.isActive !== false}
              indent={1}
              onToggleVisibility={() => toggleVisibility(el.id)}
              onDelete={() => deleteElement(el.id)}
              onClick={() => openDetail({ scope: "footer-classic-element", sectionId: "__footer", blockId: el._group, elementId: el.id })}
            />
          ))}
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeDragId ? (() => {
            const el = allElements.find((e) => e.id === activeDragId);
            if (!el) return null;
            return <TreeRow icon={ELEMENT_ICON_NAMES[el.type] ?? "widgets"} name={getElementName(el.type)} isActive={true} indent={1} isOverlay noDragHandle />;
          })() : null}
        </DragOverlay>
      </DndContext>

      {pickerOpen && (
        <PickerModal
          title="Lägg till element"
          items={pickerItems}
          categories={pickerCategories}
          getPreview={getElementPickerPreview}
          onSelect={(id) => addElement(id)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}

// ─── Footer Classic Tree (legacy — kept for reference) ───────

function createElementId(): string {
  return `elm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createElementInstance(type: ElementType, settings: Record<string, unknown> = {}, sortOrder = 0): ElementInstance {
  const def = getElementDefinition(type);
  return {
    id: createElementId(),
    type,
    settings: { ...(def?.settingDefaults ?? {}), ...settings },
    action: { type: "none" as const },
    sortOrder,
    isActive: true,
  };
}

function buildDefaultClassicGroups(): {
  top: ElementInstance[];
  bottom: ElementInstance[];
} {
  return {
    top: [
      createElementInstance("menu" as ElementType, {}, 0),
    ],
    bottom: [
      createElementInstance("divider" as ElementType, {}, 0),
      createElementInstance("logo" as ElementType, {}, 1),
    ],
  };
}

function FooterClassicTree({
  ftr,
  groups,
  saveFooter,
  collapsedIds,
  toggleCollapse,
  openDetail,
}: {
  ftr: import("@/app/(guest)/_lib/tenant/types").PageFooterConfig;
  groups: { top: ElementInstance[]; bottom: ElementInstance[] };
  saveFooter: (patch: Record<string, unknown>) => void;
  collapsedIds: Set<string>;
  toggleCollapse: (id: string) => void;
  openDetail: (target: import("../EditorContext").DetailTarget) => void;
}) {
  const [pickerGroup, setPickerGroup] = useState<"top" | "bottom" | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const topElements = [...groups.top].sort((a, b) => a.sortOrder - b.sortOrder);
  const bottomElements = [...groups.bottom].sort((a, b) => a.sortOrder - b.sortOrder);
  const topIds = topElements.map((el) => el.id);
  const bottomIds = bottomElements.map((el) => el.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (groupKey: "top" | "bottom", event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const elements = groupKey === "top" ? topElements : bottomElements;
    const oldIdx = elements.findIndex((el) => el.id === active.id);
    const newIdx = elements.findIndex((el) => el.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(elements, oldIdx, newIdx).map((el, i) => ({ ...el, sortOrder: i }));
    saveFooter({ classicGroups: { ...groups, [groupKey]: reordered } });
  };

  const topOpen = !collapsedIds.has("__footer_classic_top");
  const bottomOpen = !collapsedIds.has("__footer_classic_bottom");

  const toggleElementVisibility = (groupKey: "top" | "bottom", elementId: string) => {
    const current = groups[groupKey];
    const updated = current.map((el) =>
      el.id === elementId ? { ...el, isActive: el.isActive === false ? true : false } : el,
    );
    saveFooter({ classicGroups: { ...groups, [groupKey]: updated } });
  };

  const deleteElement = (groupKey: "top" | "bottom", elementId: string) => {
    const updated = groups[groupKey].filter((el) => el.id !== elementId);
    saveFooter({ classicGroups: { ...groups, [groupKey]: updated } });
  };

  const addElement = (groupKey: "top" | "bottom", elementType: string) => {
    const current = groups[groupKey];
    const maxSort = current.reduce((max, el) => Math.max(max, el.sortOrder), -1);
    const newEl = createElementInstance(elementType as ElementType, {}, maxSort + 1);
    saveFooter({ classicGroups: { ...groups, [groupKey]: [...current, newEl] } });
    setPickerGroup(null);
    // Open the new element's panel
    openDetail({ scope: "footer-classic-element", sectionId: "__footer", blockId: groupKey, elementId: newEl.id });
  };

  // Build picker data — use the same buildElementPickerData as regular sections
  const allElementTypes = getAllElementDefinitions().map((d) => d.type);
  const footerSlotDef: SlotDefinition = {
    key: "__footer_slot",
    name: "Element",
    description: "",
    allowedElements: allElementTypes,
    minElements: 0,
    maxElements: -1,
    defaultElements: [],
  };
  const { items: pickerItems, categories: pickerCategories } = buildElementPickerData(footerSlotDef);

  return (
    <>
      {/* Top group */}
      <TreeRow
        icon="folder"
        name="Grupp"
        isActive={true}
        indent={1}
        noDragHandle
        collapsed={!topOpen}
        onToggleCollapse={() => toggleCollapse("__footer_classic_top")}
        onToggleVisibility={() => {}}
        onClick={() => openDetail({ scope: "footer-classic-block", sectionId: "__footer", blockId: "top" })}
      />
      {topOpen && (
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(e) => setActiveDragId(e.active.id as string)}
            onDragEnd={(e) => handleDragEnd("top", e)}
            onDragCancel={() => setActiveDragId(null)}
          >
            <SortableContext items={topIds} strategy={verticalListSortingStrategy}>
              {topElements.map((el) => (
                <SortableTreeRow
                  key={el.id}
                  id={el.id}
                  icon={ELEMENT_ICON_NAMES[el.type] ?? "widgets"}
                  name={getElementName(el.type)}
                  preview={getElementPreview(el)}
                  isActive={el.isActive !== false}
                  indent={2}
                  onToggleVisibility={() => toggleElementVisibility("top", el.id)}
                  onDelete={() => deleteElement("top", el.id)}
                  onClick={() => openDetail({ scope: "footer-classic-element", sectionId: "__footer", blockId: "top", elementId: el.id })}
                />
              ))}
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {activeDragId && topElements.find((el) => el.id === activeDragId) ? (() => {
                const el = topElements.find((e) => e.id === activeDragId)!;
                return <TreeRow icon={ELEMENT_ICON_NAMES[el.type] ?? "widgets"} name={getElementName(el.type)} isActive={true} indent={2} isOverlay noDragHandle />;
              })() : null}
            </DragOverlay>
          </DndContext>
          <AddButton label="Lägg till element" indent={2} onClick={() => setPickerGroup("top")} />
        </>
      )}

      {/* Bottom group */}
      <TreeRow
        icon="folder"
        name="Grupp"
        isActive={true}
        indent={1}
        noDragHandle
        collapsed={!bottomOpen}
        onToggleCollapse={() => toggleCollapse("__footer_classic_bottom")}
        onToggleVisibility={() => {}}
        onClick={() => openDetail({ scope: "footer-classic-block", sectionId: "__footer", blockId: "bottom" })}
      />
      {bottomOpen && (
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(e) => setActiveDragId(e.active.id as string)}
            onDragEnd={(e) => handleDragEnd("bottom", e)}
            onDragCancel={() => setActiveDragId(null)}
          >
            <SortableContext items={bottomIds} strategy={verticalListSortingStrategy}>
              {bottomElements.map((el) => (
                <SortableTreeRow
                  key={el.id}
                  id={el.id}
                  icon={ELEMENT_ICON_NAMES[el.type] ?? "widgets"}
                  name={getElementName(el.type)}
                  isActive={el.isActive !== false}
                  indent={2}
                  onToggleVisibility={() => toggleElementVisibility("bottom", el.id)}
                  onDelete={() => deleteElement("bottom", el.id)}
                  onClick={() => openDetail({ scope: "footer-classic-element", sectionId: "__footer", blockId: "bottom", elementId: el.id })}
                />
              ))}
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {activeDragId && bottomElements.find((el) => el.id === activeDragId) ? (() => {
                const el = bottomElements.find((e) => e.id === activeDragId)!;
                return <TreeRow icon={ELEMENT_ICON_NAMES[el.type] ?? "widgets"} name={getElementName(el.type)} isActive={true} indent={2} isOverlay noDragHandle />;
              })() : null}
            </DragOverlay>
          </DndContext>
          <AddButton label="Lägg till element" indent={2} onClick={() => setPickerGroup("bottom")} />
        </>
      )}

      {/* Element picker modal */}
      {pickerGroup && (
        <PickerModal
          title="Lägg till element"
          items={pickerItems}
          categories={pickerCategories}
          getPreview={getElementPickerPreview}
          onSelect={(id) => addElement(pickerGroup, id)}
          onClose={() => setPickerGroup(null)}
        />
      )}
    </>
  );
}

// ─── Shared helpers ──────────────────────────────────────────

function getElementName(type: string): string {
  const def = getElementDefinition(type as import("@/app/_lib/sections/types").ElementType);
  return def?.name || type;
}

const TEXT_CONTENT_KEYS: Record<string, string[]> = {
  heading: ["content"],
  text: ["content"],
  richtext: ["heading_content", "text_content"],
  collapsible: ["content"],
};

/** Strip HTML tags and collapse whitespace. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Extract a content preview string for text-based elements.
 * Returns null for non-text elements or elements with no content yet.
 */
function getElementPreview(el: import("@/app/_lib/sections/types").ElementInstance): string | null {
  const keys = TEXT_CONTENT_KEYS[el.type];
  if (!keys) return null;

  for (const key of keys) {
    const raw = el.settings[key];
    if (typeof raw !== "string" || !raw.trim()) continue;
    const plain = stripHtml(raw);
    if (!plain) continue;
    return plain;
  }

  return null;
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
  menu: "link",
  logo: "image",
  video: "youtube_activity",
  gallery: "gallery_thumbnail",
};

// ─── Tree Row (unified row for blocks & elements) ───────────

const TreeRow = React.memo(function TreeRow({
  icon,
  name,
  preview,
  isActive,
  indent,
  collapsed,
  noDragHandle,
  onToggleCollapse,
  onToggleVisibility,
  onDelete,
  onClick,
  dragHandleProps,
  isOverlay,
}: {
  icon: string;
  name: string;
  /** Optional content preview shown after the name (for text elements). */
  preview?: string | null;
  isActive: boolean;
  indent: number;
  collapsed?: boolean;
  noDragHandle?: boolean;
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
      {noDragHandle ? (
        <div className="sp-row__handle">
          <EditorIcon name={icon} size={16} />
        </div>
      ) : (
        <div
          className="sp-row__handle"
          {...(dragHandleProps ?? {})}
          title="Dra för att sortera"
        >
          {isHovered && !isOverlay ? <DragIcon /> : <EditorIcon name={icon} size={16} />}
        </div>
      )}
      <span className="sp-row__name">
        {name}
        {preview && <span className="sp-row__preview"> - {preview}</span>}
      </span>
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
      <EditorIcon name="add_circle" size={14} />
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
