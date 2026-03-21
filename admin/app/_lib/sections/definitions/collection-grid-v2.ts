/**
 * Section Definition: Kollektionsrutnät v2
 * ─────────────────────────────────────────
 * CSS grid of image cards with overlaid buttons.
 * Fixed layout: 2 items → 1 full-width → 2 items.
 * Section heading above the grid.
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
  name: "Huvudbild",
  description: "Heltäckande bild för kortet.",
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
  name: "Knapp",
  description: "Knapp som visas ovanpå bilden nere till vänster.",
  allowedElements: ["button"],
  minElements: 0,
  maxElements: 1,
  defaultElements: [
    {
      type: "button",
      settings: {
        label: "Kollektion",
        outline: false,
        width: "auto",
        icon: "",
        icon_placement: "right",
        icon_size: 20,
        icon_weight: 400,
        icon_fill: "outlined",
      },
      action: NO_ACTION,
      sortOrder: 0,
    },
  ],
};

// ─── Block Type: Grid Item ──────────────────────────────

const gridItemBlockType: BlockTypeDefinition = {
  type: "grid-item",
  version: "1.0.0",
  name: "Kort",
  description: "Ett kort med bild och knapp.",
  icon: "grid_view",
  slots: [imageSlot, labelSlot],
  settingsSchema: [],
  settingDefaults: {},
};

// ─── Default Item Factory ───────────────────────────────

function makeItem(label: string, sortOrder: number) {
  return {
    type: "grid-item" as const,
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
          type: "button" as const,
          settings: {
            label,
            outline: false,
            width: "auto",
            icon: "",
            icon_placement: "right",
            icon_size: 20,
            icon_weight: 400,
            icon_fill: "outlined",
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
  name: "Rutnät v2",
  description: "2-1-2 layout: två kort, ett brett, två kort.",
  thumbnail: "",
  cssClass: "s-collection-grid-v2--default",

  blockTypes: [gridItemBlockType],
  minBlocks: 1,
  maxBlocks: -1,

  settingsSchema: [
    {
      key: "aspectRatio",
      type: "select",
      label: "Bildformat",
      default: "3:4",
      options: [
        { value: "1:1", label: "Kvadrat (1:1)" },
        { value: "3:4", label: "Porträtt (3:4)" },
        { value: "4:3", label: "Landskap (4:3)" },
        { value: "16:9", label: "Widescreen (16:9)" },
      ],
    },
  ],
  settingDefaults: {
    aspectRatio: "3:4",
  },

  changeStrategy: "preserve_compatible",
  migrations: {},

  createDefaultBlocks: () => [
    makeItem("Restaurang", 0),
    makeItem("Spa", 1),
    makeItem("Upplevelser", 2),
    makeItem("Aktiviteter", 3),
    makeItem("Rum", 4),
  ],
};

// ─── Section Definition ─────────────────────────────────

export const collectionGridV2Section: SectionDefinition = {
  id: "collection-grid-v2",
  version: "1.0.0",
  name: "Rutnät: Mosaikvy",
  description: "Rutnät med 2-1-2 mönster — två kort, ett brett, två kort.",
  category: "gallery",
  tags: ["kollektion", "rutnät", "grid", "galleri", "kort", "bilder", "v2"],
  thumbnail: "",
  scope: "free",

  settingsSchema: [
    {
      key: "heading",
      type: "text",
      label: "Rubrik",
      default: "Kollektioner",
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
    heading: "Kollektioner",
    headingSize: "md",
    headingAlignment: "left",
  },

  presets: [defaultPreset],

  createDefault: () => ({
    definitionId: "collection-grid-v2",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    isActive: true,
    settings: {},
    presetSettings: {},
    blocks: [],
    title: "Rutnät: Mosaikvy",
  }),
};

registerSectionDefinition(collectionGridV2Section);
