import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Image element — placed inside a styled container.
 *
 * The container controls visual presentation (presets).
 * Settings expose: src, width (%), height (px), border-radius (4 corners),
 * and overlay (0–100% black).
 */
export const imageElement: ElementDefinition = {
  type: "image",
  version: "2.0.0",
  name: "Bild",
  description: "Bildelement med container-styling.",
  icon: "image",
  supportsAction: true,
  skipPresetPicker: true,

  settingsSchema: [
    {
      key: "src",
      type: "image",
      label: "Bild",
      default: "",
      required: true,
    },
    {
      key: "width",
      type: "range",
      label: "Bredd",
      default: 100,
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
    },
    {
      key: "height",
      type: "range",
      label: "Höjd",
      default: 300,
      min: 0,
      max: 800,
      step: 1,
      unit: "px",
    },
    {
      key: "cornerRadius",
      type: "cornerRadius",
      label: "Hörnradie",
      default: 0,
    },
    {
      key: "overlay",
      type: "range",
      label: "Överläggning",
      default: 0,
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
    },
    {
      key: "link",
      type: "link",
      label: "Länk",
      hidden: true,
    },
  ],

  settingDefaults: {
    src: "",
    width: 100,
    height: 300,
    radiusTopLeft: 0,
    radiusTopRight: 0,
    radiusBottomRight: 0,
    radiusBottomLeft: 0,
    overlay: 0,
    link: null,
  },

  presets: [
    {
      key: "default",
      name: "Bild",
      description: "Standard bildelement",
      thumbnail: "",
      settingOverrides: {},
    },
  ],
};

registerElementDefinition(imageElement);
