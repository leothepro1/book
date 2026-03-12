/**
 * Section Definition: Tabs
 * ────────────────────────
 * Horizontal tab navigation section.
 *
 * Each "tab" is a block with a content slot (heading + text)
 * and an optional icon slot. The first tab is active by default.
 *
 * Presets:
 *   - "underline":  Clean underline indicator beneath active tab
 *   - "pill":       Rounded pill/chip style for active tab
 */

import type {
  SectionDefinition,
  SectionPreset,
  BlockTypeDefinition,
  SlotDefinition,
} from "../types";
import { NO_ACTION } from "../types";
import { registerSectionDefinition } from "../registry";

// ─── Shared Slot Definitions ────────────────────────────────

const iconSlot: SlotDefinition = {
  key: "icon",
  name: "Ikon",
  description: "Valfri ikon som visas bredvid flik-titeln.",
  allowedElements: ["icon"],
  minElements: 0,
  maxElements: 1,
  defaultElements: [],
};

const contentSlot: SlotDefinition = {
  key: "content",
  name: "Innehåll",
  description: "Flikens textinnehåll — rubrik och brödtext.",
  allowedElements: ["heading", "text", "image", "video", "gallery", "button", "divider"],
  minElements: 1,
  maxElements: 8,
  defaultElements: [
    {
      type: "heading",
      settings: { content: "Flik-rubrik", level: "h3", alignment: "left" },
      action: NO_ACTION,
      sortOrder: 0,
    },
    {
      type: "text",
      settings: {
        content: "Beskrivning av denna flik. Redigera för att anpassa.",
        alignment: "left",
      },
      action: NO_ACTION,
      sortOrder: 1,
    },
  ],
};

// ─── Block Type: Tab ────────────────────────────────────────

const tabBlockType: BlockTypeDefinition = {
  type: "tab",
  version: "1.0.0",
  name: "Flik",
  description: "En enskild flik med rubrik och innehåll.",
  icon: "tab",
  slots: [iconSlot, contentSlot],
  settingsSchema: [
    {
      key: "label",
      type: "text",
      label: "Fliknamn",
      description: "Texten som visas på fliken.",
      default: "Flik",
      required: true,
    },
  ],
  settingDefaults: {
    label: "Flik",
  },
};

// ─── Preset: Underline ──────────────────────────────────────

const underlinePreset: SectionPreset = {
  key: "underline",
  version: "1.0.0",
  name: "Underline",
  description: "Ren underline-stil med aktiv flik markerad under.",
  thumbnail: "",
  cssClass: "s-tabs--underline",

  blockTypes: [tabBlockType],
  minBlocks: 1,
  maxBlocks: 8,

  settingsSchema: [
    {
      key: "indicatorColor",
      type: "color",
      label: "Indikatorfärg",
      default: "#1a1a1a",
    },
    {
      key: "alignment",
      type: "select",
      label: "Justering",
      default: "left",
      options: [
        { value: "left", label: "Vänster" },
        { value: "center", label: "Center" },
        { value: "stretch", label: "Fylla" },
      ],
    },
  ],
  settingDefaults: {
    indicatorColor: "#1a1a1a",
    alignment: "left",
  },

  changeStrategy: "preserve_compatible",
  migrations: {},

  createDefaultBlocks: () => [
    {
      type: "tab",
      settings: { label: "Översikt" },
      slots: {
        icon: [],
        content: [
          {
            id: "",
            type: "heading",
            settings: { content: "Välkommen", level: "h3", alignment: "left" },
            action: NO_ACTION,
            sortOrder: 0,
          },
          {
            id: "",
            type: "text",
            settings: {
              content: "Här kan du berätta om din verksamhet.",
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
    {
      type: "tab",
      settings: { label: "Detaljer" },
      slots: {
        icon: [],
        content: [
          {
            id: "",
            type: "heading",
            settings: { content: "Mer info", level: "h3", alignment: "left" },
            action: NO_ACTION,
            sortOrder: 0,
          },
          {
            id: "",
            type: "text",
            settings: {
              content: "Ytterligare information visas här.",
              alignment: "left",
            },
            action: NO_ACTION,
            sortOrder: 1,
          },
        ],
      },
      sortOrder: 1,
      isActive: true,
    },
  ],
};

// ─── Preset: Pill ───────────────────────────────────────────

const pillPreset: SectionPreset = {
  key: "pill",
  version: "1.0.0",
  name: "Pill",
  description: "Rundade pill-knappar för flik-navigation.",
  thumbnail: "",
  cssClass: "s-tabs--pill",

  blockTypes: [tabBlockType],
  minBlocks: 1,
  maxBlocks: 8,

  settingsSchema: [
    {
      key: "pillColor",
      type: "color",
      label: "Pill-färg (aktiv)",
      default: "#1a1a1a",
    },
    {
      key: "pillTextColor",
      type: "color",
      label: "Textfärg (aktiv)",
      default: "#ffffff",
    },
    {
      key: "gap",
      type: "range",
      label: "Mellanrum",
      default: 8,
      min: 0,
      max: 24,
      step: 4,
    },
  ],
  settingDefaults: {
    pillColor: "#1a1a1a",
    pillTextColor: "#ffffff",
    gap: 8,
  },

  changeStrategy: "preserve_compatible",
  migrations: {},

  createDefaultBlocks: () => [
    {
      type: "tab",
      settings: { label: "Översikt" },
      slots: {
        icon: [],
        content: [
          {
            id: "",
            type: "heading",
            settings: { content: "Välkommen", level: "h3", alignment: "left" },
            action: NO_ACTION,
            sortOrder: 0,
          },
          {
            id: "",
            type: "text",
            settings: {
              content: "Här kan du berätta om din verksamhet.",
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
    {
      type: "tab",
      settings: { label: "Detaljer" },
      slots: {
        icon: [],
        content: [
          {
            id: "",
            type: "heading",
            settings: { content: "Mer info", level: "h3", alignment: "left" },
            action: NO_ACTION,
            sortOrder: 0,
          },
          {
            id: "",
            type: "text",
            settings: {
              content: "Ytterligare information visas här.",
              alignment: "left",
            },
            action: NO_ACTION,
            sortOrder: 1,
          },
        ],
      },
      sortOrder: 1,
      isActive: true,
    },
  ],
};

// ─── Section Definition ─────────────────────────────────────

export const tabsSection: SectionDefinition = {
  id: "tabs",
  version: "1.0.0",
  name: "Flikar",
  description: "Fliknavigation — organisera innehåll i horisontella flikar.",
  category: "navigation",
  tags: ["tabs", "flikar", "navigation", "tabbad"],
  thumbnail: "",

  settingsSchema: [
    {
      key: "padding",
      type: "range",
      label: "Padding",
      default: 16,
      min: 0,
      max: 64,
      step: 4,
    },
    {
      key: "backgroundColor",
      type: "color",
      label: "Bakgrundsfärg",
      default: "#ffffff",
    },
  ],
  settingDefaults: {
    padding: 16,
    backgroundColor: "#ffffff",
  },

  presets: [underlinePreset, pillPreset],

  createDefault: () => ({
    definitionId: "tabs",
    definitionVersion: "1.0.0",
    presetKey: "underline",
    presetVersion: "1.0.0",
    isActive: true,
    settings: {},
    presetSettings: {},
    blocks: [],
    title: "Flikar",
  }),
};

registerSectionDefinition(tabsSection);
