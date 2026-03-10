import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

export const dividerElement: ElementDefinition = {
  type: "divider",
  version: "1.0.0",
  name: "Avgränsare",
  description: "Visuell separationslinje.",
  icon: "divider",
  supportsAction: false,

  settingsSchema: [
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
    {
      key: "color",
      type: "color",
      label: "Färg",
      default: "#E6E5E3",
    },
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
      key: "spacing",
      type: "range",
      label: "Avstånd",
      default: 16,
      min: 4,
      max: 64,
      step: 4,
      unit: "px",
    },
    {
      key: "link",
      type: "link",
      label: "Länk",
    },
  ],

  settingDefaults: {
    style: "solid",
    color: "#E6E5E3",
    thickness: 1,
    spacing: 16,
    link: null,
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
