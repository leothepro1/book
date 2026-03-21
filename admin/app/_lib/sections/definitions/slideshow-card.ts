/**
 * Section Definition: Slideshow Card (Bildspel: Infällt)
 * ──────────────────────────────────────────────────────
 * Horizontal slider with card-style slides.
 *
 * Each slide is a vertical stack: image on top, then heading,
 * body text, and CTA button below — content is NOT overlaid
 * on the image. One slide visible at a time.
 * Dot pagination below.
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
  description: "Bild ovanpå kortet.",
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
        height: 280,
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
  description: "Rubrik och brödtext under bilden.",
  allowedElements: ["heading", "text"],
  minElements: 1,
  maxElements: 2,
  defaultElements: [
    {
      type: "heading",
      settings: {
        content: "Rubrik",
        size: "md",
        alignment: "center",
      },
      action: NO_ACTION,
      sortOrder: 0,
    },
    {
      type: "text",
      settings: {
        content: "En kort beskrivning av det här kortet.",
        size: "sm",
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
        label: "Läs mer",
        outline: true,
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

// ─── Block Type: Card Slide ─────────────────────────────

const cardSlideBlockType: BlockTypeDefinition = {
  type: "card-slide",
  version: "1.0.0",
  name: "Kort",
  description: "Ett kort med bild, rubrik, text och knapp.",
  icon: "view_carousel",
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
    type: "card-slide" as const,
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
            height: 280,
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
            content: heading,
            size: "md",
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
            size: "sm",
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
            outline: true,
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
  name: "Infällt",
  description: "Kortstil med bild ovanför innehåll.",
  thumbnail: "",
  cssClass: "s-slideshow-card--default",

  blockTypes: [cardSlideBlockType],
  minBlocks: 1,
  maxBlocks: 10,

  settingsSchema: [
    {
      key: "imageAspectRatio",
      type: "select",
      label: "Bildformat",
      default: "4 / 3",
      options: [
        { value: "16 / 9", label: "Widescreen (16:9)" },
        { value: "4 / 3", label: "Standard (4:3)" },
        { value: "1 / 1", label: "Kvadrat (1:1)" },
        { value: "3 / 4", label: "Porträtt (3:4)" },
      ],
    },
  ],
  settingDefaults: {
    imageAspectRatio: "4 / 3",
  },

  changeStrategy: "preserve_compatible",
  migrations: {},

  createDefaultBlocks: () => [
    makeSlide("Restaurang", "Njut av vår prisbelönta meny med lokala råvaror.", "Boka bord", 0),
    makeSlide("Spa & Wellness", "Koppla av med våra behandlingar och bastu.", "Se utbud", 1),
    makeSlide("Aktiviteter", "Utforska naturen med våra guidade turer.", "Läs mer", 2),
  ],
};

// ─── Section Definition ─────────────────────────────────

export const slideshowCardSection: SectionDefinition = {
  id: "slideshow-card",
  version: "1.0.0",
  name: "Bildspel: Kort",
  description: "Bildspel med kortstil — bild ovanför rubrik, text och knapp.",
  category: "hero",
  tags: ["bildspel", "slideshow", "kort", "card", "slider", "infällt"],
  thumbnail: "",
  scope: "free",

  settingsSchema: [],
  settingDefaults: {},

  presets: [defaultPreset],

  createDefault: () => ({
    definitionId: "slideshow-card",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    isActive: true,
    settings: {},
    presetSettings: {},
    blocks: [],
    title: "Bildspel: Kort",
  }),
};

registerSectionDefinition(slideshowCardSection);
