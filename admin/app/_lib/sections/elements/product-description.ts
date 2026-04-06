import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Product Description element — produktsida-specifik beskrivning.
 *
 * Identisk med text-elementet i panel, ikon och inställningar,
 * men scoped till produktsidan. Renderar produktens beskrivning
 * automatiskt när den placeras på en produktsida.
 */
export const productDescriptionElement: ElementDefinition = {
  type: "product-description",
  version: "1.0.0",
  name: "Produktbeskrivning",
  description: "Visar produktens beskrivning automatiskt.",
  icon: "view_headline",
  supportsAction: false,
  skipPresetPicker: true,
  pageScope: ["product", "shop-product"],

  settingsSchema: [
    {
      key: "size",
      type: "select",
      label: "Textstorlek",
      default: "md",
      options: [
        { value: "xs", label: "Extra liten" },
        { value: "sm", label: "Liten" },
        { value: "md", label: "Medium" },
        { value: "lg", label: "Stor" },
      ],
    },
    {
      key: "alignment",
      type: "segmented",
      label: "Justering",
      default: "left",
      options: [
        { value: "left", label: "Vänster" },
        { value: "center", label: "Center" },
        { value: "right", label: "Höger" },
      ],
    },
  ],

  settingDefaults: {
    size: "md",
    alignment: "left",
  },

  presets: [
    {
      key: "default",
      name: "Produktbeskrivning",
      description: "Produktens beskrivning",
      thumbnail: "",
      settingOverrides: {},
    },
  ],
};

registerElementDefinition(productDescriptionElement);
