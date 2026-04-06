import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Product Price element — visar totalpris.
 * Läser pris från ProductContext (PMS-pris vid runtime).
 * Product-page scoped.
 */
export const productPriceElement: ElementDefinition = {
  type: "product-price",
  version: "1.0.0",
  name: "Produktpris",
  description: "Visar totalpris för produkten.",
  icon: "payments",
  supportsAction: false,
  skipPresetPicker: true,
  pageScope: ["product", "shop-product"],

  settingsSchema: [
    {
      key: "size",
      type: "select",
      label: "Textstorlek",
      default: "lg",
      options: [
        { value: "md", label: "Medium" },
        { value: "lg", label: "Stor" },
        { value: "xl", label: "Extra stor" },
      ],
    },
  ],

  settingDefaults: {
    size: "lg",
  },

  presets: [
    {
      key: "default",
      name: "Produktpris",
      description: "Totalpris",
      thumbnail: "",
      settingOverrides: {},
    },
  ],
};

registerElementDefinition(productPriceElement);
