/**
 * Section Validation
 * ──────────────────
 * Runtime validation for the full Section → Block → Slot → Element tree.
 *
 * Validates:
 *   - Section instance structure (required fields, version, preset)
 *   - Settings at every level (section, preset, block, element)
 *   - Block counts against preset constraints
 *   - Slot structure per block type definition
 *   - Element types against slot allowedElements
 *   - Element counts against slot min/max
 *   - Action validity for action-supporting elements
 *
 * Used in the strict render pipeline: resolve → validate → render.
 */

import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import type {
  SectionDefinition,
  SectionInstance,
  SectionPreset,
  BlockTypeDefinition,
  BlockInstance,
  SlotDefinition,
  ElementDefinition,
  ElementInstance,
  ElementType,
  ElementAction,
  ActionType,
} from "./types";
import { ACTION_TYPES, NO_ACTION } from "./types";
import { getElementDefinition } from "./registry";

// ─── Validation Result ──────────────────────────────────────

export type ValidationError = {
  /** Dot-path to the invalid field. */
  path: string;
  /** Human-readable error message. */
  message: string;
  /** "error" blocks save, "warning" allows save. */
  severity: "error" | "warning";
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
};

// ═══════════════════════════════════════════════════════════════
// SETTING VALUE VALIDATION
// ═══════════════════════════════════════════════════════════════

export function validateSettingValue(
  field: SettingField,
  value: unknown
): { valid: true } | { valid: false; reason: string } {
  if (value === null || value === undefined) return { valid: true };

  switch (field.type) {
    case "toggle":
      return typeof value === "boolean"
        ? { valid: true }
        : { valid: false, reason: `Expected boolean, got ${typeof value}` };

    case "number":
    case "range":
      if (typeof value !== "number" || Number.isNaN(value))
        return { valid: false, reason: `Expected number, got ${typeof value}` };
      if (field.min !== undefined && value < field.min)
        return { valid: false, reason: `${value} < min ${field.min}` };
      if (field.max !== undefined && value > field.max)
        return { valid: false, reason: `${value} > max ${field.max}` };
      return { valid: true };

    case "select":
    case "segmented":
      if (field.options && !field.options.some(o => o.value === value))
        return { valid: false, reason: `"${value}" not in options` };
      return { valid: true };

    case "color":
      if (typeof value !== "string") return { valid: false, reason: `Expected string` };
      return { valid: true };

    case "text":
    case "textarea":
    case "richtext":
    case "url":
    case "image":
      return typeof value === "string"
        ? { valid: true }
        : { valid: false, reason: `Expected string, got ${typeof value}` };

    default:
      return { valid: true };
  }
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS OBJECT VALIDATION
// ═══════════════════════════════════════════════════════════════

export function validateSettings(
  schema: SettingField[],
  defaults: Record<string, unknown>,
  settings: Record<string, unknown>,
  pathPrefix: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const field of schema) {
    const value = settings[field.key];
    // For required check, use merged value (instance override ?? definition default)
    // so that fields with defaults don't fail when the instance has no override.
    const mergedValue = value ?? defaults[field.key];
    if (field.required && (mergedValue === null || mergedValue === undefined || mergedValue === "")) {
      errors.push({ path: `${pathPrefix}.${field.key}`, message: `"${field.label}" is required`, severity: "error" });
      continue;
    }
    // Validate the actual override value (if present) against field type constraints
    if (value !== null && value !== undefined) {
      const result = validateSettingValue(field, value);
      if (!result.valid) {
        errors.push({ path: `${pathPrefix}.${field.key}`, message: `"${field.label}": ${result.reason}`, severity: "error" });
      }
    }
  }

  const schemaKeys = new Set(schema.map(f => f.key));
  for (const key of Object.keys(settings)) {
    if (!schemaKeys.has(key) && !GLOBAL_SETTINGS_KEYS.has(key)) {
      errors.push({ path: `${pathPrefix}.${key}`, message: `Unknown key "${key}"`, severity: "warning" });
    }
  }

  return errors;
}

export function validateSectionSettings(
  definition: SectionDefinition,
  settings: Record<string, unknown>
): ValidationError[] {
  return validateSettings(definition.settingsSchema, definition.settingDefaults, settings, "settings");
}

// ═══════════════════════════════════════════════════════════════
// ACTION VALIDATION
// ═══════════════════════════════════════════════════════════════

export function validateAction(
  action: ElementAction,
  supportsAction: boolean,
  pathPrefix: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!supportsAction && action.type !== "none") {
    errors.push({
      path: `${pathPrefix}.action`,
      message: `Element does not support actions but has action type "${action.type}"`,
      severity: "error",
    });
    return errors;
  }

  if (!ACTION_TYPES.includes(action.type as ActionType)) {
    errors.push({
      path: `${pathPrefix}.action.type`,
      message: `Unknown action type "${action.type}"`,
      severity: "error",
    });
    return errors;
  }

  switch (action.type) {
    case "open_url":
      if (!action.url || typeof action.url !== "string") {
        errors.push({ path: `${pathPrefix}.action.url`, message: "URL is required", severity: "error" });
      }
      break;
    case "open_modal":
      if (!action.modalId || typeof action.modalId !== "string") {
        errors.push({ path: `${pathPrefix}.action.modalId`, message: "Modal ID is required", severity: "error" });
      }
      break;
    case "scroll_to":
      if (!action.sectionId || typeof action.sectionId !== "string") {
        errors.push({ path: `${pathPrefix}.action.sectionId`, message: "Section ID is required", severity: "error" });
      }
      break;
    case "phone":
      if (!action.number || typeof action.number !== "string") {
        errors.push({ path: `${pathPrefix}.action.number`, message: "Phone number is required", severity: "error" });
      }
      break;
    case "email":
      if (!action.address || typeof action.address !== "string") {
        errors.push({ path: `${pathPrefix}.action.address`, message: "Email address is required", severity: "error" });
      }
      break;
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════
// ELEMENT INSTANCE VALIDATION
// ═══════════════════════════════════════════════════════════════

export function validateElementInstance(
  element: ElementInstance,
  allowedTypes: ElementType[],
  pathPrefix: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!element.id) {
    errors.push({ path: `${pathPrefix}.id`, message: "Element must have an ID", severity: "error" });
  }
  if (!element.type) {
    errors.push({ path: `${pathPrefix}.type`, message: "Element must have a type", severity: "error" });
    return errors;
  }

  if (!allowedTypes.includes(element.type)) {
    errors.push({
      path: `${pathPrefix}.type`,
      message: `Type "${element.type}" not allowed. Allowed: ${allowedTypes.join(", ")}`,
      severity: "error",
    });
  }

  const elementDef = getElementDefinition(element.type);
  if (elementDef) {
    errors.push(...validateSettings(
      elementDef.settingsSchema, elementDef.settingDefaults,
      element.settings, `${pathPrefix}.settings`
    ));
    errors.push(...validateAction(element.action, elementDef.supportsAction, pathPrefix));
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════
// SLOT VALIDATION
// ═══════════════════════════════════════════════════════════════

export function validateSlotElements(
  elements: ElementInstance[],
  slotDef: SlotDefinition,
  pathPrefix: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (elements.length < slotDef.minElements) {
    errors.push({
      path: pathPrefix,
      message: `Slot "${slotDef.key}" requires at least ${slotDef.minElements} elements, has ${elements.length}`,
      severity: "warning",
    });
  }
  if (slotDef.maxElements !== -1 && elements.length > slotDef.maxElements) {
    errors.push({
      path: pathPrefix,
      message: `Slot "${slotDef.key}" allows at most ${slotDef.maxElements} elements, has ${elements.length}`,
      severity: "error",
    });
  }

  for (let i = 0; i < elements.length; i++) {
    errors.push(...validateElementInstance(elements[i], slotDef.allowedElements, `${pathPrefix}[${i}]`));
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════
// BLOCK INSTANCE VALIDATION
// ═══════════════════════════════════════════════════════════════

export function validateBlockInstance(
  block: BlockInstance,
  blockType: BlockTypeDefinition,
  pathPrefix: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!block.id) errors.push({ path: `${pathPrefix}.id`, message: "Block must have an ID", severity: "error" });
  if (!block.type) errors.push({ path: `${pathPrefix}.type`, message: "Block must have a type", severity: "error" });
  if (block.type !== blockType.type) {
    errors.push({ path: `${pathPrefix}.type`, message: `Type mismatch: "${block.type}" vs "${blockType.type}"`, severity: "error" });
  }

  // Block-level settings
  errors.push(...validateSettings(blockType.settingsSchema, blockType.settingDefaults, block.settings, `${pathPrefix}.settings`));

  // Validate each slot
  const slotDefMap = new Map(blockType.slots.map(s => [s.key, s]));

  for (const [slotKey, elements] of Object.entries(block.slots)) {
    const slotDef = slotDefMap.get(slotKey);
    if (!slotDef) {
      errors.push({
        path: `${pathPrefix}.slots.${slotKey}`,
        message: `Unknown slot "${slotKey}" in block type "${blockType.type}"`,
        severity: "warning",
      });
      continue;
    }
    errors.push(...validateSlotElements(elements, slotDef, `${pathPrefix}.slots.${slotKey}`));
  }

  // Check for missing required slots
  for (const slotDef of blockType.slots) {
    const elements = block.slots[slotDef.key];
    if (!elements && slotDef.minElements > 0) {
      errors.push({
        path: `${pathPrefix}.slots.${slotDef.key}`,
        message: `Required slot "${slotDef.key}" is missing`,
        severity: "warning",
      });
    }
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════
// SECTION INSTANCE VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Full tree validation: section → blocks → slots → elements.
 *
 * @param colorSchemes  Tenant-level color schemes for validating colorSchemeId references.
 *                      Optional for backward compatibility — omit to skip scheme validation.
 */
export function validateSectionInstance(
  instance: SectionInstance,
  definition: SectionDefinition,
  colorSchemes?: import("@/app/_lib/color-schemes/types").ColorScheme[],
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const classify = (errs: ValidationError[]) => {
    for (const err of errs) {
      (err.severity === "error" ? errors : warnings).push(err);
    }
  };

  // 1. Required fields
  if (!instance.id) errors.push({ path: "id", message: "Section must have an ID", severity: "error" });
  if (!instance.definitionId) errors.push({ path: "definitionId", message: "Missing definitionId", severity: "error" });
  if (instance.definitionId !== definition.id) {
    errors.push({ path: "definitionId", message: `Mismatch: "${instance.definitionId}" vs "${definition.id}"`, severity: "error" });
  }

  // 2. Preset validity
  if (!instance.presetKey) {
    errors.push({ path: "presetKey", message: "Missing presetKey", severity: "error" });
    return { valid: false, errors, warnings };
  }

  const preset = definition.presets.find(p => p.key === instance.presetKey);
  if (!preset) {
    errors.push({
      path: "presetKey",
      message: `Preset "${instance.presetKey}" not found. Available: ${definition.presets.map(p => p.key).join(", ")}`,
      severity: "error",
    });
    return { valid: false, errors, warnings };
  }

  // 3. Version warnings
  if (instance.definitionVersion !== definition.version) {
    warnings.push({
      path: "definitionVersion",
      message: `Instance version "${instance.definitionVersion}" differs from definition "${definition.version}" — migration may be needed`,
      severity: "warning",
    });
  }
  if (instance.presetVersion !== preset.version) {
    warnings.push({
      path: "presetVersion",
      message: `Instance preset version "${instance.presetVersion}" differs from preset "${preset.version}" — migration may be needed`,
      severity: "warning",
    });
  }

  // 3b. Color scheme reference
  if (instance.colorSchemeId && colorSchemes) {
    const found = colorSchemes.some((s) => s.id === instance.colorSchemeId);
    if (!found) {
      warnings.push({
        path: "colorSchemeId",
        message: `Color scheme "${instance.colorSchemeId}" not found — section inherits page-level tokens`,
        severity: "warning",
      });
    }
  }

  // 4. Section-level settings
  classify(validateSectionSettings(definition, instance.settings));

  // 5. Preset-level settings
  classify(validateSettings(preset.settingsSchema, preset.settingDefaults, instance.presetSettings, "presetSettings"));

  // 6. Block count
  const blockCount = instance.blocks.length;
  if (blockCount < preset.minBlocks) {
    warnings.push({ path: "blocks", message: `Preset requires ≥${preset.minBlocks} blocks, has ${blockCount}`, severity: "warning" });
  }
  if (preset.maxBlocks !== -1 && blockCount > preset.maxBlocks) {
    errors.push({ path: "blocks", message: `Preset allows ≤${preset.maxBlocks} blocks, has ${blockCount}`, severity: "error" });
  }

  // 7. Validate each block
  const blockTypeMap = new Map(preset.blockTypes.map(bt => [bt.type, bt]));

  for (let i = 0; i < instance.blocks.length; i++) {
    const block = instance.blocks[i];
    const blockType = blockTypeMap.get(block.type);

    if (!blockType) {
      errors.push({
        path: `blocks[${i}].type`,
        message: `Block type "${block.type}" not in preset "${preset.key}". Available: ${preset.blockTypes.map(bt => bt.type).join(", ")}`,
        severity: "error",
      });
      continue;
    }

    classify(validateBlockInstance(block, blockType, `blocks[${i}]`));
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS RESOLUTION & SANITIZATION
// ═══════════════════════════════════════════════════════════════

export function sanitizeSettings(
  schema: SettingField[],
  settings: Record<string, unknown>
): Record<string, unknown> {
  const keys = new Set(schema.map(f => f.key));
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(settings)) {
    if (keys.has(k)) result[k] = v;
  }
  return result;
}

// Keys that are global across all levels (section, block, element)
// and should always pass through regardless of schema.
const GLOBAL_SETTINGS_KEYS = new Set([
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "radiusTopLeft", "radiusTopRight", "radiusBottomRight", "radiusBottomLeft",
  "scheduledShow", "scheduledHide",
]);

export function resolveSettings(
  schema: SettingField[],
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...defaults };
  const keys = new Set(schema.map(f => f.key));
  for (const [k, v] of Object.entries(overrides)) {
    if ((keys.has(k) || GLOBAL_SETTINGS_KEYS.has(k)) && v !== undefined) merged[k] = v;
  }
  return merged;
}

// Convenience wrappers

export function sanitizeSectionSettings(def: SectionDefinition, settings: Record<string, unknown>) {
  return sanitizeSettings(def.settingsSchema, settings);
}

export function resolveSectionSettings(def: SectionDefinition, overrides: Record<string, unknown>) {
  return resolveSettings(def.settingsSchema, def.settingDefaults, overrides);
}

export function resolvePresetSettings(preset: SectionPreset, overrides: Record<string, unknown>) {
  return resolveSettings(preset.settingsSchema, preset.settingDefaults, overrides);
}

export function resolveBlockSettings(bt: BlockTypeDefinition, overrides: Record<string, unknown>) {
  return resolveSettings(bt.settingsSchema, bt.settingDefaults, overrides);
}

export function resolveElementSettings(def: ElementDefinition, overrides: Record<string, unknown>) {
  return resolveSettings(def.settingsSchema, def.settingDefaults, overrides);
}
