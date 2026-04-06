import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Add to Cart button element — produktsida-specifik köpknapp.
 *
 * Identisk med button-elementet i panel, ikon och inställningar,
 * men scoped till produktsidan. Renderar en "Lägg i varukorg"-knapp
 * som automatiskt kopplas till produktens varukorgsfunktion.
 */
export const addToCartElement: ElementDefinition = {
  type: "add-to-cart",
  version: "1.0.0",
  name: "Köpknapp",
  description: "Lägg i varukorg-knapp kopplad till produkten.",
  icon: "shopping_cart",
  supportsAction: false,
  skipPresetPicker: true,
  pageScope: ["product", "shop-product"],

  settingsSchema: [
    {
      key: "label",
      type: "text",
      label: "Knappetikett",
      default: "Lägg i varukorg",
      required: true,
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
      default: "full",
      options: [
        { value: "auto", label: "Efter innehåll" },
        { value: "full", label: "Full bredd" },
      ],
    },
    {
      key: "icon",
      type: "text",
      label: "Ikon",
      translatable: false,
      default: "shopping_cart",
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
      default: "left",
      group: "Ikon",
      options: [
        { value: "left", label: "Vänster" },
        { value: "right", label: "Höger" },
      ],
    },
  ],

  settingDefaults: {
    label: "Lägg i varukorg",
    outline: false,
    width: "full",
    icon: "shopping_cart",
    icon_placement: "left",
    icon_size: 20,
    icon_weight: 400,
    icon_fill: "outlined",
  },

  presets: [
    {
      key: "default",
      name: "Köpknapp",
      description: "Lägg i varukorg",
      thumbnail: "",
      settingOverrides: {},
    },
  ],
};

registerElementDefinition(addToCartElement);
