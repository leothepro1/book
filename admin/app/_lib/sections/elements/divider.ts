import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

export const dividerElement: ElementDefinition = {
  type: "divider",
  version: "1.0.0",
  name: "Avgränsare",
  description: "Visuell separationslinje.",
  icon: "horizontal_rule",
  supportsAction: false,

  skipPresetPicker: true,

  settingsSchema: [
    {
      key: "thickness",
      type: "range",
      label: "Tjocklek",
      default: 1,
      min: 1,
      max: 8,
      step: 1,
      unit: "px",
    },
    {
      key: "style",
      type: "select",
      label: "Linjestil",
      default: "solid",
      options: [
        { value: "solid", label: "Heldragen" },
        { value: "dashed", label: "Streckad" },
        { value: "dotted", label: "Prickad" },
      ],
    },
  ],

  settingDefaults: {
    thickness: 1,
    style: "solid",
  },

  presets: [
    {
      key: "default",
      name: "Avgränsare",
      description: "Heldragen linje",
      thumbnail: "",
      settingOverrides: {},
    },
  ],
};

registerElementDefinition(dividerElement);
