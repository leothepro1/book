import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Accommodation Facilities element.
 * Shows facilities in 2-col grid (max 10), then "Visa alla X bekvämligheter"
 * button that opens a categorized modal with all facilities + icons.
 * Product-page scoped.
 */
export const accommodationFacilitiesElement: ElementDefinition = {
  type: "accommodation-facilities",
  version: "1.0.0",
  name: "Boendefaciliteter",
  description: "Visar faciliteter i rutnät med ikoner och kategoriserad modal.",
  icon: "check_circle",
  supportsAction: false,
  skipPresetPicker: true,
  pageScope: "product",

  settingsSchema: [],
  settingDefaults: {},

  presets: [
    {
      key: "default",
      name: "Boendefaciliteter",
      description: "2-kolumns rutnät + modal",
      thumbnail: "",
      settingOverrides: {},
    },
  ],
};

registerElementDefinition(accommodationFacilitiesElement);
