import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Button element — "Knappar".
 *
 * All visual styling (colors, radius, shadow, font, solid vs outline)
 * is inherited from tenantConfig via CSS custom properties.
 * The editor only exposes label and link.
 *
 * Presets control structural layout: icon placement (left/right/none)
 * and whether the icon sits in a circle badge.
 */
export const buttonElement: ElementDefinition = {
  type: "button",
  version: "2.0.0",
  name: "Knappar",
  description: "Knapp som följer portalens designinställningar.",
  icon: "button",
  supportsAction: true,

  settingsSchema: [
    {
      key: "label",
      type: "text",
      label: "Knappetikett",
      default: "Klicka här",
      required: true,
    },
    {
      key: "link",
      type: "link",
      label: "Länk",
    },
    {
      key: "width",
      type: "segmented",
      label: "Bredd",
      default: "auto",
      options: [
        { value: "auto", label: "Efter innehåll" },
        { value: "full", label: "Full bredd" },
      ],
    },
    // ── Preset-controlled (hidden from panel) ──
    {
      key: "iconPosition",
      type: "select",
      label: "Ikonplacering",
      default: "none",
      hidden: true,
      options: [
        { value: "none", label: "Ingen" },
        { value: "right", label: "Höger" },
        { value: "left", label: "Vänster" },
      ],
    },
    {
      key: "iconCircle",
      type: "toggle",
      label: "Ikon i cirkel",
      default: false,
      hidden: true,
    },
  ],

  settingDefaults: {
    label: "Klicka här",
    link: null,
    width: "auto",
    iconPosition: "none",
    iconCircle: false,
  },

  presets: [
    {
      key: "clean",
      name: "Ren",
      description: "Knapp utan ikon",
      thumbnail: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773172758/button_ghehjgheh_nixue7.png",
      settingOverrides: { iconPosition: "none", iconCircle: false },
    },
    {
      key: "icon-right",
      name: "Ikon höger",
      description: "Knapp med pil-ikon till höger",
      thumbnail: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773172757/button_preset_2_veu2iq.png",
      settingOverrides: { iconPosition: "right", iconCircle: false },
    },
    {
      key: "circle-right",
      name: "Cirkel höger",
      description: "Knapp med ikon i cirkel till höger",
      thumbnail: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773172757/button_preset_3_onmtt2.png",
      settingOverrides: { iconPosition: "right", iconCircle: true },
    },
    {
      key: "icon-left",
      name: "Ikon vänster",
      description: "Knapp med pil-ikon till vänster",
      thumbnail: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773172753/button_421_uh8vkd.png",
      settingOverrides: { iconPosition: "left", iconCircle: false },
    },
    {
      key: "circle-left",
      name: "Cirkel vänster",
      description: "Knapp med ikon i cirkel till vänster",
      thumbnail: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773172753/button_preset_salam_nkalbj.png",
      settingOverrides: { iconPosition: "left", iconCircle: true },
    },
  ],
};

registerElementDefinition(buttonElement);
