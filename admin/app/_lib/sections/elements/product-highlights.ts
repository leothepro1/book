import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Product Highlights element — vertical icon list.
 * Each item: icon + heading + subtitle, stacked vertically.
 * Reads from product pmsData.facilities or custom config.
 * Product-page scoped.
 */
export const productHighlightsElement: ElementDefinition = {
  type: "product-highlights",
  version: "1.0.0",
  name: "Produkthöjdpunkter",
  description: "Vertikal ikon-lista med höjdpunkter.",
  icon: "format_list_bulleted",
  supportsAction: false,
  skipPresetPicker: true,
  pageScope: "product",

  settingsSchema: [
    {
      key: "iconSize",
      type: "range",
      label: "Ikonstorlek",
      default: 24,
      min: 16,
      max: 40,
      step: 4,
      unit: "px",
    },
  ],

  settingDefaults: {
    iconSize: 24,
  },

  presets: [
    {
      key: "default",
      name: "Produkthöjdpunkter",
      description: "Vertikal ikon-lista",
      thumbnail: "",
      settingOverrides: {},
    },
  ],
};

registerElementDefinition(productHighlightsElement);
