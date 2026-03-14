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
};

export type PickerCategory = {
  key: string;
  label: string;
  icon?: React.ReactNode;
};

export type PresetOption = {
  key: string;
  name: string;
  description: string;
  thumbnail?: string;
};

type PickerModalProps = {
  title: string;
  searchPlaceholder?: string;
  items: PickerItem[];
  categories: PickerCategory[];
  getPresets?: (itemId: string) => PresetOption[];
  presetLabel?: string;
  onSelect: (itemId: string, presetKey?: string) => void;
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
  getPresets,
  presetLabel = "Sektions",
  onSelect,
  onClose,
}: PickerModalProps) {
  const [search, setSearch] = useState("");
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
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

  // ── Filter items by search ──
  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase().trim();
    const words = q.split(/\s+/);
    return items.filter((item) => {
      const haystack = [
        item.name.toLowerCase(),
        item.description.toLowerCase(),
        ...item.tags.map((t) => t.toLowerCase()),
      ].join(" ");
      return words.every((word) => haystack.includes(word));
    });
  }, [items, search]);

  // ── Group filtered items by category ──
  const groupedByCategory = useMemo(() => {
    const groups: { category: PickerCategory; items: PickerItem[] }[] = [];
    for (const cat of categories) {
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
  }, [filtered, categories]);

  // ── Hover with delay to allow mouse travel to preset panel ──
  const handleItemEnter = useCallback((id: string) => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setActiveItemId(id);
  }, []);

  const handleItemLeave = useCallback(() => {
    leaveTimerRef.current = setTimeout(() => setActiveItemId(null), 150);
  }, []);

  const handlePresetPanelEnter = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const handlePresetPanelLeave = useCallback(() => {
    leaveTimerRef.current = setTimeout(() => setActiveItemId(null), 150);
  }, []);

  // Clean up timer
  useEffect(() => {
    return () => { if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current); };
  }, []);

  // ── Presets for active item ──
  const activePresets: PresetOption[] = useMemo(() => {
    if (!activeItemId || !getPresets) return [];
    return getPresets(activeItemId);
  }, [activeItemId, getPresets]);

  // ── Handle item click ──
  const handleItemClick = useCallback(
    (itemId: string) => {
      if (getPresets) {
        const presets = getPresets(itemId);
        if (presets.length === 0) {
          onSelect(itemId);
          onClose();
          return;
        }
        // If item has presets, click selects with default preset
        onSelect(itemId, presets[0].key);
        onClose();
      } else {
        onSelect(itemId);
        onClose();
      }
    },
    [getPresets, onSelect, onClose]
  );

  // ── Handle preset click ──
  const handlePresetClick = useCallback(
    (presetKey: string) => {
      if (!activeItemId) return;
      onSelect(activeItemId, presetKey);
      onClose();
    },
    [activeItemId, onSelect, onClose]
  );

  const showPresets = activePresets.length > 0;

  return createPortal(
    <div
      className={`pk-popup${showPresets ? " pk-popup--with-presets" : ""}`}
      ref={popupRef}
    >
      {/* Main panel */}
      <div className={`pk-popup__main${showPresets ? " pk-popup__main--shifted" : ""}`}>
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
                hasPresets={getPresets}
              />
            ))
          )}
        </div>
      </div>

      {/* Preset panel (inline, no transition) */}
      {showPresets && (
        <div
          className="pk-popup__presets"
          onMouseEnter={handlePresetPanelEnter}
          onMouseLeave={handlePresetPanelLeave}
        >
          <div className="pk-popup__presets-header">
            <span className="pk-popup__presets-title">{presetLabel}-preset</span>
          </div>
          <div className="pk-popup__presets-list">
            {activePresets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                className="pk-popup__preset"
                onClick={() => handlePresetClick(preset.key)}
              >
                {preset.thumbnail ? (
                  <img
                    src={preset.thumbnail}
                    alt={preset.name}
                    className="pk-popup__preset-img"
                    draggable={false}
                  />
                ) : (
                  <div className="pk-popup__preset-empty">
                    <span>{preset.name}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
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
  hasPresets,
}: {
  category: PickerCategory;
  items: PickerItem[];
  activeItemId: string | null;
  onEnter: (id: string) => void;
  onLeave: () => void;
  onClick: (id: string) => void;
  hasPresets?: (id: string) => PresetOption[];
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
            const showChevron = hasPresets ? hasPresets(item.id).length > 0 : false;
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
                {showChevron && (
                  <EditorIcon name="chevron_right" size={14} className="pk-item__chevron" />
                )}
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

export function buildSectionPickerData(): {
  items: PickerItem[];
  categories: PickerCategory[];
} {
  // Locked sections are auto-seeded by the platform — exclude from the picker
  const defs = getAllSectionDefinitions().filter(
    (d) => d.scope !== "locked",
  );

  const items: PickerItem[] = defs.map((def) => ({
    id: def.id,
    name: def.name,
    description: def.description,
    category: def.category,
    tags: def.tags,
    icon: <SectionTypeIcon category={def.category} />,
  }));

  const categories: PickerCategory[] = [
    { key: "hero", label: "Hero" },
    { key: "navigation", label: "Navigation" },
    { key: "content", label: "Innehåll" },
    { key: "media", label: "Media" },
    { key: "utility", label: "Verktyg" },
  ];

  return { items, categories };
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
    if (el.pageScope && el.pageScope !== context?.pageId) return false;
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
    video: "youtube_activity",
    gallery: "gallery_thumbnail",
  };
  const name = iconMap[elementType];
  if (name) return <EditorIcon name={name} size={18} />;
  return <EditorIcon name="widgets" size={18} />;
}
