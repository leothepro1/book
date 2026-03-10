import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

export const iconElement: ElementDefinition = {
  type: "icon",
  version: "1.0.0",
  name: "Ikon",
  description: "Ikonvisning med valfri storlek och färg.",
  icon: "icon",
  supportsAction: true,

  settingsSchema: [
    {
      key: "name",
      type: "text",
      label: "Ikonnamn",
      description: "Phosphor-ikonnamn (t.ex. 'MapPin', 'Phone').",
      default: "Star",
      required: true,
    },
    {
      key: "size",
      type: "range",
      label: "Storlek",
      default: 24,
      min: 12,
      max: 64,
      step: 4,
    },
    {
      key: "color",
      type: "color",
      label: "Färg",
      default: "#1a1a1a",
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
    {
      key: "link",
      type: "link",
      label: "Länk",
    },
  ],

  settingDefaults: {
    name: "Star",
    size: 24,
    color: "#1a1a1a",
    alignment: "left",
    link: null,
  },

  presets: [
    {
      key: "default",
      name: "Ikon",
      description: "Standard ikon",
      thumbnail: "",
      settingOverrides: {},
    },
  ],
};

registerElementDefinition(iconElement);
