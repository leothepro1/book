import { describe, it, expect } from "vitest";
import { validateSettingValue, validateSlotSettings } from "../validation";
import type { SettingField } from "../types";

// ─── Toggle ──────────────────────────────────────────────

describe("validateSettingValue — toggle", () => {
  const field: SettingField = { key: "show", type: "toggle", label: "Show" };

  it("accepts boolean true", () => {
    expect(validateSettingValue(field, true)).toEqual({ valid: true });
  });

  it("accepts boolean false", () => {
    expect(validateSettingValue(field, false)).toEqual({ valid: true });
  });

  it("rejects string", () => {
    const r = validateSettingValue(field, "true");
    expect(r.valid).toBe(false);
  });

  it("rejects number", () => {
    const r = validateSettingValue(field, 1);
    expect(r.valid).toBe(false);
  });

  it("accepts null (resets to default)", () => {
    expect(validateSettingValue(field, null)).toEqual({ valid: true });
  });
});

// ─── Number / Range ──────────────────────────────────────

describe("validateSettingValue — number", () => {
  const field: SettingField = {
    key: "padding",
    type: "number",
    label: "Padding",
    min: 0,
    max: 32,
    step: 1,
  };

  it("accepts valid number", () => {
    expect(validateSettingValue(field, 16)).toEqual({ valid: true });
  });

  it("accepts min boundary", () => {
    expect(validateSettingValue(field, 0)).toEqual({ valid: true });
  });

  it("accepts max boundary", () => {
    expect(validateSettingValue(field, 32)).toEqual({ valid: true });
  });

  it("rejects below min", () => {
    const r = validateSettingValue(field, -1);
    expect(r.valid).toBe(false);
  });

  it("rejects above max", () => {
    const r = validateSettingValue(field, 999);
    expect(r.valid).toBe(false);
  });

  it("rejects NaN", () => {
    const r = validateSettingValue(field, NaN);
    expect(r.valid).toBe(false);
  });

  it("rejects string", () => {
    const r = validateSettingValue(field, "16");
    expect(r.valid).toBe(false);
  });
});

// ─── Select ──────────────────────────────────────────────

describe("validateSettingValue — select", () => {
  const field: SettingField = {
    key: "columns",
    type: "select",
    label: "Kolumner",
    options: [
      { value: "2", label: "2" },
      { value: "3", label: "3" },
    ],
  };

  it("accepts valid option", () => {
    expect(validateSettingValue(field, "2")).toEqual({ valid: true });
  });

  it("rejects invalid option", () => {
    const r = validateSettingValue(field, "5");
    expect(r.valid).toBe(false);
  });

  it("rejects number type", () => {
    const r = validateSettingValue(field, 2);
    expect(r.valid).toBe(false);
  });
});

// ─── Color ───────────────────────────────────────────────

describe("validateSettingValue — color", () => {
  const field: SettingField = { key: "bg", type: "color", label: "Bakgrund" };

  it("accepts #RRGGBB", () => {
    expect(validateSettingValue(field, "#FF0000")).toEqual({ valid: true });
  });

  it("accepts #RGB", () => {
    expect(validateSettingValue(field, "#F00")).toEqual({ valid: true });
  });

  it("accepts #RRGGBBAA", () => {
    expect(validateSettingValue(field, "#FF0000AA")).toEqual({ valid: true });
  });

  it("rejects missing hash", () => {
    const r = validateSettingValue(field, "FF0000");
    expect(r.valid).toBe(false);
  });

  it("rejects rgb()", () => {
    const r = validateSettingValue(field, "rgb(255,0,0)");
    expect(r.valid).toBe(false);
  });

  it("rejects invalid hex chars", () => {
    const r = validateSettingValue(field, "#GGGGGG");
    expect(r.valid).toBe(false);
  });
});

// ─── Text / URL / Image ─────────────────────────────────

describe("validateSettingValue — text types", () => {
  const field: SettingField = { key: "title", type: "text", label: "Titel" };

  it("accepts string", () => {
    expect(validateSettingValue(field, "Hello")).toEqual({ valid: true });
  });

  it("accepts empty string", () => {
    expect(validateSettingValue(field, "")).toEqual({ valid: true });
  });

  it("rejects number", () => {
    const r = validateSettingValue(field, 42);
    expect(r.valid).toBe(false);
  });
});

// ─── validateSlotSettings ────────────────────────────────

describe("validateSlotSettings", () => {
  const schema: SettingField[] = [
    { key: "show", type: "toggle", label: "Show", default: true },
    { key: "padding", type: "number", label: "Padding", min: 0, max: 32 },
    { key: "color", type: "color", label: "Färg" },
  ];

  it("returns empty array for valid settings", () => {
    const errors = validateSlotSettings(schema, {
      show: true,
      padding: 16,
      color: "#FF0000",
    });
    expect(errors).toEqual([]);
  });

  it("returns errors for invalid settings", () => {
    const errors = validateSlotSettings(schema, {
      show: "yes",
      padding: 999,
      color: "red",
    });
    expect(errors).toHaveLength(3);
    expect(errors[0].key).toBe("show");
    expect(errors[1].key).toBe("padding");
    expect(errors[2].key).toBe("color");
  });

  it("skips undefined values", () => {
    const errors = validateSlotSettings(schema, {});
    expect(errors).toEqual([]);
  });
});
