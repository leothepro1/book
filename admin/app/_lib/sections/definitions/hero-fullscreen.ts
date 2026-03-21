/**
 * Section Definition: Hero Fullscreen
 * ────────────────────────────────────
 * Single full-bleed hero image with overlaid heading, text, and button.
 * Content positioned in the lower portion of the image.
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
  name: "Bild",
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

const contentSlot: SlotDefinition = {
  key: "content",
  name: "Innehåll",
  description: "Rubrik och brödtext ovanpå bilden.",
  allowedElements: ["heading", "text"],
  minElements: 1,
  maxElements: 2,
  defaultElements: [
    {
      type: "heading",
      settings: {
        content: "Välkommen",
        size: "lg",
        alignment: "center",
      },
      action: NO_ACTION,
      sortOrder: 0,
    },
    {
      type: "text",
      settings: {
        content: "Upptäck en unik upplevelse hos oss.",
        size: "md",
        alignment: "center",
      },
      action: NO_ACTION,
      sortOrder: 1,
    },
  ],
};

const actionSlot: SlotDefinition = {
  key: "actions",
  name: "Knappar",
  description: "Call-to-action-knapp.",
  allowedElements: ["button"],
  minElements: 0,
  maxElements: 2,
  defaultElements: [
    {
      type: "button",
      settings: {
        label: "Boka nu",
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

// ─── Block Type: Hero ───────────────────────────────────

const heroBlockType: BlockTypeDefinition = {
  type: "hero",
  version: "1.0.0",
  name: "Hero",
  description: "Helskärmsbild med innehåll.",
  icon: "image",
  slots: [imageSlot, contentSlot, actionSlot],
  settingsSchema: [],
  settingDefaults: {},
};

// ─── Preset: Default ────────────────────────────────────

const defaultPreset: SectionPreset = {
  key: "default",
  version: "1.0.0",
  name: "Helskärm",
  description: "Heltäckande hero med bild och centrerat innehåll.",
  thumbnail: "",
  cssClass: "s-hero-fullscreen--default",

  blockTypes: [heroBlockType],
  minBlocks: 1,
  maxBlocks: 1,

  settingsSchema: [
    {
      key: "aspectRatio",
      type: "select",
      label: "Höjd",
      default: "16 / 9",
      options: [
        { value: "21 / 9", label: "Ultrawide (21:9)" },
        { value: "16 / 9", label: "Widescreen (16:9)" },
        { value: "4 / 3", label: "Standard (4:3)" },
        { value: "1 / 1", label: "Kvadrat (1:1)" },
      ],
    },
  ],
  settingDefaults: {
    aspectRatio: "16 / 9",
  },

  changeStrategy: "preserve_compatible",
  migrations: {},

  createDefaultBlocks: () => [
    {
      type: "hero" as const,
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
        content: [
          {
            id: "",
            type: "heading" as const,
            settings: {
              content: "Välkommen",
              size: "lg",
              alignment: "center",
            },
            action: NO_ACTION,
            sortOrder: 0,
          },
          {
            id: "",
            type: "text" as const,
            settings: {
              content: "Upptäck en unik upplevelse hos oss.",
              size: "md",
              alignment: "center",
            },
            action: NO_ACTION,
            sortOrder: 1,
          },
        ],
        actions: [
          {
            id: "",
            type: "button" as const,
            settings: {
              label: "Boka nu",
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
      sortOrder: 0,
      isActive: true,
    },
  ],
};

// ─── Section Definition ─────────────────────────────────

export const heroFullscreenSection: SectionDefinition = {
  id: "hero-fullscreen",
  version: "1.0.0",
  name: "Hjältebild",
  description: "Heltäckande bild med rubrik, text och knapp centrerat.",
  category: "hero",
  tags: ["hero", "fullscreen", "bild", "banner", "helskärm"],
  thumbnail: "",
  scope: "free",

  settingsSchema: [],
  settingDefaults: {},

  presets: [defaultPreset],

  createDefault: () => ({
    definitionId: "hero-fullscreen",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    isActive: true,
    settings: {},
    presetSettings: {},
    blocks: [],
    title: "Hjältebild",
  }),
};

registerSectionDefinition(heroFullscreenSection);
