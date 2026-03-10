/**
 * Section Resolution — Strict Render Pipeline
 * ─────────────────────────────────────────────
 * resolve() → validate() → render()
 *
 * This module implements the resolve step: transforms raw stored data
 * into fully merged, renderer-ready output. The renderer receives
 * complete data — no defaults, no fallbacks, no guessing.
 *
 * INPUT:
 *   HomeConfig.cards[]      — flat array of all cards (legacy)
 *   HomeConfig.sections[]   — section instances with blocks/slots/elements
 *
 * OUTPUT:
 *   PageItem[] — sorted by sortOrder, sections fully resolved
 */

import type { Card, CategoryCard } from "@/app/(guest)/_lib/portal/homeLinks";
import type {
  SectionInstance,
  SectionDefinition,
  SectionPreset,
  BlockInstance,
  SlotDefinition,
  ResolvedBlock,
  ResolvedSlot,
  ResolvedElement,
  SectionRendererProps,
  ElementAction,
} from "./types";
import { NO_ACTION } from "./types";
import { getSectionDefinition, getElementDefinition } from "./registry";
import {
  resolveSectionSettings,
  resolvePresetSettings,
  resolveBlockSettings,
  resolveElementSettings,
  validateSectionInstance,
} from "./validation";

// ─── Page Item Types ────────────────────────────────────────

export type LooseCard = Exclude<Card, CategoryCard>;

export type PageItem =
  | {
      kind: "section";
      sortOrder: number;
      /** Fully resolved, validated render data. */
      renderProps: SectionRendererProps;
    }
  | {
      kind: "card";
      sortOrder: number;
      card: LooseCard;
    }
  | {
      kind: "category";
      sortOrder: number;
      category: CategoryCard;
      cards: LooseCard[];
    };

// ─── Visibility Helpers ─────────────────────────────────────

/**
 * Check schedule visibility. Looks at both instance-level fields
 * and settings (for backward compatibility with data saved before
 * schedule fields were promoted to instance level).
 */
function parseScheduleDate(val: string | undefined): number | null {
  if (!val) return null;
  const ms = new Date(val).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function isScheduleVisible(item: {
  scheduledShow?: string;
  scheduledHide?: string;
  settings?: Record<string, unknown>;
}): boolean {
  const now = Date.now();
  const show = item.scheduledShow ?? (item.settings?.scheduledShow as string | undefined);
  const hide = item.scheduledHide ?? (item.settings?.scheduledHide as string | undefined);
  const showMs = parseScheduleDate(show);
  const hideMs = parseScheduleDate(hide);
  if (showMs !== null && showMs > now) return false;
  if (hideMs !== null && hideMs <= now) return false;
  return true;
}

function hasRequiredTitle(card: Card): boolean {
  if ((card as any).type === "header") return true;
  return !!card.title?.trim();
}

// ─── Element Resolution ─────────────────────────────────────

function resolveElement(element: import("./types").ElementInstance): ResolvedElement | null {
  const def = getElementDefinition(element.type);
  if (!def) {
    console.warn(`[resolve] Unknown element type "${element.type}" — skipping`);
    return null;
  }

  const action: ElementAction = element.action && element.action.type !== "none"
    ? element.action
    : NO_ACTION;

  return {
    element,
    settings: resolveElementSettings(def, element.settings),
    action,
    definition: def,
  };
}

// ─── Slot Resolution ────────────────────────────────────────

function resolveSlot(
  slotDef: SlotDefinition,
  elements: import("./types").ElementInstance[]
): ResolvedSlot {
  const sorted = [...elements].sort((a, b) => a.sortOrder - b.sortOrder);
  const resolved: ResolvedElement[] = [];

  for (const el of sorted) {
    if (!isScheduleVisible(el)) continue;
    const r = resolveElement(el);
    if (r) resolved.push(r);
  }

  return {
    definition: slotDef,
    elements: resolved,
  };
}

// ─── Block Resolution ───────────────────────────────────────

function resolveBlocks(
  section: SectionInstance,
  preset: SectionPreset
): ResolvedBlock[] {
  const blockTypeMap = new Map(preset.blockTypes.map(bt => [bt.type, bt]));
  const sorted = [...section.blocks].sort((a, b) => a.sortOrder - b.sortOrder);
  const resolved: ResolvedBlock[] = [];

  for (const block of sorted) {
    if (!block.isActive || !isScheduleVisible(block)) continue;

    const bt = blockTypeMap.get(block.type);
    if (!bt) {
      console.warn(`[resolve] Unknown block type "${block.type}" in preset "${preset.key}" — skipping`);
      continue;
    }

    const slotDefMap = new Map(bt.slots.map(s => [s.key, s]));
    const resolvedSlots: Record<string, ResolvedSlot> = {};

    // Resolve each defined slot
    for (const slotDef of bt.slots) {
      const elements = block.slots[slotDef.key] ?? [];
      resolvedSlots[slotDef.key] = resolveSlot(slotDef, elements);
    }

    resolved.push({
      block,
      settings: resolveBlockSettings(bt, block.settings),
      slots: resolvedSlots,
    });
  }

  return resolved;
}

// ─── Section Resolution ─────────────────────────────────────

/**
 * Resolve a single section into render-ready props.
 *
 * Returns null if the section cannot be resolved (unknown definition,
 * unknown preset, failed validation). These are logged, not thrown.
 */
function resolveSection(
  section: SectionInstance,
  config: import("@/app/(guest)/_lib/tenant/types").TenantConfig
): SectionRendererProps | null {
  // ── Loose elements (test mode) ──
  // These bypass the full definition/preset pipeline.
  // Blocks/slots/elements are resolved directly.
  if (section.definitionId === "__loose-element") {
    return resolveLooseElementSection(section, config);
  }

  const definition = getSectionDefinition(section.definitionId);
  if (!definition) {
    console.warn(`[resolve] Unknown definition "${section.definitionId}" — skipping`);
    return null;
  }

  const preset = definition.presets.find(p => p.key === section.presetKey);
  if (!preset) {
    console.warn(`[resolve] Unknown preset "${section.presetKey}" in "${section.definitionId}" — skipping`);
    return null;
  }

  // Validate (strict contract: invalid data doesn't reach renderer)
  const result = validateSectionInstance(section, definition);
  if (!result.valid) {
    console.warn(
      `[resolve] Section "${section.id}" failed validation:`,
      result.errors.map(e => `${e.path}: ${e.message}`)
    );
    return null;
  }

  return {
    section,
    definition,
    preset,
    settings: resolveSectionSettings(definition, section.settings),
    presetSettings: resolvePresetSettings(preset, section.presetSettings),
    blocks: resolveBlocks(section, preset),
    config,
  };
}

/**
 * Resolve a loose-element section (test mode).
 * Directly resolves blocks → slots → elements without a registered definition.
 */
function resolveLooseElementSection(
  section: SectionInstance,
  config: import("@/app/(guest)/_lib/tenant/types").TenantConfig
): SectionRendererProps | null {
  const resolvedBlocks: ResolvedBlock[] = [];

  for (const block of section.blocks) {
    if (!block.isActive || !isScheduleVisible(block)) continue;

    const resolvedSlots: Record<string, ResolvedSlot> = {};
    for (const [slotKey, elements] of Object.entries(block.slots)) {
      const sorted = [...elements].sort((a, b) => a.sortOrder - b.sortOrder);
      const resolvedElements: ResolvedElement[] = [];
      for (const el of sorted) {
        if (!isScheduleVisible(el)) continue;
        const r = resolveElement(el);
        if (r) resolvedElements.push(r);
      }
      resolvedSlots[slotKey] = {
        definition: { key: slotKey, name: slotKey, description: "", allowedElements: [], minElements: 0, maxElements: -1, defaultElements: [] },
        elements: resolvedElements,
      };
    }

    resolvedBlocks.push({
      block,
      settings: block.settings,
      slots: resolvedSlots,
    });
  }

  if (resolvedBlocks.length === 0) return null;

  // Minimal stubs — GenericSectionRenderer only needs blocks + settings
  const stubDefinition = {
    id: "__loose-element",
    version: "1.0.0",
    name: section.title || "Element",
    description: "",
    category: "content" as const,
    tags: [],
    thumbnail: "",
    settingsSchema: [],
    settingDefaults: {},
    presets: [],
    createDefault: () => ({ definitionId: "__loose-element", definitionVersion: "1.0.0", presetKey: "default", presetVersion: "1.0.0", isActive: true, settings: {}, presetSettings: {}, blocks: [], title: "" }),
  };

  const stubPreset = {
    key: "default",
    version: "1.0.0",
    name: "Default",
    description: "",
    thumbnail: "",
    cssClass: "s-loose-element",
    blockTypes: [],
    minBlocks: 0,
    maxBlocks: -1,
    settingsSchema: [],
    settingDefaults: {},
    changeStrategy: "reset" as const,
    migrations: {},
    createDefaultBlocks: () => [],
  };

  return {
    section,
    definition: stubDefinition,
    preset: stubPreset,
    settings: section.settings,
    presetSettings: section.presetSettings,
    blocks: resolvedBlocks,
    config,
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve HomeConfig data into an ordered list of page items.
 *
 * Sections go through the strict pipeline: resolve → validate → render.
 * Invalid sections are skipped (logged, not thrown).
 *
 * @param cards     All cards from HomeConfig.cards[]
 * @param sections  All section instances from HomeConfig.sections[]
 * @param config    Full tenant config (passed through to render props)
 */
export function resolvePageItems(
  cards: Card[],
  sections: SectionInstance[] = [],
  config?: import("@/app/(guest)/_lib/tenant/types").TenantConfig
): PageItem[] {
  const cardMap = new Map<string, Card>();
  for (const card of cards) cardMap.set(card.id, card);

  const categoryOwnedIds = new Set<string>();
  for (const card of cards) {
    if (card.type === "category" && card.isActive) {
      for (const id of (card as CategoryCard).cardIds) categoryOwnedIds.add(id);
    }
  }

  const items: PageItem[] = [];

  // ── Sections (strict: resolve → validate → render) ──
  for (const section of sections) {
    if (!section.isActive || !isScheduleVisible(section)) continue;

    const renderProps = resolveSection(section, config as any);
    if (!renderProps) continue;

    items.push({
      kind: "section",
      sortOrder: section.sortOrder,
      renderProps,
    });
  }

  // ── Legacy categories ──
  for (const card of cards) {
    if (card.type !== "category" || !card.isActive) continue;

    const category = card as CategoryCard;
    const resolved: LooseCard[] = [];

    for (const id of category.cardIds) {
      const child = cardMap.get(id);
      if (!child || child.type === "category" || !child.isActive) continue;
      if (!hasRequiredTitle(child) || !isScheduleVisible(child)) continue;
      resolved.push(child as LooseCard);
    }

    if (resolved.length > 0) {
      items.push({ kind: "category", sortOrder: category.sortOrder, category, cards: resolved });
    }
  }

  // ── Loose cards ──
  for (const card of cards) {
    if (card.type === "category") continue;
    if (categoryOwnedIds.has(card.id)) continue;
    if (!card.isActive || !hasRequiredTitle(card) || !isScheduleVisible(card)) continue;

    items.push({ kind: "card", sortOrder: card.sortOrder, card: card as LooseCard });
  }

  return items.sort((a, b) => a.sortOrder - b.sortOrder);
}
