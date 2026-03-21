/**
 * Section Definition: Fullscreen Slideshow
 * ─────────────────────────────────────────
 * Full-width image slideshow with text overlay.
 *
 * Each slide has a background image with centered heading,
 * body text, and call-to-action button overlaid on top.
 * Dot pagination below the slideshow.
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
  description: "Heltäckande bakgrundsbild för sliden.",
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
        overlay: 40,
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
  description: "Rubrik och brödtext som visas ovanpå bilden.",
  allowedElements: ["heading", "text"],
  minElements: 1,
  maxElements: 2,
  defaultElements: [
    {
      type: "heading",
      settings: {
        content: "Rubrik",
        size: "lg",
        alignment: "center",
      },
      action: NO_ACTION,
      sortOrder: 0,
    },
    {
      type: "text",
      settings: {
        content: "Beskriv din upplevelse här med en kort text.",
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

// ─── Block Type: Slide ──────────────────────────────────

const slideBlockType: BlockTypeDefinition = {
  type: "slide",
  version: "1.0.0",
  name: "Slide",
  description: "En slide med bakgrundsbild och innehåll.",
  icon: "image",
  slots: [imageSlot, contentSlot, actionSlot],
  settingsSchema: [],
  settingDefaults: {},
};

// ─── Default Slide Factory ──────────────────────────────

function makeSlide(
  heading: string,
  body: string,
  cta: string,
  sortOrder: number,
) {
  return {
    type: "slide" as const,
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
            overlay: 40,
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
            content: heading,
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
            content: body,
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
            label: cta,
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
  name: "Helskärm",
  description: "Heltäckande bildspel med centrerat innehåll.",
  thumbnail: "",
  cssClass: "s-fullscreen-slideshow--default",

  blockTypes: [slideBlockType],
  minBlocks: 1,
  maxBlocks: 10,

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
    {
      key: "autoPlay",
      type: "toggle",
      label: "Automatiskt bildspel",
      default: false,
    },
    {
      key: "autoPlayInterval",
      type: "range",
      label: "Intervall",
      default: 5,
      min: 2,
      max: 15,
      step: 1,
      unit: "s",
      visibleWhen: { key: "autoPlay", value: true },
    },
  ],
  settingDefaults: {
    aspectRatio: "16 / 9",
    autoPlay: false,
    autoPlayInterval: 5,
  },

  changeStrategy: "preserve_compatible",
  migrations: {},

  createDefaultBlocks: () => [
    makeSlide("Välkommen", "Upptäck allt vi har att erbjuda.", "Utforska", 0),
    makeSlide("Upplevelser", "Skapa minnen som varar för livet.", "Se mer", 1),
    makeSlide("Boka idag", "Säkra din plats hos oss.", "Boka nu", 2),
  ],
};

// ─── Section Definition ─────────────────────────────────

export const fullscreenSlideshowSection: SectionDefinition = {
  id: "fullscreen-slideshow",
  version: "1.0.0",
  name: "Bildspel: Helskärm",
  description: "Heltäckande bildspel med text och knapp ovanpå varje bild.",
  category: "hero",
  tags: ["bildspel", "slideshow", "hero", "fullscreen", "slider", "bild"],
  thumbnail: "",
  scope: "free",

  settingsSchema: [],
  settingDefaults: {},

  presets: [defaultPreset],

  createDefault: () => ({
    definitionId: "fullscreen-slideshow",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    isActive: true,
    settings: {},
    presetSettings: {},
    blocks: [],
    title: "Bildspel: Helskärm",
  }),
};

registerSectionDefinition(fullscreenSlideshowSection);
