/**
 * Section Definition: Hero Bottom-Aligned (Huvudbild: Bottenjusterad)
 * ───────────────────────────────────────────────────────────────────
 * Full-bleed hero with content anchored to the bottom-left.
 * Label (eyebrow) → heading → body text, no button.
 * Always exactly 1 block — no slider.
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
  description: "Heltäckande bakgrundsbild.",
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
        height: 500,
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
  description: "Liten text ovanför rubriken (eyebrow).",
  allowedElements: ["text"],
  minElements: 0,
  maxElements: 1,
  defaultElements: [
    {
      type: "text",
      settings: {
        content: "Välkommen till",
        size: "sm",
        alignment: "left",
      },
      action: NO_ACTION,
      sortOrder: 0,
    },
  ],
};

const contentSlot: SlotDefinition = {
  key: "content",
  name: "Innehåll",
  description: "Rubrik och brödtext.",
  allowedElements: ["heading", "text"],
  minElements: 1,
  maxElements: 2,
  defaultElements: [
    {
      type: "heading",
      settings: {
        content: "Grand Hotel Stockholm",
        size: "md",
        alignment: "left",
      },
      action: NO_ACTION,
      sortOrder: 0,
    },
    {
      type: "text",
      settings: {
        content: "En plats där elegans möter havsutsikt sedan 1874.",
        size: "sm",
        alignment: "left",
      },
      action: NO_ACTION,
      sortOrder: 1,
    },
  ],
};

// ─── Block Type ─────────────────────────────────────────

const heroBlockType: BlockTypeDefinition = {
  type: "hero-bottom",
  version: "1.0.0",
  name: "Hero",
  description: "Helskärmsbild med bottenjusterat innehåll.",
  icon: "image",
  slots: [imageSlot, labelSlot, contentSlot],
  settingsSchema: [],
  settingDefaults: {},
};

// ─── Preset: Default ────────────────────────────────────

const defaultPreset: SectionPreset = {
  key: "default",
  version: "1.0.0",
  name: "Bottenjusterad",
  description: "Innehåll ankrat till nedre vänstra hörnet.",
  thumbnail: "",
  cssClass: "s-hero-bottom-aligned--default",

  blockTypes: [heroBlockType],
  minBlocks: 1,
  maxBlocks: 1,

  settingsSchema: [
    {
      key: "aspectRatio",
      type: "select",
      label: "Höjd",
      default: "4 / 3",
      options: [
        { value: "21 / 9", label: "Ultrawide (21:9)" },
        { value: "16 / 9", label: "Widescreen (16:9)" },
        { value: "4 / 3", label: "Standard (4:3)" },
        { value: "1 / 1", label: "Kvadrat (1:1)" },
      ],
    },
  ],
  settingDefaults: {
    aspectRatio: "4 / 3",
  },

  changeStrategy: "preserve_compatible",
  migrations: {},

  createDefaultBlocks: () => [
    {
      type: "hero-bottom" as const,
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
              height: 500,
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
              content: "Välkommen till",
              size: "sm",
              alignment: "left",
            },
            action: NO_ACTION,
            sortOrder: 0,
          },
        ],
        content: [
          {
            id: "",
            type: "heading" as const,
            settings: {
              content: "Grand Hotel Stockholm",
              size: "md",
              alignment: "left",
            },
            action: NO_ACTION,
            sortOrder: 0,
          },
          {
            id: "",
            type: "text" as const,
            settings: {
              content: "En plats där elegans möter havsutsikt sedan 1874.",
              size: "md",
              alignment: "left",
            },
            action: NO_ACTION,
            sortOrder: 1,
          },
        ],
      },
      sortOrder: 0,
      isActive: true,
    },
  ],
};

// ─── Section Definition ─────────────────────────────────

export const heroBottomAlignedSection: SectionDefinition = {
  id: "hero-bottom-aligned",
  version: "1.0.0",
  name: "Hjältebild: Vänsterjusterad",
  description: "Heltäckande bild med innehåll ankrat till nedre vänstra hörnet.",
  category: "hero",
  tags: ["hero", "bild", "banner", "bottenjusterad", "huvudbild"],
  thumbnail: "",
  scope: "free",

  settingsSchema: [],
  settingDefaults: {},

  presets: [defaultPreset],

  createDefault: () => ({
    definitionId: "hero-bottom-aligned",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    isActive: true,
    settings: {},
    presetSettings: {},
    blocks: [],
    title: "Hjältebild: Vänsterjusterad",
  }),
};

registerSectionDefinition(heroBottomAlignedSection);
