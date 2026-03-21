/**
 * Section Definition: Produkthero: Delad
 * ───────────────────────────────────────
 * Split hero: image top half, content bottom half.
 * Two-tone look driven entirely by color scheme (dark scheme
 * makes bottom half dark). No hardcoded colors.
 * Always 1 block.
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
  description: "Produktbild i övre halvan.",
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

const eyebrowSlot: SlotDefinition = {
  key: "eyebrow",
  name: "Etikett",
  description: "Liten text ovanför rubriken (t.ex. BESTSELLER).",
  allowedElements: ["text"],
  minElements: 0,
  maxElements: 1,
  defaultElements: [
    {
      type: "text",
      settings: {
        content: "BESTSELLER",
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
  description: "Rubrik och beskrivning.",
  allowedElements: ["heading", "text"],
  minElements: 1,
  maxElements: 2,
  defaultElements: [
    {
      type: "heading",
      settings: {
        content: "Produktnamn",
        size: "lg",
        alignment: "left",
      },
      action: NO_ACTION,
      sortOrder: 0,
    },
    {
      type: "text",
      settings: {
        content: "En exklusiv produkt skapad med omsorg och kvalitet i varje detalj.",
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
  description: "Ghost-knapp under beskrivningen.",
  allowedElements: ["button"],
  minElements: 0,
  maxElements: 2,
  defaultElements: [
    {
      type: "button",
      settings: {
        label: "Utforska",
        outline: false,
        width: "auto",
        icon: "arrow_forward",
        icon_placement: "right",
        icon_size: 18,
        icon_weight: 400,
        icon_fill: "outlined",
      },
      action: NO_ACTION,
      sortOrder: 0,
    },
  ],
};

// ─── Block Type ─────────────────────────────────────────

const splitBlockType: BlockTypeDefinition = {
  type: "split-hero",
  version: "1.0.0",
  name: "Delad hero",
  description: "Bild ovan, innehåll under.",
  icon: "image",
  slots: [imageSlot, eyebrowSlot, contentSlot, actionSlot],
  settingsSchema: [],
  settingDefaults: {},
};

// ─── Preset: Default ────────────────────────────────────

const defaultPreset: SectionPreset = {
  key: "default",
  version: "1.0.0",
  name: "Delad",
  description: "Bild ovan, innehåll under med kontrastbakgrund.",
  thumbnail: "",
  cssClass: "s-product-hero-split--default",

  blockTypes: [splitBlockType],
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
      type: "split-hero" as const,
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
        eyebrow: [
          {
            id: "",
            type: "text" as const,
            settings: {
              content: "BESTSELLER",
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
              content: "Produktnamn",
              size: "lg",
              alignment: "left",
            },
            action: NO_ACTION,
            sortOrder: 0,
          },
          {
            id: "",
            type: "text" as const,
            settings: {
              content: "En exklusiv produkt skapad med omsorg och kvalitet i varje detalj.",
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
              label: "Utforska",
              outline: false,
              width: "auto",
              icon: "arrow_forward",
              icon_placement: "right",
              icon_size: 18,
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

export const productHeroSplitSection: SectionDefinition = {
  id: "product-hero-split",
  version: "1.0.0",
  name: "Produktkort: Delad",
  description: "Delad vy — bild ovan, innehåll under med kontrastbakgrund.",
  category: "hero",
  tags: ["produkt", "hero", "delad", "split", "bild"],
  thumbnail: "",
  scope: "free",

  settingsSchema: [],
  settingDefaults: {},

  presets: [defaultPreset],

  createDefault: () => ({
    definitionId: "product-hero-split",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    isActive: true,
    settings: {},
    presetSettings: {},
    blocks: [],
    title: "Produktkort: Delad",
  }),
};

registerSectionDefinition(productHeroSplitSection);
