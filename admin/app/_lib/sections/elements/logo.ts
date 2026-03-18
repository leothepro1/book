import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Logo element — "Logotyp".
 *
 * Renders the tenant's logo from config.theme.header.logoUrl.
 * No image upload — the logo is configured once in header settings.
 *
 * Element settings control display only:
 *   - alignment: horizontal placement (left / center / right)
 *   - width: logo width in pixels
 */
export const logoElement: ElementDefinition = {
  type: "logo",
  version: "1.0.0",
  name: "Logotyp",
  description: "Visa verksamhetens logotyp.",
  icon: "image",
  supportsAction: false,
  skipPresetPicker: true,

  settingsSchema: [
    {
      key: "alignment",
      type: "segmented",
      label: "Placering",
      default: "center",
      options: [
        { value: "left", label: "Vänster" },
        { value: "center", label: "Centrerad" },
        { value: "right", label: "Höger" },
      ],
    },
    {
      key: "width",
      type: "range",
      label: "Bredd",
      default: 120,
      min: 40,
      max: 300,
      step: 5,
      unit: "px",
    },
  ],

  settingDefaults: {
    alignment: "center",
    width: 120,
  },

  presets: [
    {
      key: "default",
      name: "Logotyp",
      description: "Visa verksamhetens logotyp",
      thumbnail: "",
      settingOverrides: {},
    },
  ],
};

registerElementDefinition(logoElement);
