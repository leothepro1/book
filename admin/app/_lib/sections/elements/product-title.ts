import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Product Title element — produktsida-specifik rubrik.
 *
 * Identisk med heading-elementet i panel, ikon och inställningar,
 * men scoped till produktsidan. Renderar produktens titel automatiskt
 * när den placeras på en produktsida.
 */
export const productTitleElement: ElementDefinition = {
  type: "product-title",
  version: "1.0.0",
  name: "Produkttitel",
  description: "Visar produktens titel automatiskt.",
  icon: "title",
  supportsAction: false,
  skipPresetPicker: true,
  pageScope: "product",

  settingsSchema: [
    {
      key: "size",
      type: "select",
      label: "Textstorlek",
      default: "lg",
      options: [
        { value: "xs", label: "Extra liten" },
        { value: "sm", label: "Liten" },
        { value: "md", label: "Medium" },
        { value: "lg", label: "Stor" },
        { value: "xl", label: "Extra stor" },
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
    size: "lg",
    alignment: "left",
  },

  presets: [
    {
      key: "default",
      name: "Produkttitel",
      description: "Produktens titel",
      thumbnail: "",
      settingOverrides: {},
    },
  ],
};

registerElementDefinition(productTitleElement);
