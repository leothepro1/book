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

    case "select":
    case "segmented": {
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

    case "link": {
      // Link is either null (no link) or an object with type/target/payload
      if (value === null || value === undefined) return { valid: true };
      if (typeof value !== "object") {
        return { valid: false, reason: `"${field.key}" must be a link object or null` };
      }
      return { valid: true };
    }

    case "cornerRadius": {
      // Virtual composite field — actual values stored in separate keys
      return { valid: true };
    }

    case "weightRange": {
      // Numeric range with snap points
      if (value == null) return { valid: true };
      const wVal = value as number;
      if (typeof wVal !== "number" || isNaN(wVal)) {
        return { valid: false, reason: `"${field.key}" must be a number` };
      }
      if (field.min != null && wVal < field.min) {
        return { valid: false, reason: `"${field.key}" below min ${field.min}` };
      }
      if (field.max != null && wVal > field.max) {
        return { valid: false, reason: `"${field.key}" above max ${field.max}` };
      }
      return { valid: true };
    }

    case "markers":
      // JSON string — validated by the FieldMarkers component
      return { valid: true };

    case "mapPicker": {
      // Map ID string — references a saved MapConfig
      if (value != null && typeof value !== "string") {
        return { valid: false, reason: `"${field.key}" must be a map ID string` };
      }
      return { valid: true };
    }

    case "video": {
      // Video URL string
      if (value != null && typeof value !== "string") {
        return { valid: false, reason: `"${field.key}" must be a video URL string` };
      }
      return { valid: true };
    }

    case "imageList": {
      if (value != null && !Array.isArray(value)) {
        return { valid: false, reason: `"${field.key}" must be an array of gallery image objects` };
      }
      return { valid: true };
    }

    case "layoutPicker":
    case "menuPicker":
    case "collectionPicker":
    case "productPicker":
    case "accommodationPicker":
    case "fontPicker": {
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
