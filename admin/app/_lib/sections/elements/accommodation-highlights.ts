import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Accommodation Highlights element — vertical icon list.
 * Each item: icon + title + description, stacked vertically.
 * Reads from ProductContext.highlights (populated from AccommodationHighlight DB model).
 * Product-page scoped.
 */
export const accommodationHighlightsElement: ElementDefinition = {
  type: "accommodation-highlights",
  version: "1.0.0",
  name: "Boendehöjdpunkter",
  description: "Vertikal ikon-lista med höjdpunkter, rubrik och beskrivning.",
  icon: "format_list_bulleted",
  supportsAction: false,
  skipPresetPicker: true,
  pageScope: "product",

  settingsSchema: [
    {
      key: "iconSize",
      type: "range",
      label: "Ikonstorlek",
      default: 28,
      min: 16,
      max: 48,
      step: 4,
      unit: "px",
    },
    {
      key: "gap",
      type: "range",
      label: "Avstånd",
      default: 20,
      min: 8,
      max: 40,
      step: 4,
      unit: "px",
    },
  ],

  settingDefaults: {
    iconSize: 28,
    gap: 20,
  },

  presets: [
    {
      key: "default",
      name: "Boendehöjdpunkter",
      description: "Vertikal ikon-lista",
      thumbnail: "",
      settingOverrides: {},
    },
  ],
};

registerElementDefinition(accommodationHighlightsElement);
