/**
 * Section Definition: Produkthero
 * ────────────────────────────────
 * Simple product-style hero: large image above, then heading,
 * text, and full-width solid button below. Always 1 block.
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
  description: "Produktbild ovanför innehållet.",
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
        height: 400,
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
  description: "Rubrik och beskrivning under bilden.",
  allowedElements: ["heading", "text"],
  minElements: 1,
  maxElements: 2,
  defaultElements: [
    {
      type: "heading",
      settings: {
        content: "Produktnamn",
        size: "md",
        alignment: "left",
      },
      action: NO_ACTION,
      sortOrder: 0,
    },
    {
      type: "text",
      settings: {
        content: "En kort beskrivning av produkten eller tjänsten.",
        size: "sm",
        alignment: "left",
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
        label: "Lägg till",
        outline: false,
        width: "full",
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

// ─── Block Type ─────────────────────────────────────────

const heroBlockType: BlockTypeDefinition = {
  type: "product-hero",
  version: "1.0.0",
  name: "Produkthero",
  description: "Bild ovanför rubrik, text och knapp.",
  icon: "image",
  slots: [imageSlot, contentSlot, actionSlot],
  settingsSchema: [],
  settingDefaults: {},
};

// ─── Preset: Default ────────────────────────────────────

const defaultPreset: SectionPreset = {
  key: "default",
  version: "1.0.0",
  name: "Produkthero",
  description: "Bild ovanför innehåll med full-bredd-knapp.",
  thumbnail: "",
  cssClass: "s-product-hero--default",

  blockTypes: [heroBlockType],
  minBlocks: 1,
  maxBlocks: 1,

  settingsSchema: [
    {
      key: "imageAspectRatio",
      type: "select",
      label: "Bildformat",
      default: "1:1",
      options: [
        { value: "1:1", label: "Kvadrat (1:1)" },
        { value: "4:3", label: "Landskap (4:3)" },
        { value: "3:4", label: "Porträtt (3:4)" },
        { value: "16:9", label: "Widescreen (16:9)" },
      ],
    },
  ],
  settingDefaults: {
    imageAspectRatio: "1:1",
  },

  changeStrategy: "preserve_compatible",
  migrations: {},

  createDefaultBlocks: () => [
    {
      type: "product-hero" as const,
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
              height: 400,
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
              content: "Produktnamn",
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
              content: "En kort beskrivning av produkten eller tjänsten.",
              size: "sm",
              alignment: "left",
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
              label: "Lägg till",
              outline: false,
              width: "full",
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

export const productHeroSection: SectionDefinition = {
  id: "product-hero",
  version: "1.0.0",
  name: "Produktkort",
  description: "Produktbild ovanför rubrik, beskrivning och full-bredd-knapp.",
  category: "hero",
  tags: ["produkt", "hero", "kort", "bild", "produkthero"],
  thumbnail: "",
  scope: "free",

  settingsSchema: [],
  settingDefaults: {},

  presets: [defaultPreset],

  createDefault: () => ({
    definitionId: "product-hero",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    isActive: true,
    settings: {},
    presetSettings: {},
    blocks: [],
    title: "Produktkort",
  }),
};

registerSectionDefinition(productHeroSection);
