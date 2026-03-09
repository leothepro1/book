import { describe, it, expect } from "vitest";
import { sanitizeSectionSettings } from "../sanitizeSettings";
import type { ThemeManifest, TenantSectionSettings } from "../types";

// Minimal manifest factory
function makeManifest(
  id: string,
  slots: { id: string; schemaKeys: string[]; defaultKeys?: string[] }[],
): ThemeManifest {
  return {
    id,
    name: id,
    version: "1.0.0",
    author: { name: "test" },
    description: "",
    thumbnail: "",
    previewImages: [],
    tags: [],
    settings: [],
    settingDefaults: {},
    detail: { heading: "", description: "", features: [] },
    designPreset: {} as any,
    sectionGroups: { header: [], footer: [] },
    templates: {
      home: {
        name: "Home",
        sections: slots.map((s, i) => ({
          id: s.id,
          type: s.id,
          variant: "default",
          order: i,
          defaults: Object.fromEntries((s.defaultKeys ?? []).map((k) => [k, null])),
          schema: s.schemaKeys.map((k) => ({
            key: k,
            type: "text" as const,
            label: k,
          })),
        })),
      },
    },
  };
}

describe("sanitizeSectionSettings", () => {
  const manifest = makeManifest("classic", [
    { id: "hero", schemaKeys: ["heroImageUrl", "title"] },
    { id: "info-bar", schemaKeys: ["showWeather"], defaultKeys: ["showBookingStatus"] },
  ]);

  it("keeps valid namespaced settings", () => {
    const settings: TenantSectionSettings = {
      "classic:hero": { heroImageUrl: "/img.png", title: "Hello" },
      "classic:info-bar": { showWeather: true },
    };
    const result = sanitizeSectionSettings(settings, manifest);
    expect(result).toEqual(settings);
  });

  it("strips orphaned slots", () => {
    const settings: TenantSectionSettings = {
      "classic:hero": { heroImageUrl: "/img.png" },
      "classic:deleted-section": { foo: "bar" },
    };
    const result = sanitizeSectionSettings(settings, manifest);
    expect(result).toEqual({
      "classic:hero": { heroImageUrl: "/img.png" },
    });
  });

  it("strips orphaned field keys within valid slots", () => {
    const settings: TenantSectionSettings = {
      "classic:hero": { heroImageUrl: "/img.png", deletedField: "stale", title: "Hello" },
    };
    const result = sanitizeSectionSettings(settings, manifest);
    expect(result).toEqual({
      "classic:hero": { heroImageUrl: "/img.png", title: "Hello" },
    });
  });

  it("preserves settings from other themes", () => {
    const settings: TenantSectionSettings = {
      "classic:hero": { heroImageUrl: "/img.png" },
      "immersive:hero-slider": { gradientColor: "#000" },
    };
    const result = sanitizeSectionSettings(settings, manifest);
    expect(result).toEqual({
      "classic:hero": { heroImageUrl: "/img.png" },
      "immersive:hero-slider": { gradientColor: "#000" },
    });
  });

  it("preserves default keys even if not in schema", () => {
    const settings: TenantSectionSettings = {
      "classic:info-bar": { showWeather: true, showBookingStatus: false },
    };
    const result = sanitizeSectionSettings(settings, manifest);
    expect(result).toEqual({
      "classic:info-bar": { showWeather: true, showBookingStatus: false },
    });
  });

  it("handles bare keys (legacy backwards-compat)", () => {
    const settings: TenantSectionSettings = {
      hero: { heroImageUrl: "/legacy.png" },
    };
    const result = sanitizeSectionSettings(settings, manifest);
    expect(result).toEqual({
      hero: { heroImageUrl: "/legacy.png" },
    });
  });

  it("returns empty for fully orphaned settings", () => {
    const settings: TenantSectionSettings = {
      "classic:old-section": { old: "value" },
    };
    const result = sanitizeSectionSettings(settings, manifest);
    expect(result).toEqual({});
  });
});
