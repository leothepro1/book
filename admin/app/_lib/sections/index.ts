/**
 * Section System — Public API
 *
 * Three-level hierarchy: Section → Block → Slot → Element
 * Five pillars: Versioning, Actions, Slots, Preset Migration, Strict Render
 */

// ─── Types ──────────────────────────────────────────────────
export type {
  // Actions
  ElementAction,
  ActionType,
  // Elements
  ElementType,
  ElementDefinition,
  ElementPreset,
  ElementInstance,
  // Slots
  SlotDefinition,
  // Blocks
  BlockTypeDefinition,
  BlockInstance,
  // Presets
  SectionPreset,
  PresetChangeStrategy,
  // Sections
  SectionDefinitionId,
  SectionCategory,
  SectionDefinition,
  SectionInstance,
  // Renderer contracts
  ResolvedElement,
  ResolvedSlot,
  ResolvedBlock,
  SectionRendererProps,
  SectionRendererComponent,
  SectionRendererKey,
  // Settings
  SettingField,
  SettingFieldType,
} from "./types";

export {
  ACTION_TYPES,
  NO_ACTION,
  createSectionId,
  createBlockId,
  createElementId,
} from "./types";

// ─── Registry ───────────────────────────────────────────────
export {
  registerElementDefinition,
  getElementDefinition,
  getAllElementDefinitions,
  hasElementDefinition,
  registerSectionDefinition,
  getSectionDefinition,
  getAllSectionDefinitions,
  getSectionDefinitionsByCategory,
  hasSectionDefinition,
  registerSectionRenderer,
  getSectionRenderer,
  hasSectionRenderer,
  ensureSectionsRegistered,
} from "./registry";

// ─── Validation ─────────────────────────────────────────────
export type { ValidationError, ValidationResult } from "./validation";
export {
  validateSettingValue,
  validateSettings,
  validateSectionSettings,
  validateAction,
  validateElementInstance,
  validateSlotElements,
  validateBlockInstance,
  validateSectionInstance,
  sanitizeSettings,
  resolveSettings,
  sanitizeSectionSettings,
  resolveSectionSettings,
  resolvePresetSettings,
  resolveBlockSettings,
  resolveElementSettings,
} from "./validation";

// ─── Resolution ─────────────────────────────────────────────
export type { LooseCard, PageItem } from "./resolve";
export { resolvePageItems } from "./resolve";

// ─── Traversal ──────────────────────────────────────────────
export { collectAllSections } from "./traversal";
