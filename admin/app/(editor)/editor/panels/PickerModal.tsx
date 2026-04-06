"use client";

/**
 * Picker Popup — Sidebar-anchored Section/Element Picker
 * ═══════════════════════════════════════════════════════
 *
 * Positioned next to the editor sidebar (not centered overlay).
 * Categories as accordions, items as sp-row-styled rows.
 * Preset panel appears on hover (no transition), click places item.
 *
 * Layout:
 *   ┌─────────────────────┬──────────────────┐
 *   │  Search              │                  │
 *   │  ▸ Kategori 1       │  Preset panel    │
 *   │    ☐ Item A         │  (on hover)      │
 *   │    ☐ Item B         │                  │
 *   │  ▸ Kategori 2       │                  │
 *   └─────────────────────┴──────────────────┘
 */

/** Check if a pageScope (single value or array) includes the given pageId. */
function matchesPageScope(
  scope: string | string[],
  pageId: string | undefined,
): boolean {
  if (!pageId) return false;
  return Array.isArray(scope) ? scope.includes(pageId) : scope === pageId;
}

import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import type {
  SectionDefinition,
  SectionInstance,
  SectionPreset,
  BlockTypeDefinition,
  BlockInstance,
  SlotDefinition,
  ElementType,
  ElementDefinition,
  ElementInstance,
  ElementAction,
} from "@/app/_lib/sections/types";
import {
  createSectionId,
  createBlockId,
  createElementId,
  NO_ACTION,
} from "@/app/_lib/sections/types";
import {
  getAllSectionDefinitions,
  getSectionDefinition,
  getAllElementDefinitions,
  getElementDefinition,
} from "@/app/_lib/sections/registry";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { SegmentedControl } from "../fields/FieldSegmented";

// ═══════════════════════════════════════════════════════════════
// PUBLIC TYPES
// ═══════════════════════════════════════════════════════════════

export type PickerItem = {
  id: string;
  name: string;
  description: string;
  category: string;
  categories?: string[];
  tags: string[];
  icon?: React.ReactNode;
  /** Tab this item belongs to (used with tabs prop on PickerModal) */
  tab?: string;
  /** Preview image shown on hover in the preview panel */
  thumbnail?: string;
};

export type PickerCategory = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  /** Tab this category belongs to (used with tabs prop on PickerModal) */
  tab?: string;
};

export type PresetOption = {
  key: string;
  name: string;
  description: string;
  thumbnail?: string;
};

export type PickerTab = {
  key: string;
  label: string;
};

type PickerModalProps = {
  title: string;
  searchPlaceholder?: string;
  items: PickerItem[];
  categories: PickerCategory[];
  tabs?: PickerTab[];
  defaultTab?: string;
  /** Returns a preview thumbnail URL for the hovered item */
  getPreview?: (itemId: string) => string | undefined;
  onSelect: (itemId: string) => void;
  onClose: () => void;
};

// ═══════════════════════════════════════════════════════════════
// PICKER POPUP COMPONENT
// ═══════════════════════════════════════════════════════════════

export function PickerModal({
  title,
  searchPlaceholder = "Sök...",
  items,
  categories,
  tabs,
  defaultTab,
  getPreview,
  onSelect,
  onClose,
}: PickerModalProps) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs?.[0]?.key ?? "");
  // Always show a preview — start with first visible item, never clear to null
  const [activeItemId, setActiveItemId] = useState<string | null>(() => items[0]?.id ?? null);
  const lastActiveRef = useRef<string | null>(activeItemId);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // No auto-focus — let user click into search when needed

  // Close on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [onClose]);

  // ── Filter items by tab + search ──
  const filtered = useMemo(() => {
    let result = items;
    // Tab filter — only when tabs are provided and items have tab field
    if (tabs && tabs.length > 0 && activeTab) {
      result = result.filter((item) => item.tab === activeTab);
    }
    if (!search.trim()) return result;
    const q = search.toLowerCase().trim();
    const words = q.split(/\s+/);
    return result.filter((item) => {
      const haystack = [
        item.name.toLowerCase(),
        item.description.toLowerCase(),
        ...item.tags.map((t) => t.toLowerCase()),
      ].join(" ");
      return words.every((word) => haystack.includes(word));
    });
  }, [items, search, tabs, activeTab]);

  // ── Group filtered items by category ──
  const groupedByCategory = useMemo(() => {
    // When tabs are active, only show categories that belong to the active tab
    const activeCats = tabs && tabs.length > 0
      ? categories.filter((cat) => !cat.tab || cat.tab === activeTab)
      : categories;

    const groups: { category: PickerCategory; items: PickerItem[] }[] = [];
    for (const cat of activeCats) {
      const catItems = filtered.filter(
        (item) => item.category === cat.key || item.categories?.includes(cat.key)
      );
      if (catItems.length > 0) {
        groups.push({ category: cat, items: catItems });
      }
    }
    // "Övrigt" for items not matching any category
    const categorized = new Set(groups.flatMap((g) => g.items.map((i) => i.id)));
    const uncategorized = filtered.filter((i) => !categorized.has(i.id));
    if (uncategorized.length > 0) {
      groups.push({ category: { key: "__other", label: "Övrigt" }, items: uncategorized });
    }
    return groups;
  }, [filtered, categories, tabs, activeTab]);

  // ── Hover — preview sticks on last hovered item, never clears ──
  const handleItemEnter = useCallback((id: string) => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    lastActiveRef.current = id;
    setActiveItemId(id);
  }, []);

  const handleItemLeave = useCallback(() => {
    // Keep showing the last hovered item — no clearing
  }, []);

  const handlePresetPanelEnter = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const handlePresetPanelLeave = useCallback(() => {
    // Keep showing the last hovered item — no clearing
  }, []);

  // Clean up timer
  useEffect(() => {
    return () => { if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current); };
  }, []);

  // ── Preview thumbnail for hovered item ──
  const previewThumbnail = useMemo(() => {
    if (!activeItemId) return undefined;
    // Item-level thumbnail takes priority, then getPreview callback
    const item = items.find((i) => i.id === activeItemId);
    if (item?.thumbnail) return item.thumbnail;
    if (getPreview) return getPreview(activeItemId);
    return undefined;
  }, [activeItemId, items, getPreview]);

  // ── Handle item click — always adds directly ──
  const handleItemClick = useCallback(
    (itemId: string) => {
      onSelect(itemId);
      onClose();
    },
    [onSelect, onClose]
  );

  // Active item for preview header
  const activeItem = useMemo(() => {
    if (!activeItemId) return null;
    return items.find((i) => i.id === activeItemId) ?? null;
  }, [activeItemId, items]);

  const activeItemName = activeItem?.name ?? null;

  return createPortal(
    <div
      className="pk-popup pk-popup--with-presets"
      ref={popupRef}
    >
      {/* Main panel */}
      <div className="pk-popup__main pk-popup__main--shifted">
        {/* Search */}
        <div className="pk-popup__search">
          <SearchIcon />
          <input
            ref={searchRef}
            type="text"
            className="pk-popup__search-input"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
          {search && (
            <button
              type="button"
              className="pk-popup__search-clear"
              onClick={() => setSearch("")}
              aria-label="Rensa"
            >
              <EditorIcon name="close" size={14} />
            </button>
          )}
        </div>

        {/* Tab switcher */}
        {tabs && tabs.length > 0 && (
          <div className="pk-popup__tabs">
            <SegmentedControl
              options={tabs.map((t) => ({ value: t.key, label: t.label }))}
              value={activeTab}
              onChange={(v) => {
                setActiveTab(v);
                const firstInTab = items.find((i) => i.tab === v);
                const next = firstInTab?.id ?? null;
                lastActiveRef.current = next;
                setActiveItemId(next);
              }}
            />
          </div>
        )}

        {/* Category accordions */}
        <div className="pk-popup__body">
          {groupedByCategory.length === 0 ? (
            <div className="pk-popup__empty">Inga resultat</div>
          ) : (
            groupedByCategory.map((group) => (
              <CategoryAccordion
                key={group.category.key}
                category={group.category}
                items={group.items}
                activeItemId={activeItemId}
                onEnter={handleItemEnter}
                onLeave={handleItemLeave}
                onClick={handleItemClick}
              />
            ))
          )}
        </div>
      </div>

      {/* Preview panel — always visible */}
      <div
        className="pk-popup__presets"
        onMouseEnter={handlePresetPanelEnter}
        onMouseLeave={handlePresetPanelLeave}
      >
        <div className="pk-popup__preview-wrap">
          {previewThumbnail ? (
            <div className="pk-popup__preview-card">
              <img
                src={previewThumbnail}
                alt={activeItemName ?? "Förhandsvisning"}
                className="pk-popup__preview-img"
                draggable={false}
              />
            </div>
          ) : (
            <div className="pk-popup__preview-empty">
              <EditorIcon name="dashboard" size={32} className="pk-popup__preview-empty-icon" />
              <span className="pk-popup__preview-empty-text">Ingen förhandsgranskning tillgänglig</span>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Category Accordion ──────────────────────────────────────

function CategoryAccordion({
  category,
  items,
  activeItemId,
  onEnter,
  onLeave,
  onClick,
}: {
  category: PickerCategory;
  items: PickerItem[];
  activeItemId: string | null;
  onEnter: (id: string) => void;
  onLeave: () => void;
  onClick: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="pk-accordion">
      <button
        type="button"
        className="pk-accordion__trigger"
        onClick={() => setOpen(!open)}
      >
        <span className="pk-accordion__label">{category.label}</span>
        <EditorIcon
          name={open ? "expand_more" : "chevron_right"}
          size={16}
          className="pk-accordion__chevron"
        />
      </button>
      {open && (
        <div className="pk-accordion__content">
          {items.map((item) => {
            const isActive = item.id === activeItemId;
            return (
              <button
                key={item.id}
                type="button"
                className={`pk-item${isActive ? " pk-item--hover" : ""}`}
                onClick={() => onClick(item.id)}
                onMouseEnter={() => onEnter(item.id)}
                onMouseLeave={onLeave}
              >
                <span className="pk-item__icon">
                  {item.icon ?? <EditorIcon name="widgets" size={16} />}
                </span>
                <span className="pk-item__name">{item.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DATA FACTORIES (unchanged)
// ═══════════════════════════════════════════════════════════════

/**
 * Standalone element ID prefix in the picker.
 * Items with this prefix create standalone sections instead of real sections.
 */
export const STANDALONE_PICKER_PREFIX = "element:";

/** Tabs for section/element picker */
export const SECTION_PICKER_TABS: PickerTab[] = [
  { key: "sections", label: "Sektioner" },
  { key: "elements", label: "Element" },
];

export function buildSectionPickerData(context?: { pageId?: string }): {
  items: PickerItem[];
  categories: PickerCategory[];
} {
  // Locked sections are auto-seeded by the platform — exclude from the picker
  // pageScope sections only appear on their designated page
  const defs = getAllSectionDefinitions().filter(
    (d) => {
      if (d.scope === "locked") return false;
      if (d.pageScope && !matchesPageScope(d.pageScope, context?.pageId)) return false;
      return true;
    },
  );

  const sectionItems: PickerItem[] = defs.map((def) => ({
    id: def.id,
    name: def.name,
    description: def.description,
    category: def.category,
    tags: def.tags,
    icon: getSectionIcon(def.id, def.category),
    tab: "sections",
  }));

  // Standalone elements — first-class items in the picker.
  // Each element type gets its own entry, categorized by ELEMENT_CATEGORY_MAP.
  // pageScope elements only appear on their designated page.
  const elementDefs = getAllElementDefinitions().filter(
    (d) => !d.pageScope || matchesPageScope(d.pageScope, context?.pageId),
  );
  const standaloneItems: PickerItem[] = elementDefs.map((def) => {
    const catInfo = ELEMENT_CATEGORY_MAP[def.type] ?? { primary: "el-other" };
    return {
      id: `${STANDALONE_PICKER_PREFIX}${def.type}`,
      name: def.name,
      description: def.description ?? "",
      category: `el-${catInfo.primary}`,
      categories: catInfo.extra?.map((e) => `el-${e}`),
      tags: [def.type],
      icon: <EditorIcon name={def.icon || "widgets"} size={16} />,
      tab: "elements",
    };
  });

  const categories: PickerCategory[] = [
    // Section categories
    { key: "hero", label: "Hjälte & Bildspel", tab: "sections" },
    { key: "gallery", label: "Galleri", tab: "sections" },
    { key: "content", label: "Innehåll", tab: "sections" },
    { key: "navigation", label: "Navigation", tab: "sections" },
    // Element categories
    { key: "el-text", label: "Text", tab: "elements" },
    { key: "el-media", label: "Media", tab: "elements" },
    { key: "el-interaktion", label: "Interaktion", tab: "elements" },
    { key: "el-layout", label: "Layout", tab: "elements" },
  ];

  return { items: [...sectionItems, ...standaloneItems], categories };
}

export function getSectionPresets(definitionId: string): PresetOption[] {
  const def = getSectionDefinition(definitionId);
  if (!def) return [];
  return def.presets.map((p) => ({
    key: p.key,
    name: p.name,
    description: p.description,
    thumbnail: p.thumbnail || undefined,
  }));
}

export function getElementPresets(elementType: string): PresetOption[] {
  const def = getElementDefinition(elementType as ElementType);
  if (!def) return [];
  if (def.skipPresetPicker) return [];
  return def.presets.map((p) => ({
    key: p.key,
    name: p.name,
    description: p.description,
    thumbnail: p.thumbnail || undefined,
  }));
}

export function buildBlockPickerData(preset: SectionPreset): {
  items: PickerItem[];
  categories: PickerCategory[];
} {
  const items: PickerItem[] = preset.blockTypes.map((bt) => ({
    id: bt.type,
    name: bt.name,
    description: bt.description,
    category: "block",
    tags: [bt.type],
  }));
  return { items, categories: [] };
}

const ELEMENT_CATEGORY_MAP: Record<string, { primary: string; extra?: string[] }> = {
  heading:     { primary: "text" },
  text:        { primary: "text" },
  richtext:    { primary: "text" },
  collapsible: { primary: "text" },
  image:       { primary: "media" },
  video:       { primary: "media" },
  gallery:     { primary: "media" },
  map:         { primary: "media", extra: ["interaktion"] },
  button:      { primary: "interaktion" },
  menu:        { primary: "interaktion" },
  logo:        { primary: "media" },
  icon:        { primary: "interaktion" },
  divider:     { primary: "layout" },
};

export function buildElementPickerData(
  slotDef: SlotDefinition,
  context?: { pageId?: string; sectionDefinitionId?: string },
): {
  items: PickerItem[];
  categories: PickerCategory[];
} {
  const allElements = getAllElementDefinitions();
  const allowed = new Set<string>(slotDef.allowedElements);
  const validElements = allElements.filter((el) => {
    if (!allowed.has(el.type)) return false;
    if (el.pageScope && !matchesPageScope(el.pageScope, context?.pageId)) return false;
    if (el.sectionScope && el.sectionScope !== context?.sectionDefinitionId) return false;
    return true;
  });

  const items: PickerItem[] = validElements.map((el) => {
    const catInfo = ELEMENT_CATEGORY_MAP[el.type] ?? { primary: "text" };
    return {
      id: el.type,
      name: el.name,
      description: el.description,
      category: catInfo.primary,
      categories: catInfo.extra,
      tags: [el.type, el.icon],
      icon: <ElementTypeIcon elementType={el.type} />,
    };
  });

  const categories: PickerCategory[] = [
    { key: "text", label: "Text" },
    { key: "media", label: "Media" },
    { key: "interaktion", label: "Interaktion" },
    { key: "layout", label: "Layout" },
  ];

  return { items, categories };
}

// ═══════════════════════════════════════════════════════════════
// INSTANCE CREATION (unchanged)
// ═══════════════════════════════════════════════════════════════

export function createSectionFromPicker(
  definitionId: string,
  presetKey?: string,
  defaultColorSchemeId?: string,
): SectionInstance | null {
  const def = getSectionDefinition(definitionId);
  if (!def) return null;

  const defaults = def.createDefault();
  const chosenPresetKey = presetKey ?? defaults.presetKey;
  const preset =
    def.presets.find((p) => p.key === chosenPresetKey) ?? def.presets[0];

  const blocks = hydrateBlocks(preset.createDefaultBlocks());

  return {
    id: createSectionId(),
    ...defaults,
    presetKey: preset.key,
    presetVersion: preset.version,
    sortOrder: 0,
    blocks,
    ...(defaultColorSchemeId ? { colorSchemeId: defaultColorSchemeId } : {}),
  };
}

export function createBlockFromPicker(blockTypeDef: BlockTypeDefinition): BlockInstance {
  const slots: Record<string, ElementInstance[]> = {};
  for (const slotDef of blockTypeDef.slots) {
    slots[slotDef.key] = slotDef.defaultElements.map((partial, i) => ({
      ...partial,
      id: createElementId(),
      sortOrder: i,
    }));
  }
  return {
    id: createBlockId(),
    type: blockTypeDef.type,
    settings: { ...blockTypeDef.settingDefaults },
    slots,
    sortOrder: 0,
    isActive: true,
  };
}

export function createElementFromPicker(
  elementType: ElementType,
  presetKey?: string
): ElementInstance | null {
  const def = getElementDefinition(elementType);
  if (!def) return null;

  let settings = { ...def.settingDefaults };
  if (presetKey) {
    const preset = def.presets.find((p) => p.key === presetKey);
    if (preset) {
      settings = { ...settings, ...preset.settingOverrides };
    }
  }

  return {
    id: createElementId(),
    type: elementType,
    settings,
    action: NO_ACTION,
    sortOrder: 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════

function hydrateBlocks(templates: Omit<BlockInstance, "id">[]): BlockInstance[] {
  return templates.map((template, blockIndex) => {
    const hydratedSlots: Record<string, ElementInstance[]> = {};
    for (const [slotKey, elements] of Object.entries(template.slots)) {
      hydratedSlots[slotKey] = (elements as ElementInstance[]).map(
        (el, elIndex) => ({
          ...el,
          id: createElementId(),
          sortOrder: elIndex,
        })
      );
    }
    return {
      ...template,
      id: createBlockId(),
      sortOrder: blockIndex,
      slots: hydratedSlots,
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════

function SearchIcon() {
  return (
    <svg className="pk-popup__search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M11.5 11.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// ─── Per-section icon resolution ────────────────────────────

const SECTION_ICON_MAP: Record<string, React.ReactNode> = {};

function HeroIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M1.5 3.25c0-.966.784-1.75 1.75-1.75h1a.75.75 0 0 1 0 1.5h-1a.25.25 0 0 0-.25.25v1a.75.75 0 0 1-1.5 0z" />
      <path fillRule="evenodd" d="M1.5 7.25c0-.966.784-1.75 1.75-1.75h9.5c.966 0 1.75.784 1.75 1.75v1.5a1.75 1.75 0 0 1-1.75 1.75h-9.5a1.75 1.75 0 0 1-1.75-1.75zm1.75-.25a.25.25 0 0 0-.25.25v1.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25v-1.5a.25.25 0 0 0-.25-.25z" />
      <path d="M1.5 12.75c0 .966.784 1.75 1.75 1.75h1a.75.75 0 0 0 0-1.5h-1a.25.25 0 0 1-.25-.25v-1a.75.75 0 0 0-1.5 0z" />
      <path d="M12.75 1.5c.966 0 1.75.784 1.75 1.75v1a.75.75 0 0 1-1.5 0v-1a.25.25 0 0 0-.25-.25h-1a.75.75 0 0 1 0-1.5z" />
      <path d="M12.75 14.5a1.75 1.75 0 0 0 1.75-1.75v-1a.75.75 0 0 0-1.5 0v1a.25.25 0 0 1-.25.25h-1a.75.75 0 0 0 0 1.5z" />
      <path d="M9.75 2.25a.75.75 0 0 1-.75.75h-2a.75.75 0 0 1 0-1.5h2a.75.75 0 0 1 .75.75" />
      <path d="M9 14.5a.75.75 0 0 0 0-1.5h-2a.75.75 0 0 0 0 1.5z" />
    </svg>
  );
}

function getSectionIcon(sectionId: string, category: string): React.ReactNode {
  // Per-section overrides
  switch (sectionId) {
    // Hero & Bildspel — custom SVG
    case "hero-fullscreen":
    case "hero-bottom-aligned":
    case "product-hero":
    case "product-hero-split":
    case "fullscreen-slideshow":
    case "slideshow-card":
      return <EditorIcon name="page_menu_ios" size={18} />;
    // Karusell & Snabblänkar — Material Symbol
    case "carousel":
    case "slider":
      return <EditorIcon name="transition_slide" size={18} />;
    // Textblock
    case "text-blocks":
      return <EditorIcon name="article" size={18} />;
    // Dragspel
    case "accordion":
      return <EditorIcon name="view_headline" size={18} />;
    // Rutnät
    case "collection-grid":
    case "collection-grid-v2":
      return <EditorIcon name="table_rows" size={18} />;
    // Flikar
    case "tabs":
      return <EditorIcon name="tab" size={18} />;
  }
  // Fallback to category icon
  return <SectionTypeIcon category={category} />;
}

function SectionTypeIcon({ category }: { category: string }) {
  switch (category) {
    case "hero":
      return (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5 8h8M5 11h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "navigation":
      return (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="2" y="6" width="14" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5 9h2M8 9h2M11 9h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "content":
      return (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M3 5h12M3 9h8M3 13h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "media":
      return (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="6.5" cy="7" r="1.5" stroke="currentColor" strokeWidth="1" />
          <path d="M2 12l4-3 3 2 3-2 4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return <EditorIcon name="widgets" size={18} />;
  }
}

function ElementTypeIcon({ elementType }: { elementType: string }) {
  const iconMap: Record<string, string> = {
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
  const name = iconMap[elementType];
  if (name) return <EditorIcon name={name} size={18} />;
  return <EditorIcon name="widgets" size={18} />;
}
