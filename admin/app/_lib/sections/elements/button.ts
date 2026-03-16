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
  name: "Knapp",
  description: "Knapp som följer portalens designinställningar.",
  icon: "call_to_action",
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
      key: "outline",
      type: "toggle",
      label: "Använd knappkonturer",
      default: false,
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
    // ── Ikon group ──
    {
      key: "icon",
      type: "text",
      label: "Ikon",
      translatable: false,
      default: "",
      group: "Ikon",
      descriptionLink: {
        href: "https://fonts.google.com/icons",
        label: "Se tillgängliga ikoner",
      },
    },
    {
      key: "icon_fill",
      type: "segmented",
      label: "Stil",
      default: "outlined",
      options: [
        { value: "outlined", label: "Kontur" },
        { value: "filled", label: "Fylld" },
      ],
      group: "Ikon",
    },
    {
      key: "icon_size",
      type: "range",
      label: "Storlek",
      default: 20,
      min: 16,
      max: 48,
      step: 4,
      unit: "px",
      group: "Ikon",
    },
    {
      key: "icon_weight",
      type: "weightRange",
      label: "Vikt",
      default: 400,
      min: 100,
      max: 700,
      step: 100,
      group: "Ikon",
    },
    {
      key: "icon_placement",
      type: "segmented",
      label: "Placering",
      default: "right",
      group: "Ikon",
      options: [
        { value: "left", label: "Vänster" },
        { value: "right", label: "Höger" },
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
    outline: false,
    width: "auto",
    icon: "",
    icon_placement: "right",
    icon_size: 20,
    icon_weight: 400,
    icon_fill: "outlined",
    iconPosition: "none",
    iconCircle: false,
  },

  skipPresetPicker: true,

  presets: [
    {
      key: "default",
      name: "Knapp",
      description: "Standard knapp",
      thumbnail: "",
      settingOverrides: {},
    },
  ],
};

registerElementDefinition(buttonElement);
