/**
 * Section Definition: Karusell
 * ────────────────────────────
 * Horizontal scrolling carousel with section-level heading.
 * Each item: image + text label. Aspect ratio controlled at section level.
 * No pagination — scroll-based navigation only.
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

const imageSlot: SlotDefinition = {
  key: "image",
  name: "Bild",
  description: "Huvudbild för karusellobjetket.",
  allowedElements: ["image"],
  minElements: 1,
  maxElements: 1,
  defaultElements: [
    {
      type: "image",
      settings: {
        src: "",
        alt: "",
        width: 100,
        height: 300,
        overlay: 0,
        borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      },
      action: NO_ACTION,
      sortOrder: 0,
    },
  ],
};

const labelSlot: SlotDefinition = {
  key: "label",
  name: "Etikett",
  description: "Text under bilden.",
  allowedElements: ["text"],
  minElements: 0,
  maxElements: 1,
  defaultElements: [
    {
      type: "text",
      settings: {
        content: "Etikett",
        size: "sm",
        alignment: "left",
      },
      action: NO_ACTION,
      sortOrder: 0,
    },
  ],
};

// ─── Block Type: Carousel Item ──────────────────────────

const carouselItemBlockType: BlockTypeDefinition = {
  type: "carousel-item",
  version: "1.0.0",
  name: "Objekt",
  description: "Ett karusellobejkt med bild och etikett.",
  icon: "view_carousel",
  slots: [imageSlot, labelSlot],
  settingsSchema: [],
  settingDefaults: {},
};

// ─── Default Item Factory ───────────────────────────────

function makeItem(label: string, sortOrder: number) {
  return {
    type: "carousel-item" as const,
    settings: {},
    slots: {
      image: [
        {
          id: "",
          type: "image" as const,
          settings: {
            src: "",
            alt: "",
            width: 100,
            height: 300,
            overlay: 0,
            borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
          },
          action: NO_ACTION,
          sortOrder: 0,
        },
      ],
      label: [
        {
          id: "",
          type: "text" as const,
          settings: {
            content: label,
            size: "sm",
            alignment: "left",
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

// ─── Preset: Default ────────────────────────────────────

const defaultPreset: SectionPreset = {
  key: "default",
  version: "1.0.0",
  name: "Karusell",
  description: "Horisontell karusell med bild och etikett.",
  thumbnail: "",
  cssClass: "s-carousel--default",

  blockTypes: [carouselItemBlockType],
  minBlocks: 1,
  maxBlocks: -1,

  settingsSchema: [
    {
      key: "aspectRatio",
      type: "select",
      label: "Bildformat",
      default: "1:1",
      options: [
        { value: "1:1", label: "Kvadrat (1:1)" },
        { value: "3:4", label: "Porträtt (3:4)" },
        { value: "4:3", label: "Landskap (4:3)" },
        { value: "16:9", label: "Widescreen (16:9)" },
      ],
    },
  ],
  settingDefaults: {
    aspectRatio: "1:1",
  },

  changeStrategy: "preserve_compatible",
  migrations: {},

  createDefaultBlocks: () => [
    makeItem("Restaurang", 0),
    makeItem("Spa", 1),
    makeItem("Pool", 2),
    makeItem("Aktiviteter", 3),
  ],
};

// ─── Section Definition ─────────────────────────────────

export const carouselSection: SectionDefinition = {
  id: "carousel",
  version: "1.0.0",
  name: "Karusell",
  description: "Horisontell karusell med rubrik, bilder och etiketter.",
  category: "gallery",
  tags: ["karusell", "carousel", "galleri", "scroll", "bilder"],
  thumbnail: "",
  scope: "free",

  settingsSchema: [
    {
      key: "heading",
      type: "text",
      label: "Rubrik",
      default: "Utforska",
    },
    {
      key: "headingSize",
      type: "select",
      label: "Textstorlek",
      default: "md",
      options: [
        { value: "xs", label: "Extra liten" },
        { value: "sm", label: "Liten" },
        { value: "md", label: "Medium" },
        { value: "lg", label: "Stor" },
        { value: "xl", label: "Extra stor" },
      ],
    },
    {
      key: "headingAlignment",
      type: "segmented",
      label: "Justering",
      default: "left",
      options: [
        { value: "left", label: "Vänster" },
        { value: "center", label: "Center" },
        { value: "right", label: "Höger" },
      ],
    },
  ],
  settingDefaults: {
    heading: "Utforska",
    headingSize: "md",
    headingAlignment: "left",
  },

  presets: [defaultPreset],

  createDefault: () => ({
    definitionId: "carousel",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    isActive: true,
    settings: {},
    presetSettings: {},
    blocks: [],
    title: "Karusell",
  }),
};

registerSectionDefinition(carouselSection);
