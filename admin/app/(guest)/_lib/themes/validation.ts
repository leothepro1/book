/**
 * Theme Settings Validation
 *
 * Runtime validation for section setting values against their schema.
 * Used by the admin configure view to ensure only valid values reach the DB.
 *
 * Returns null if valid, or an error message string if invalid.
 */

import type { SettingField } from "./types";

export type ValidationResult = { valid: true } | { valid: false; reason: string };

/**
 * Validate a single setting value against its field schema.
 */
export function validateSettingValue(field: SettingField, value: unknown): ValidationResult {
  // Null/undefined always allowed (resets to default)
  if (value === null || value === undefined) {
    return { valid: true };
  }

  switch (field.type) {
    case "toggle": {
      if (typeof value !== "boolean") {
        return { valid: false, reason: `"${field.key}" must be boolean, got ${typeof value}` };
      }
      return { valid: true };
    }

    case "number":
    case "range": {
      if (typeof value !== "number" || Number.isNaN(value)) {
        return { valid: false, reason: `"${field.key}" must be a number` };
      }
      if (field.min !== undefined && value < field.min) {
        return { valid: false, reason: `"${field.key}" must be >= ${field.min}` };
      }
      if (field.max !== undefined && value > field.max) {
        return { valid: false, reason: `"${field.key}" must be <= ${field.max}` };
      }
      return { valid: true };
    }

    case "select": {
      if (typeof value !== "string") {
        return { valid: false, reason: `"${field.key}" must be a string` };
      }
      if (field.options && field.options.length > 0) {
        const allowed = field.options.map((o) => o.value);
        if (!allowed.includes(value)) {
          return { valid: false, reason: `"${field.key}" must be one of: ${allowed.join(", ")}` };
        }
      }
      return { valid: true };
    }

    case "color": {
      if (typeof value !== "string") {
        return { valid: false, reason: `"${field.key}" must be a color string` };
      }
      // Accept #RGB, #RRGGBB, #RRGGBBAA
      if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) {
        return { valid: false, reason: `"${field.key}" must be a valid hex color` };
      }
      return { valid: true };
    }

    case "text":
    case "textarea":
    case "richtext":
    case "url":
    case "image": {
      if (typeof value !== "string") {
        return { valid: false, reason: `"${field.key}" must be a string` };
      }
      return { valid: true };
    }

    default: {
      // Exhaustive check — if a new SettingFieldType is added but not handled here,
      // TypeScript will flag this at compile time (value of `field.type` won't be `never`)
      const _exhaustive: never = field.type;
      void _exhaustive;
      return { valid: true };
    }
  }
}

/**
 * Validate a full settings object against a slot's schema.
 * Returns an array of validation errors (empty = all valid).
 */
export function validateSlotSettings(
  schema: SettingField[],
  values: Record<string, unknown>,
): { key: string; reason: string }[] {
  const errors: { key: string; reason: string }[] = [];

  for (const field of schema) {
    const value = values[field.key];
    if (value === undefined) continue; // Not set — will use default

    const result = validateSettingValue(field, value);
    if (!result.valid) {
      errors.push({ key: field.key, reason: result.reason });
    }
  }

  return errors;
}
