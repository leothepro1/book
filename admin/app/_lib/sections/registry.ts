/**
 * Section Registry
 * ────────────────
 * Triple registry for element definitions, section definitions, and section renderers.
 *
 * ELEMENTS:    ElementType → ElementDefinition (global)
 * DEFINITIONS: SectionDefinitionId → SectionDefinition (global)
 * RENDERERS:   "definitionId/presetKey" → React component (global)
 *
 * All registered definitions are deep-frozen (immutable at runtime).
 * Duplicate registration throws (fail-fast over silent override).
 * All keys, schemas, and constraints are validated at registration time.
 */

import type {
  ElementType,
  ElementDefinition,
  SectionDefinition,
  SectionDefinitionId,
  SectionRendererComponent,
  SectionRendererKey,
  SectionCategory,
  SlotDefinition,
} from "./types";

// ═══════════════════════════════════════════════════════════════
// ELEMENT DEFINITION REGISTRY
// ═══════════════════════════════════════════════════════════════

const elementDefinitions = new Map<ElementType, Readonly<ElementDefinition>>();

/**
 * Register an element definition.
 *
 * @throws if the element type is already registered
 * @throws if schema field keys are not unique
 */
export function registerElementDefinition(definition: ElementDefinition): void {
  if (!definition.type || typeof definition.type !== "string") {
    throw new Error(`[SectionRegistry] Element definition must have a non-empty type`);
  }
  if (elementDefinitions.has(definition.type)) {
    throw new Error(
      `[SectionRegistry] Element "${definition.type}" is already registered.`
    );
  }
  if (!definition.name) {
    throw new Error(`[SectionRegistry] Element "${definition.type}" must have a non-empty name`);
  }
  if (!definition.version) {
    throw new Error(`[SectionRegistry] Element "${definition.type}" must have a version`);
  }

  validateSchemaFieldUniqueness(definition.settingsSchema, `element "${definition.type}"`);

  // Validate element presets
  if (!definition.presets || definition.presets.length === 0) {
    throw new Error(`[SectionRegistry] Element "${definition.type}" must have at least one preset`);
  }
  const presetKeys = new Set<string>();
  for (const preset of definition.presets) {
    if (!preset.key) {
      throw new Error(`[SectionRegistry] Element "${definition.type}" has a preset without a key`);
    }
    if (presetKeys.has(preset.key)) {
      throw new Error(`[SectionRegistry] Element "${definition.type}" has duplicate preset key "${preset.key}"`);
    }
    presetKeys.add(preset.key);
  }

  elementDefinitions.set(definition.type, deepFreeze(definition));
}

export function getElementDefinition(type: ElementType): Readonly<ElementDefinition> | undefined {
  return elementDefinitions.get(type);
}

export function getAllElementDefinitions(): ReadonlyArray<Readonly<ElementDefinition>> {
  return Object.freeze([...elementDefinitions.values()]);
}

export function hasElementDefinition(type: ElementType): boolean {
  return elementDefinitions.has(type);
}

// ═══════════════════════════════════════════════════════════════
// SECTION DEFINITION REGISTRY
// ═══════════════════════════════════════════════════════════════

const definitions = new Map<SectionDefinitionId, Readonly<SectionDefinition>>();

/**
 * Register a section definition.
 * Validates the full tree: definition → presets → block types → slots.
 */
export function registerSectionDefinition(definition: SectionDefinition): void {
  if (!definition.id || typeof definition.id !== "string") {
    throw new Error(`[SectionRegistry] Definition must have a non-empty string id`);
  }
  if (definitions.has(definition.id)) {
    throw new Error(
      `[SectionRegistry] Definition "${definition.id}" is already registered.`
    );
  }
  if (!definition.name) {
    throw new Error(`[SectionRegistry] Definition "${definition.id}" must have a non-empty name`);
  }
  if (!definition.version) {
    throw new Error(`[SectionRegistry] Definition "${definition.id}" must have a version`);
  }

  // Section-level schema
  validateSchemaFieldUniqueness(definition.settingsSchema, `section "${definition.id}"`);

  // Presets
  if (!definition.presets || definition.presets.length === 0) {
    throw new Error(`[SectionRegistry] Definition "${definition.id}" must have at least one preset`);
  }

  const presetKeys = new Set<string>();
  for (const preset of definition.presets) {
    validatePreset(definition.id, preset, presetKeys);
  }

  definitions.set(definition.id, deepFreeze(definition));
}

export function getSectionDefinition(id: SectionDefinitionId): Readonly<SectionDefinition> | undefined {
  return definitions.get(id);
}

export function getAllSectionDefinitions(): ReadonlyArray<Readonly<SectionDefinition>> {
  return Object.freeze([...definitions.values()]);
}

export function getSectionDefinitionsByCategory(
  category: SectionCategory
): ReadonlyArray<Readonly<SectionDefinition>> {
  return Object.freeze([...definitions.values()].filter(d => d.category === category));
}

export function hasSectionDefinition(id: SectionDefinitionId): boolean {
  return definitions.has(id);
}

// ═══════════════════════════════════════════════════════════════
// SECTION RENDERER REGISTRY
// ═══════════════════════════════════════════════════════════════

const renderers = new Map<SectionRendererKey, SectionRendererComponent>();

export function registerSectionRenderer(
  definitionId: string,
  presetKey: string,
  component: SectionRendererComponent
): void {
  const key: SectionRendererKey = `${definitionId}/${presetKey}`;
  if (renderers.has(key)) {
    throw new Error(`[SectionRegistry] Renderer "${key}" is already registered.`);
  }
  renderers.set(key, component);
}

export function getSectionRenderer(
  definitionId: string,
  presetKey: string
): SectionRendererComponent | undefined {
  return renderers.get(`${definitionId}/${presetKey}`);
}

export function hasSectionRenderer(definitionId: string, presetKey: string): boolean {
  return renderers.has(`${definitionId}/${presetKey}`);
}

// ═══════════════════════════════════════════════════════════════
// BOOTSTRAP
// ═══════════════════════════════════════════════════════════════

let bootstrapPromise: Promise<void> | null = null;

export async function ensureSectionsRegistered(): Promise<void> {
  if (definitions.size > 0 && elementDefinitions.size > 0) return;
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = bootstrapSections().catch((err) => {
    // Reset on failure so next call retries
    bootstrapPromise = null;
    throw err;
  });

  return bootstrapPromise;
}

async function bootstrapSections(): Promise<void> {
  const imports: Promise<unknown>[] = [
    import("./elements/index"),
    import("./definitions/index"),
  ];

  if (imports.length === 0) return;

  const results = await Promise.allSettled(imports);
  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("[SectionRegistry] Bootstrap import failed:", result.reason);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION HELPERS (registration-time)
// ═══════════════════════════════════════════════════════════════

function validatePreset(
  defId: string,
  preset: import("./types").SectionPreset,
  seenKeys: Set<string>
): void {
  const ctx = `section "${defId}" preset`;

  if (!preset.key) throw new Error(`[SectionRegistry] ${ctx} has no key`);
  if (seenKeys.has(preset.key)) {
    throw new Error(`[SectionRegistry] ${ctx} "${preset.key}" is duplicate`);
  }
  seenKeys.add(preset.key);

  if (!preset.name) throw new Error(`[SectionRegistry] ${ctx} "${preset.key}" must have a name`);
  if (!preset.version) throw new Error(`[SectionRegistry] ${ctx} "${preset.key}" must have a version`);
  if (!preset.cssClass) throw new Error(`[SectionRegistry] ${ctx} "${preset.key}" must have a cssClass`);

  // Preset-level schema
  validateSchemaFieldUniqueness(preset.settingsSchema, `${ctx} "${preset.key}"`);

  // Block constraints
  if (preset.minBlocks < 0) {
    throw new Error(`[SectionRegistry] ${ctx} "${preset.key}" has negative minBlocks`);
  }
  if (preset.maxBlocks !== -1 && preset.maxBlocks < preset.minBlocks) {
    throw new Error(
      `[SectionRegistry] ${ctx} "${preset.key}" maxBlocks (${preset.maxBlocks}) < minBlocks (${preset.minBlocks})`
    );
  }

  // Block types
  if (!preset.blockTypes || preset.blockTypes.length === 0) {
    throw new Error(`[SectionRegistry] ${ctx} "${preset.key}" must have at least one block type`);
  }

  const blockTypeKeys = new Set<string>();
  for (const bt of preset.blockTypes) {
    validateBlockType(defId, preset.key, bt, blockTypeKeys);
  }
}

function validateBlockType(
  defId: string,
  presetKey: string,
  bt: import("./types").BlockTypeDefinition,
  seenKeys: Set<string>
): void {
  const ctx = `section "${defId}" preset "${presetKey}" block type`;

  if (!bt.type) throw new Error(`[SectionRegistry] ${ctx} has no type key`);
  if (seenKeys.has(bt.type)) {
    throw new Error(`[SectionRegistry] ${ctx} "${bt.type}" is duplicate`);
  }
  seenKeys.add(bt.type);

  if (!bt.version) throw new Error(`[SectionRegistry] ${ctx} "${bt.type}" must have a version`);

  // Block-level schema
  validateSchemaFieldUniqueness(bt.settingsSchema, `${ctx} "${bt.type}"`);

  // Slots
  if (!bt.slots || bt.slots.length === 0) {
    throw new Error(`[SectionRegistry] ${ctx} "${bt.type}" must have at least one slot`);
  }

  const slotKeys = new Set<string>();
  for (const slot of bt.slots) {
    validateSlot(defId, presetKey, bt.type, slot, slotKeys);
  }
}

function validateSlot(
  defId: string,
  presetKey: string,
  blockType: string,
  slot: SlotDefinition,
  seenKeys: Set<string>
): void {
  const ctx = `section "${defId}" preset "${presetKey}" block "${blockType}" slot`;

  if (!slot.key) throw new Error(`[SectionRegistry] ${ctx} has no key`);
  if (seenKeys.has(slot.key)) {
    throw new Error(`[SectionRegistry] ${ctx} "${slot.key}" is duplicate`);
  }
  seenKeys.add(slot.key);

  if (!slot.allowedElements || slot.allowedElements.length === 0) {
    throw new Error(`[SectionRegistry] ${ctx} "${slot.key}" must have at least one allowed element`);
  }

  if (slot.minElements < 0) {
    throw new Error(`[SectionRegistry] ${ctx} "${slot.key}" has negative minElements`);
  }
  if (slot.maxElements !== -1 && slot.maxElements < slot.minElements) {
    throw new Error(
      `[SectionRegistry] ${ctx} "${slot.key}" maxElements (${slot.maxElements}) < minElements (${slot.minElements})`
    );
  }
}

function validateSchemaFieldUniqueness(
  schema: import("@/app/(guest)/_lib/themes/types").SettingField[],
  context: string
): void {
  const keys = new Set<string>();
  for (const field of schema) {
    if (!field.key) throw new Error(`[SectionRegistry] ${context} has a schema field without a key`);
    if (keys.has(field.key)) {
      throw new Error(`[SectionRegistry] ${context} has duplicate schema field key "${field.key}"`);
    }
    keys.add(field.key);
  }
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

function deepFreeze<T extends object>(obj: T): Readonly<T> {
  const propNames = Reflect.ownKeys(obj) as (keyof T)[];
  for (const name of propNames) {
    const value = obj[name];
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      deepFreeze(value as object);
    }
  }
  return Object.freeze(obj);
}

/** @internal Reset all registries (testing only). */
export function __resetSectionRegistry(): void {
  elementDefinitions.clear();
  definitions.clear();
  renderers.clear();
  bootstrapPromise = null;
}
