/**
 * Section System — Pure Mutation Helpers
 * ═══════════════════════════════════════
 *
 * Extracted from SectionsPanel to keep UI thin and logic testable.
 * Every function is pure: state in → new state out, no side effects.
 *
 * Hard guards: every mutator validates constraints (maxBlocks, maxElements)
 * and returns `null` when a mutation would violate them. The UI should
 * pre-check with `canAddBlock` / `canAddElement` and disable buttons,
 * but the guards here are the safety net.
 */

import type {
  SectionInstance,
  BlockInstance,
  ElementType,
  BlockTypeDefinition,
  SlotDefinition,
  SectionPreset,
} from "./types";
import { createSectionId, createBlockId } from "./types";
import { getSectionDefinition, getElementDefinition } from "./registry";
import { createBlockFromPicker, createElementFromPicker } from "@/app/(editor)/editor/panels/PickerModal";

// ═══════════════════════════════════════════════════════════════
// LOOKUP HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve the preset definition for a given section instance.
 */
export function getPresetForSection(section: SectionInstance): SectionPreset | null {
  const def = getSectionDefinition(section.definitionId);
  if (!def) return null;
  return def.presets.find((p) => p.key === section.presetKey) ?? null;
}

/**
 * Get the default block type for a section's active preset.
 *
 * If the preset has exactly one blockType, returns it directly.
 * If multiple, returns the first (caller should present a picker instead).
 */
export function getDefaultBlockType(section: SectionInstance): BlockTypeDefinition | null {
  const preset = getPresetForSection(section);
  if (!preset || preset.blockTypes.length === 0) return null;
  return preset.blockTypes[0];
}

/**
 * Whether the preset has multiple block types (needs a block-type picker).
 */
export function hasMultipleBlockTypes(section: SectionInstance): boolean {
  const preset = getPresetForSection(section);
  return (preset?.blockTypes.length ?? 0) > 1;
}

/**
 * Find the first slot in a block type that accepts the given element type
 * AND has room for another element (respects maxElements).
 *
 * Returns null if no valid slot exists.
 */
export function getValidTargetSlot(
  blockTypeDef: BlockTypeDefinition,
  block: BlockInstance,
  elementType: ElementType,
): SlotDefinition | null {
  for (const slotDef of blockTypeDef.slots) {
    if (!slotDef.allowedElements.includes(elementType)) continue;

    const currentCount = (block.slots[slotDef.key] ?? []).length;
    if (slotDef.maxElements !== -1 && currentCount >= slotDef.maxElements) continue;

    return slotDef;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// CONSTRAINT QUERIES (for disabling UI buttons)
// ═══════════════════════════════════════════════════════════════

/**
 * Can another block be added to this section?
 * Checks preset.maxBlocks against current block count.
 */
export function canAddBlock(section: SectionInstance): boolean {
  const preset = getPresetForSection(section);
  if (!preset) return false;
  if (preset.maxBlocks === -1) return true;
  return section.blocks.length < preset.maxBlocks;
}

/**
 * Can at least one more element be added to this block?
 * True if ANY slot in the block type has room for at least one allowed element.
 */
export function canAddElement(section: SectionInstance, block: BlockInstance): boolean {
  const preset = getPresetForSection(section);
  if (!preset) return false;
  const blockTypeDef = preset.blockTypes.find((bt) => bt.type === block.type);
  if (!blockTypeDef) return false;

  for (const slotDef of blockTypeDef.slots) {
    if (slotDef.maxElements === -1) return true;
    const currentCount = (block.slots[slotDef.key] ?? []).length;
    if (currentCount < slotDef.maxElements) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
// MUTATORS (pure: sections in → sections out, null = rejected)
// ═══════════════════════════════════════════════════════════════

/**
 * Insert a new default block at the top of a section.
 * Returns null if maxBlocks would be exceeded or no block type exists.
 */
export function insertBlockIntoSection(
  sections: SectionInstance[],
  sectionId: string,
): SectionInstance[] | null {
  const section = sections.find((s) => s.id === sectionId);
  if (!section) return null;

  // Constraint: maxBlocks
  if (!canAddBlock(section)) return null;

  const blockTypeDef = getDefaultBlockType(section);
  if (!blockTypeDef) return null;

  const newBlock = createBlockFromPicker(blockTypeDef);

  return sections.map((s) => {
    if (s.id !== sectionId) return s;
    const reordered = [newBlock, ...s.blocks].map((b, i) => ({ ...b, sortOrder: i }));
    return { ...s, blocks: reordered };
  });
}

/**
 * Insert an element into the correct slot of a block.
 * Returns null if no valid slot has room or the element can't be created.
 */
export function insertElementIntoBlock(
  sections: SectionInstance[],
  sectionId: string,
  blockId: string,
  elementType: ElementType,
  presetKey?: string,
): SectionInstance[] | null {
  const section = sections.find((s) => s.id === sectionId);
  if (!section) return null;

  const preset = getPresetForSection(section);
  const block = section.blocks.find((b) => b.id === blockId);
  if (!preset || !block) return null;

  const blockTypeDef = preset.blockTypes.find((bt) => bt.type === block.type);
  if (!blockTypeDef) return null;

  // Find valid target slot (respects maxElements)
  const targetSlot = getValidTargetSlot(blockTypeDef, block, elementType);
  if (!targetSlot) return null;

  const el = createElementFromPicker(elementType, presetKey);
  if (!el) return null;

  return sections.map((s) => {
    if (s.id !== sectionId) return s;
    return {
      ...s,
      blocks: s.blocks.map((b) => {
        if (b.id !== blockId) return b;
        const slotElements = b.slots[targetSlot.key] ?? [];
        return {
          ...b,
          slots: {
            ...b.slots,
            [targetSlot.key]: [...slotElements, { ...el, sortOrder: slotElements.length }],
          },
        };
      }),
    };
  });
}

/**
 * Get the "Lägg till X" label for a section's add-block button.
 */
export function getAddBlockLabel(section: SectionInstance): string {
  const bt = getDefaultBlockType(section);
  return bt?.name?.toLowerCase() || "block";
}

// ═══════════════════════════════════════════════════════════════
// STANDALONE ELEMENTS
// ═══════════════════════════════════════════════════════════════

/**
 * Standalone element definition ID.
 *
 * A standalone element is a SectionInstance that wraps a single element
 * in an auto-generated block. The rendering pipeline handles it the same
 * way as __loose-element but the editor presents it as a first-class
 * tree item — no section/block wrapper visible to the user.
 */
export const STANDALONE_DEFINITION_ID = "__standalone";

/**
 * Check if a section is a standalone element wrapper.
 */
export function isStandaloneSection(section: SectionInstance): boolean {
  return section.definitionId === STANDALONE_DEFINITION_ID;
}

/**
 * Create a standalone section wrapping a single element.
 * Returns a complete SectionInstance ready to insert into the page.
 */
export function createStandaloneSection(
  elementType: ElementType,
  presetKey?: string,
): SectionInstance | null {
  const el = createElementFromPicker(elementType, presetKey);
  if (!el) return null;

  const def = getElementDefinition(elementType);

  return {
    id: createSectionId(),
    definitionId: STANDALONE_DEFINITION_ID,
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    sortOrder: 0,
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
    title: def?.name ?? elementType,
  };
}

/**
 * Get the inner element from a standalone section.
 * Returns null if the section is not standalone or has no element.
 */
export function getStandaloneElement(section: SectionInstance) {
  if (!isStandaloneSection(section)) return null;
  return section.blocks?.[0]?.slots?.content?.[0] ?? null;
}
