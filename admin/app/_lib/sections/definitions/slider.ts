/**
 * Section Definition: Slider
 * ──────────────────────────
 * Horizontal scrollable slider.
 *
 * Presets:
 *   - "button-row": Each block has 1 button (with built-in icon).
 *                    Horizontal row, scrollable.
 *   - "card":        Each block has image + heading + button.
 *                    Centered carousel with scale effect, gradient overlay,
 *                    dot indicators, and drag support (Pebble-style).
 */

import type {
  SectionDefinition,
  SectionPreset,
  BlockTypeDefinition,
  SlotDefinition,
} from "../types";
import { NO_ACTION } from "../types";
import { registerSectionDefinition } from "../registry";

// ─── Slot Definitions ────────────────────────────────────

const contentSlot: SlotDefinition = {
  key: "content",
  name: "Knapp",
  description: "Knapp med ikon som representerar slider-objektet.",
  allowedElements: ["button"],
  minElements: 1,
  maxElements: 1,
  defaultElements: [
    {
      type: "button",
      settings: {
        label: "Objekt",
        width: "auto",
        icon: "star",
        icon_placement: "left",
        icon_fill: "outlined",
        icon_size: 20,
        icon_weight: 400,
      },
      action: NO_ACTION,
      sortOrder: 0,
    },
  ],
};

// ─── Block Type: Slider Item ─────────────────────────────

const sliderItemBlockType: BlockTypeDefinition = {
  type: "slider-item",
  version: "1.0.0",
  name: "Objekt",
  description: "Ett objekt i slidern med en knapp.",
  icon: "view_carousel",
  slots: [contentSlot],
  settingsSchema: [],
  settingDefaults: {},
};

// ─── Helper: create one slider item ──────────────────────

function makeItem(
  iconName: string,
  label: string,
  sortOrder: number,
) {
  return {
    type: "slider-item" as const,
    settings: {},
    slots: {
      content: [
        {
          id: "",
          type: "button" as const,
          settings: {
            label,
            width: "auto",
            icon: iconName,
            icon_placement: "left",
            icon_fill: "outlined",
            icon_size: 20,
            icon_weight: 400,
          },
          action: NO_ACTION,
          sortOrder: 0,
        },
      ],
    },
    sortOrder,
    isActive: true,
  };
}

// ─── Card Preset Slots ───────────────────────────────────

const PLACEHOLDER_IMAGES = [
  "https://images.unsplash.com/photo-1600334129128-685c5582fd35?auto=format&fit=crop&w=1200&q=60",
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=60",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=60",
];

const cardImageSlot: SlotDefinition = {
  key: "image",
  name: "Bild",
  description: "Bakgrundsbild för kortet.",
  allowedElements: ["image"],
  minElements: 1,
  maxElements: 1,
  defaultElements: [
    {
      type: "image",
      settings: {
        src: PLACEHOLDER_IMAGES[0],
        width: 100,
        height: 300,
        overlay: 0,
      },
      action: NO_ACTION,
      sortOrder: 0,
    },
  ],
};

const cardTitleSlot: SlotDefinition = {
  key: "title",
  name: "Rubrik",
  description: "Rubrik som visas ovanpå bilden.",
  allowedElements: ["heading"],
  minElements: 1,
  maxElements: 1,
  defaultElements: [
    {
      type: "heading",
      settings: {
        content: "Rubrik",
        size: "sm",
        alignment: "left",
      },
      action: NO_ACTION,
      sortOrder: 0,
    },
  ],
};

const cardActionSlot: SlotDefinition = {
  key: "action",
  name: "Knapp",
  description: "CTA-knapp som visas ovanpå bilden.",
  allowedElements: ["button"],
  minElements: 1,
  maxElements: 1,
  defaultElements: [
    {
      type: "button",
      settings: {
        label: "Läs mer",
        width: "auto",
      },
      action: NO_ACTION,
      sortOrder: 0,
    },
  ],
};

// ─── Block Type: Card Slide ──────────────────────────────

const cardSlideBlockType: BlockTypeDefinition = {
  type: "card-slide",
  version: "1.0.0",
  name: "Kort",
  description: "Ett slide-kort med bild, rubrik och knapp.",
  icon: "view_carousel",
  slots: [cardImageSlot, cardTitleSlot, cardActionSlot],
  settingsSchema: [],
  settingDefaults: {},
};

// ─── Helper: create one card slide ───────────────────────

function makeCardSlide(
  title: string,
  cta: string,
  imageSrc: string,
  sortOrder: number,
) {
  return {
    type: "card-slide" as const,
    settings: {},
    slots: {
      image: [
        {
          id: "",
          type: "image" as const,
          settings: {
            src: imageSrc,
            width: 100,
            height: 300,
            overlay: 0,
          },
          action: NO_ACTION,
          sortOrder: 0,
        },
      ],
      title: [
        {
          id: "",
          type: "heading" as const,
          settings: {
            content: title,
            size: "sm",
            alignment: "left",
          },
          action: NO_ACTION,
          sortOrder: 0,
        },
      ],
      action: [
        {
          id: "",
          type: "button" as const,
          settings: {
            label: cta,
            width: "auto",
          },
          action: NO_ACTION,
          sortOrder: 0,
        },
      ],
    },
    sortOrder,
    isActive: true,
  };
}

// ─── Preset: Button Row ──────────────────────────────────

const buttonRowPreset: SectionPreset = {
  key: "button-row",
  version: "1.0.0",
  name: "Knapprad",
  description: "Horisontell rad med knappar med ikoner, scrollbar vid overflow.",
  thumbnail: "",
  cssClass: "s-slider--button-row",

  blockTypes: [sliderItemBlockType],
  minBlocks: 1,
  maxBlocks: 20,

  settingsSchema: [
    {
      key: "gap",
      type: "range",
      label: "Mellanrum",
      default: 8,
      min: 0,
      max: 32,
      step: 4,
      unit: "px",
    },
  ],
  settingDefaults: {
    gap: 8,
  },

  changeStrategy: "preserve_compatible",
  migrations: {},

  createDefaultBlocks: () => [
    makeItem("restaurant", "Restaurang", 0),
    makeItem("pool", "Pool & Spa", 1),
    makeItem("meeting_room", "Konferens", 2),
    makeItem("luggage", "Förvaring", 3),
  ],
};

// ─── Preset: Card (Pebble-style) ─────────────────────────

const cardPreset: SectionPreset = {
  key: "card",
  version: "1.0.0",
  name: "Kort",
  description: "Centrerad karusell med bild, rubrik och CTA-knapp. Drag och prickindikatorer.",
  thumbnail: "",
  cssClass: "s-slider--card",

  blockTypes: [cardSlideBlockType],
  minBlocks: 1,
  maxBlocks: 12,

  settingsSchema: [
    {
      key: "aspectRatio",
      type: "select",
      label: "Bildformat",
      default: "5 / 3",
      options: [
        { value: "16 / 9", label: "16:9" },
        { value: "5 / 3", label: "5:3" },
        { value: "4 / 3", label: "4:3" },
        { value: "1 / 1", label: "1:1" },
      ],
    },
    {
      key: "borderRadius",
      type: "range",
      label: "Hörnradie",
      default: 16,
      min: 0,
      max: 32,
      step: 2,
      unit: "px",
    },
  ],
  settingDefaults: {
    aspectRatio: "5 / 3",
    borderRadius: 16,
  },

  changeStrategy: "reset",
  migrations: {},

  createDefaultBlocks: () => [
    makeCardSlide("Upplev spa & wellness", "Boka nu", PLACEHOLDER_IMAGES[0], 0),
    makeCardSlide("Restaurang & bar", "Se menyn", PLACEHOLDER_IMAGES[1], 1),
    makeCardSlide("Aktiviteter & äventyr", "Utforska", PLACEHOLDER_IMAGES[2], 2),
  ],
};

// ─── Section Definition ──────────────────────────────────

export const sliderSection: SectionDefinition = {
  id: "slider",
  version: "1.0.0",
  name: "Slider",
  description: "Horisontell slider — perfekt för snabblänkar och navigation.",
  category: "navigation",
  tags: ["slider", "horizontal", "scroll", "knappar", "snabblänkar"],
  thumbnail: "",
  scope: "free",

  settingsSchema: [
    {
      key: "padding",
      type: "range",
      label: "Padding",
      default: 16,
      min: 0,
      max: 64,
      step: 4,
      unit: "px",
    },
  ],
  settingDefaults: {
    padding: 16,
  },

  presets: [buttonRowPreset, cardPreset],

  createDefault: () => ({
    definitionId: "slider",
    definitionVersion: "1.0.0",
    presetKey: "button-row",
    presetVersion: "1.0.0",
    isActive: true,
    settings: {},
    presetSettings: {},
    blocks: [],
    title: "Slider",
  }),
};

registerSectionDefinition(sliderSection);
