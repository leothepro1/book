"use client";

/**
 * Picker Modal — Enterprise-grade Section/Block/Element Picker
 * ═════════════════════════════════════════════════════════════
 *
 * TWO-STEP FLOW:
 *   1. Pick an item (section/block/element)
 *   2. Pick a preset for that item
 *
 * When an item is clicked, the modal slides left and a preset panel
 * expands to the right — one seamless surface. The preset panel shows
 * available presets with skeleton shimmer loading effect. Only after
 * choosing a preset is the item actually created.
 *
 * Layout states:
 *
 *   STATE 1 — Item picker only:
 *   ┌──────────────────┐
 *   │    pk-modal       │  ← centered
 *   └──────────────────┘
 *
 *   STATE 2 — Item + Preset panel:
 *   ┌──────────────────┬────────────────┐
 *   │    pk-modal       │  pk-presets    │  ← slides left, panel expands right
 *   │                  │  Underline  ▸  │
 *   │                  │  Pill       ▸  │
 *   └──────────────────┴────────────────┘
 *
 * The pk-stage wrapper is centered with translate(-50%, -50%).
 * When the preset panel width expands from 0→320px, the stage
 * auto-recenters, creating the "modal slides left" effect with
 * zero manual offset calculation.
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
  /** Additional categories this item should appear in (e.g. map in both media + interaktion). */
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
  items: PickerItem[];
  categories: PickerCategory[];
  /** If provided, clicking a result opens a preset panel instead of selecting immediately. */
  getPresets?: (itemId: string) => PresetOption[];
  /** Label prefix for presets header (e.g. "Sektions" → "Sektions-preset"). */
  presetLabel?: string;
  /** Called when selection is complete. presetKey is provided if getPresets was used. */
  onSelect: (itemId: string, presetKey?: string) => void;
  onClose: () => void;
};

// ═══════════════════════════════════════════════════════════════
// PICKER MODAL COMPONENT
// ═══════════════════════════════════════════════════════════════

export function PickerModal({
  title,
  items,
  categories,
  getPresets,
  presetLabel = "Sektions",
  onSelect,
  onClose,
}: PickerModalProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(categories[0]?.key ?? "all");
  const [focusIndex, setFocusIndex] = useState(0);

  // ── Preset panel state ──
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [presetsVisible, setPresetsVisible] = useState(false);
  const [imagesReady, setImagesReady] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);


  // ── Filter items ──

  const filtered = useMemo(() => {
    let result = items;

    if (activeCategory !== "all") {
      result = result.filter((item) =>
        item.category === activeCategory ||
        (item.categories && item.categories.includes(activeCategory))
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const words = q.split(/\s+/);

      result = result.filter((item) => {
        const haystack = [
          item.name.toLowerCase(),
          item.description.toLowerCase(),
          ...item.tags.map((t) => t.toLowerCase()),
        ].join(" ");
        return words.every((word) => haystack.includes(word));
      });
    }

    return result;
  }, [items, activeCategory, search]);

  // ── Reset focus on filter change ──

  useEffect(() => {
    setFocusIndex(0);
  }, [activeCategory, search]);

  // ── All categories ──

  const allCategories: PickerCategory[] = useMemo(
    () => [...categories, { key: "all", label: "Alla element", icon: <EditorIcon name="more_horiz" size={16} /> }],
    [categories]
  );

  // ── Items that skip preset picker (added directly) ──

  const skipItems = useMemo(() => {
    if (!getPresets) return new Set<string>();
    const set = new Set<string>();
    for (const item of items) {
      if (getPresets(item.id).length === 0) set.add(item.id);
    }
    return set;
  }, [items, getPresets]);

  // ── Presets for selected item ──

  const presets: PresetOption[] = useMemo(() => {
    if (!selectedItemId || !getPresets) return [];
    return getPresets(selectedItemId);
  }, [selectedItemId, getPresets]);

  const selectedItemName = useMemo(() => {
    if (!selectedItemId) return "";
    return items.find((i) => i.id === selectedItemId)?.name ?? "";
  }, [selectedItemId, items]);

  // ── Preload all preset thumbnail images ──
  // Skeleton stays visible until EVERY image has loaded (or failed).
  // This prevents partial/broken image flashes.

  useEffect(() => {
    if (!selectedItemId || presets.length === 0) {
      setImagesReady(false);
      return;
    }

    const urls = presets
      .map((p) => p.thumbnail)
      .filter((url): url is string => !!url && url.length > 0);

    // No images to load → ready immediately
    if (urls.length === 0) {
      setImagesReady(true);
      return;
    }

    let cancelled = false;
    let loadedCount = 0;
    const total = urls.length;

    const checkAllLoaded = () => {
      loadedCount++;
      if (!cancelled && loadedCount >= total) {
        setImagesReady(true);
      }
    };

    const imageElements: HTMLImageElement[] = urls.map((url) => {
      const img = new Image();
      img.onload = checkAllLoaded;
      img.onerror = checkAllLoaded; // Count errors as "loaded" to unblock UI
      img.src = url;
      return img;
    });

    return () => {
      cancelled = true;
      // Abort pending loads
      imageElements.forEach((img) => { img.src = ""; });
    };
  }, [selectedItemId, presets]);

  // ── Show skeletons when images aren't ready ──
  const showSkeletons = selectedItemId !== null && !imagesReady;

  // ── Handle item click ──

  const handleItemClick = useCallback(
    (itemId: string) => {
      if (getPresets) {
        const itemPresets = getPresets(itemId);
        // Skip preset picker if no presets or element is flagged to skip
        if (itemPresets.length === 0) {
          onSelect(itemId);
          onClose();
          return;
        }
        // Cancel any pending close animation before opening new panel
        if (closePanelTimer.current) clearTimeout(closePanelTimer.current);
        // Two-step: mount preset panel at width:0, then animate open next frame
        setSelectedItemId(itemId);
        setImagesReady(false);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setPresetsVisible(true);
          });
        });
      } else {
        // Direct selection (no presets)
        onSelect(itemId);
        onClose();
      }
    },
    [getPresets, onSelect, onClose]
  );

  // ── Handle preset click ──

  const handlePresetClick = useCallback(
    (presetKey: string) => {
      if (!selectedItemId) return;
      onSelect(selectedItemId, presetKey);
      onClose();
    },
    [selectedItemId, onSelect, onClose]
  );

  // ── Close preset panel (back to items) ──

  const closePanelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClosePresets = useCallback(() => {
    setPresetsVisible(false);
    setImagesReady(false);
    // Delay clearing selection until animation completes
    if (closePanelTimer.current) clearTimeout(closePanelTimer.current);
    closePanelTimer.current = setTimeout(() => setSelectedItemId(null), 350);
  }, []);

  // ── Keyboard ──

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusIndex((prev) => Math.min(prev + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filtered.length > 0 && focusIndex >= 0 && focusIndex < filtered.length) {
            handleItemClick(filtered[focusIndex].id);
          }
          break;
        case "Escape":
          e.preventDefault();
          if (selectedItemId) {
            handleClosePresets();
          } else {
            onClose();
          }
          break;
        case "Tab":
          e.preventDefault();
          searchRef.current?.focus();
          break;
      }
    },
    [filtered, focusIndex, handleItemClick, handleClosePresets, selectedItemId, onClose]
  );

  // ── Scroll focused item into view ──

  useEffect(() => {
    const container = resultsRef.current;
    if (!container) return;
    const el = container.querySelector(`[data-pk-index="${focusIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusIndex]);

  // ── Backdrop click ──

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  const activeDescendantId =
    filtered.length > 0 ? `pk-result-${filtered[focusIndex]?.id}` : undefined;

  const hasPresets = selectedItemId !== null;

  return createPortal(
    <div className="pk-backdrop" onClick={handleBackdropClick}>
      {/* Stage: centered wrapper that holds modal + preset panel */}
      <div
        className={`pk-stage${hasPresets ? " pk-stage--with-presets" : ""}`}
        onKeyDown={handleKeyDown}
      >
        {/* ═══ Main Modal ═══ */}
        <div
          className={`pk-modal${hasPresets ? " pk-modal--shifted" : ""}`}
          role="dialog"
          aria-label={title}
          aria-modal="true"
        >
          {/* Header */}
          <div className="pk-header">
            <h3 className="pk-header__title">{title}</h3>
            <button
              type="button"
              className="pk-header__close"
              onClick={onClose}
              aria-label="Stäng"
            >
              <CloseIcon />
            </button>
          </div>

          {/* Search */}
          <div className="pk-search">
            <SearchIcon />
            <input
              ref={searchRef}
              type="text"
              className="pk-search__input"
              placeholder="Sök..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              role="combobox"
              aria-expanded="true"
              aria-controls="pk-results-list"
              aria-activedescendant={activeDescendantId}
              autoComplete="off"
            />
            {search && (
              <button
                type="button"
                className="pk-search__clear"
                onClick={() => setSearch("")}
                aria-label="Rensa sökning"
              >
                <CloseIcon />
              </button>
            )}
          </div>

          <div className="pk-divider" />

          {/* Body */}
          <div className="pk-body">
            <nav className="pk-categories" aria-label="Kategorier">
              {allCategories.map((cat) => {
                const isActive = activeCategory === cat.key;

                return (
                  <button
                    key={cat.key}
                    type="button"
                    className={`pk-cat${isActive ? " pk-cat--active" : ""}`}
                    onClick={() => setActiveCategory(cat.key)}
                    aria-current={isActive ? "true" : undefined}
                  >
                    {cat.icon && <span className="pk-cat__icon">{cat.icon}</span>}
                    <span className="pk-cat__label">{cat.label}</span>
                  </button>
                );
              })}
            </nav>

            <div
              ref={resultsRef}
              className="pk-results"
              id="pk-results-list"
              role="listbox"
              aria-label="Resultat"
            >
              <span className="pk-results__heading">
                {allCategories.find((c) => c.key === activeCategory)?.label ?? ""}
              </span>
              {filtered.length === 0 ? (
                <div className="pk-empty">
                  <EmptyIcon />
                  <span className="pk-empty__title">
                    {search.trim() ? "Inga resultat" : "Inga tillgängliga objekt"}
                  </span>
                  <span className="pk-empty__desc">
                    {search.trim()
                      ? `Inga objekt matchar "${search}". Prova ett annat sökord.`
                      : "Det finns inga objekt i den här kategorin."}
                  </span>
                </div>
              ) : (
                filtered.map((item, index) => {
                  const isFocused = index === focusIndex;
                  const isSelected = item.id === selectedItemId;

                  return (
                    <button
                      key={item.id}
                      id={`pk-result-${item.id}`}
                      data-pk-index={index}
                      type="button"
                      className={`pk-result${isFocused ? " pk-result--focused" : ""}${isSelected ? " pk-result--selected" : ""}`}
                      role="option"
                      aria-selected={isFocused}
                      onClick={() => handleItemClick(item.id)}
                      onMouseEnter={() => setFocusIndex(index)}
                    >
                      <span className="pk-result__icon">
                        {item.icon ?? <DefaultItemIcon />}
                      </span>
                      <span className="pk-result__text">
                        <span className="pk-result__name">{item.name}</span>
                        <span className="pk-result__desc">{item.description}</span>
                      </span>
                      {(!getPresets || !skipItems.has(item.id)) && <ChevronRightIcon />}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer */}
          {filtered.length > 0 && (
            <div className="pk-footer">
              <span className="pk-footer__hint">
                <kbd>↑</kbd><kbd>↓</kbd> navigera
              </span>
              <span className="pk-footer__hint">
                <kbd>↵</kbd> välj
              </span>
              <span className="pk-footer__hint">
                <kbd>esc</kbd> stäng
              </span>
            </div>
          )}
        </div>

        {/* ═══ Preset Panel ═══ */}
        {hasPresets && (
          <div className={`pk-presets${presetsVisible ? " pk-presets--loaded" : ""}`}>
            {/* Preset header */}
            <div className="pk-presets__header">
              <div className="pk-presets__header-text">
                <span className="pk-presets__title">{presetLabel}-preset</span>
                <span className="pk-presets__subtitle">
                  Välj en förinställning för att bygga snabbare
                </span>
              </div>
              <button
                type="button"
                className="pk-header__close"
                onClick={handleClosePresets}
                aria-label="Stäng presets"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="pk-presets__divider" />

            {/* Preset list */}
            <div className="pk-presets__list">
              {showSkeletons ? (
                // Skeleton shimmer — matches actual preset count
                Array.from({ length: Math.max(presets.length, 2) }, (_, i) => (
                  <PresetSkeleton key={i} />
                ))
              ) : (
                presets.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    className="pk-preset"
                    onClick={() => handlePresetClick(preset.key)}
                  >
                    {preset.thumbnail ? (
                      <img
                        src={preset.thumbnail}
                        alt={preset.name}
                        className="pk-preset__img"
                        draggable={false}
                      />
                    ) : (
                      <span className="pk-preset__img pk-preset__img--empty" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ── Skeleton shimmer card ──

function PresetSkeleton() {
  return (
    <div className="pk-preset-skeleton" />
  );
}

// ═══════════════════════════════════════════════════════════════
// DATA FACTORIES
// ═══════════════════════════════════════════════════════════════

export function buildSectionPickerData(): {
  items: PickerItem[];
  categories: PickerCategory[];
} {
  const defs = getAllSectionDefinitions();

  const items: PickerItem[] = defs.map((def) => ({
    id: def.id,
    name: def.name,
    description: def.description,
    category: def.category,
    tags: def.tags,
    icon: <SectionTypeIcon category={def.category} />,
  }));

  const categories: PickerCategory[] = [
    { key: "hero", label: "Hero", icon: <CategoryHeroIcon /> },
    { key: "navigation", label: "Navigation", icon: <CategoryNavIcon /> },
    { key: "content", label: "Innehåll", icon: <CategoryContentIcon /> },
    { key: "media", label: "Media", icon: <CategoryMediaIcon /> },
    { key: "utility", label: "Verktyg", icon: <CategoryUtilityIcon /> },
  ];

  return { items, categories };
}

/**
 * Returns preset options for a section definition.
 * Used as the `getPresets` callback for section picking.
 */
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

/**
 * Returns preset options for an element definition.
 * Used as the `getPresets` callback for element picking.
 */
export function getElementPresets(elementType: string): PresetOption[] {
  const def = getElementDefinition(elementType as ElementType);
  if (!def) return [];

  // Elements flagged with skipPresetPicker go directly — return empty to signal skip
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
    icon: <BlockTypeIcon />,
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

export function buildElementPickerData(slotDef: SlotDefinition): {
  items: PickerItem[];
  categories: PickerCategory[];
} {
  const allElements = getAllElementDefinitions();
  const allowed = new Set<string>(slotDef.allowedElements);
  const validElements = allElements.filter((el) => allowed.has(el.type));

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
    { key: "text", label: "Text", icon: <EditorIcon name="title" size={16} /> },
    { key: "media", label: "Media", icon: <EditorIcon name="broken_image" size={16} /> },
    { key: "interaktion", label: "Interaktion", icon: <EditorIcon name="web_traffic" size={16} /> },
    { key: "layout", label: "Layout", icon: <EditorIcon name="responsive_layout" size={16} /> },
  ];

  return { items, categories };
}

// ═══════════════════════════════════════════════════════════════
// INSTANCE CREATION
// ═══════════════════════════════════════════════════════════════

/**
 * Create a SectionInstance from a definition ID + chosen preset key.
 * If no presetKey provided, uses the definition's default.
 */
export function createSectionFromPicker(
  definitionId: string,
  presetKey?: string
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

  // Apply preset overrides if a preset was chosen
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

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="pk-search__icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M11.5 11.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ChevronRightIcon() {
  return <EditorIcon name="chevron_right" size={16} className="pk-result__chevron" />;
}

function EmptyIcon() {
  return (
    <svg className="pk-empty__icon" width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="32" height="32" rx="8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
      <path d="M15 20h10M20 15v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function DefaultItemIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="14" height="14" rx="3.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}


function SectionTypeIcon({ category }: { category: string }) {
  switch (category) {
    case "hero":
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5 8h8M5 11h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "navigation":
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="2" y="6" width="14" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5 9h2M8 9h2M11 9h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "content":
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M3 5h12M3 9h8M3 13h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "media":
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="6.5" cy="7" r="1.5" stroke="currentColor" strokeWidth="1" />
          <path d="M2 12l4-3 3 2 3-2 4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.2" />
          <path d="M9 6v3l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
  }
}

function CategoryHeroIcon() { return <SectionTypeIcon category="hero" />; }
function CategoryNavIcon() { return <SectionTypeIcon category="navigation" />; }
function CategoryContentIcon() { return <SectionTypeIcon category="content" />; }
function CategoryMediaIcon() { return <SectionTypeIcon category="media" />; }
function CategoryUtilityIcon() { return <SectionTypeIcon category="utility" />; }

function BlockTypeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="10" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="10" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
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
  return <DefaultItemIcon />;
}
