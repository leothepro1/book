import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Accommodation Capacity element — inline dot-separated list.
 * Shows: "4 gäster · 2 sovrum · 1 badrum · 45 m²"
 * Reads from ProductContext capacity fields.
 * Product-page scoped.
 */
export const accommodationCapacityElement: ElementDefinition = {
  type: "accommodation-capacity",
  version: "1.0.0",
  name: "Boendekapacitet",
  description: "Visar kapacitet som en rad med punkter: gäster · sovrum · badrum · m²",
  icon: "group",
  supportsAction: false,
  skipPresetPicker: true,
  pageScope: "product",

  settingsSchema: [],
  settingDefaults: {},

  presets: [
    {
      key: "default",
      name: "Boendekapacitet",
      description: "Dot-separerad kapacitetsrad",
      thumbnail: "",
      settingOverrides: {},
    },
  ],
};

registerElementDefinition(accommodationCapacityElement);
