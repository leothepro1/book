import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

export const iconElement: ElementDefinition = {
  type: "icon",
  version: "2.0.0",
  name: "Ikon",
  description: "Google Material Symbol med valfri storlek och färg.",
  icon: "star",
  supportsAction: true,
  skipPresetPicker: true,

  settingsSchema: [
    {
      key: "name",
      type: "text",
      label: "Ikon",
      descriptionLink: {
        href: "https://fonts.google.com/icons",
        label: "Se tillgängliga ikoner",
      },
      default: "star",
    },
    {
      key: "fill",
      type: "segmented",
      label: "Stil",
      default: "outlined",
      options: [
        { value: "outlined", label: "Kontur" },
        { value: "filled", label: "Fylld" },
      ],
    },
    {
      key: "size",
      type: "range",
      label: "Storlek",
      default: 24,
      min: 16,
      max: 96,
      step: 4,
      unit: "px",
    },
    {
      key: "weight",
      type: "weightRange",
      label: "Vikt",
      default: 400,
      min: 100,
      max: 700,
      step: 100,
    },
    {
      key: "color",
      type: "color",
      label: "Färg",
      default: "#1a1a1a",
    },
    {
      key: "link",
      type: "link",
      label: "Länk",
      hidden: true,
    },
  ],

  settingDefaults: {
    name: "star",
    fill: "outlined",
    size: 24,
    weight: 400,
    color: "#1a1a1a",
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
