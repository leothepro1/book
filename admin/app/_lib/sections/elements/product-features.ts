import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Product Features element — 3×2 icon grid.
 * 6 items: icon + title, 3 per row, 2 rows.
 * Reads facilities from product context.
 * Product-page scoped.
 */
export const productFeaturesElement: ElementDefinition = {
  type: "product-features",
  version: "1.0.0",
  name: "Produktegenskaper",
  description: "Rutnät med ikoner och egenskaper (3×2).",
  icon: "grid_view",
  supportsAction: false,
  skipPresetPicker: true,
  pageScope: "product",

  settingsSchema: [
    {
      key: "columns",
      type: "select",
      label: "Kolumner",
      default: "3",
      options: [
        { value: "2", label: "2 per rad" },
        { value: "3", label: "3 per rad" },
      ],
    },
    {
      key: "iconSize",
      type: "range",
      label: "Ikonstorlek",
      default: 20,
      min: 16,
      max: 32,
      step: 4,
      unit: "px",
    },
  ],

  settingDefaults: {
    columns: "3",
    iconSize: 20,
  },

  presets: [
    {
      key: "default",
      name: "Produktegenskaper",
      description: "3×2 ikon-rutnät",
      thumbnail: "",
      settingOverrides: {},
    },
  ],
};

registerElementDefinition(productFeaturesElement);
