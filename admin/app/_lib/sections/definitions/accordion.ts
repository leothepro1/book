/**
 * Section Definition: Accordion (Dragspel)
 * ─────────────────────────────────────────
 * Vertically stacked expandable list.
 *
 * Each "accordion-item" block has three slots:
 *   - title slot:     exactly 1 heading element (the clickable label)
 *   - indicator slot: exactly 1 icon element (rotates 180° on open)
 *   - content slot:   exactly 1 text element (the expandable body)
 *
 * The heading and icon render on the same row. Clicking anywhere on
 * the row toggles the content. All spacing values are set as element
 * defaults so they appear in the editor panel and can be changed.
 *
 * Presets:
 *   - "default": Bordered rows, chevron indicator, 250ms transitions
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

const titleSlot: SlotDefinition = {
  key: "title",
  name: "Rubrik",
  description: "Klickbar rubrik som öppnar/stänger dragspelet.",
  allowedElements: ["heading"],
  minElements: 1,
  maxElements: 1,
  defaultElements: [
    {
      type: "heading",
      settings: {
        content: "Rubrik",
        size: "xs",
        alignment: "left",
        paddingTop: 16,
        paddingBottom: 16,
      },
      action: NO_ACTION,
      sortOrder: 0,
    },
  ],
};

const indicatorSlot: SlotDefinition = {
  key: "indicator",
  name: "Indikator",
  description: "Ikon som roteras 180° när dragspelet öppnas.",
  allowedElements: ["icon"],
  minElements: 1,
  maxElements: 1,
  defaultElements: [
    {
      type: "icon",
      settings: {
        name: "expand_more",
        fill: "outlined",
        size: 20,
        weight: 400,
        color: "#1a1a1a",
      },
      action: NO_ACTION,
      sortOrder: 0,
    },
  ],
};

const contentSlot: SlotDefinition = {
  key: "content",
  name: "Innehåll",
  description: "Textinnehåll som visas när dragspelet är öppet.",
  allowedElements: ["text"],
  minElements: 1,
  maxElements: 1,
  defaultElements: [
    {
      type: "text",
      settings: {
        content: "Svar",
        size: "sm",
        alignment: "left",
        paddingBottom: 17,
      },
      action: NO_ACTION,
      sortOrder: 0,
    },
  ],
};

// ─── Block Type: Accordion Item ──────────────────────────

const accordionItemBlockType: BlockTypeDefinition = {
  type: "accordion-item",
  version: "1.0.0",
  name: "Objekt",
  description: "En rad i dragspelet med rubrik, indikator och expanderbart innehåll.",
  icon: "bottom_navigation",
  slots: [titleSlot, indicatorSlot, contentSlot],
  settingsSchema: [],
  settingDefaults: {},
};

// ─── Helper: create one accordion item ───────────────────

function makeItem(
  heading: string,
  body: string,
  sortOrder: number,
) {
  return {
    type: "accordion-item" as const,
    settings: {},
    slots: {
      title: [
        {
          id: "",
          type: "heading" as const,
          settings: {
            content: heading,
            size: "xs",
            alignment: "left",
            paddingTop: 16,
            paddingBottom: 16,
          },
          action: NO_ACTION,
          sortOrder: 0,
        },
      ],
      indicator: [
        {
          id: "",
          type: "icon" as const,
          settings: {
            name: "expand_more",
            fill: "outlined",
            size: 20,
            weight: 400,
            color: "#1a1a1a",
          },
          action: NO_ACTION,
          sortOrder: 0,
        },
      ],
      content: [
        {
          id: "",
          type: "text" as const,
          settings: {
            content: body,
            size: "sm",
            alignment: "left",
            paddingBottom: 17,
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

// ─── Preset: Default ─────────────────────────────────────

const defaultPreset: SectionPreset = {
  key: "default",
  version: "1.0.0",
  name: "Standard",
  description: "Kantlinjer, chevron-indikator, 250ms övergångar.",
  thumbnail: "",
  cssClass: "s-accordion--default",

  blockTypes: [accordionItemBlockType],
  minBlocks: 1,
  maxBlocks: 20,

  settingsSchema: [
    {
      key: "borderColor",
      type: "color",
      label: "Kantfärg",
      default: "#E6E5E3",
    },
  ],
  settingDefaults: {
    borderColor: "#E6E5E3",
  },

  changeStrategy: "preserve_compatible",
  migrations: {},

  createDefaultBlocks: () => [
    makeItem(
      "Vad är incheckningstiden?",
      "Incheckning är från kl. 15:00. Kontakta oss om du behöver checka in tidigare.",
      0,
    ),
    makeItem(
      "Finns det parkering?",
      "Ja, vi erbjuder gratis parkering för alla gäster. Parkeringen ligger precis utanför entrén.",
      1,
    ),
    makeItem(
      "Kan jag ta med husdjur?",
      "Husdjur är välkomna i utvalda rum. Vänligen meddela oss i förväg så ordnar vi ett lämpligt rum.",
      2,
    ),
  ],
};

// ─── Preset: Card ────────────────────────────────────────

const cardPreset: SectionPreset = {
  key: "card",
  version: "1.0.0",
  name: "Kort",
  description: "Varje objekt i ett eget kort som fälls ut.",
  thumbnail: "",
  cssClass: "s-accordion--card",

  blockTypes: [accordionItemBlockType],
  minBlocks: 1,
  maxBlocks: 20,

  settingsSchema: [
    {
      key: "cardBackground",
      type: "color",
      label: "Kortfärg",
      default: "#F5F5F4",
    },
    {
      key: "cardRadius",
      type: "range",
      label: "Hörnradie",
      default: 12,
      min: 0,
      max: 24,
      step: 2,
      unit: "px",
    },
  ],
  settingDefaults: {
    cardBackground: "#F5F5F4",
    cardRadius: 12,
  },

  changeStrategy: "preserve_compatible",
  migrations: {},

  createDefaultBlocks: () => [
    makeItem(
      "Vad är incheckningstiden?",
      "Incheckning är från kl. 15:00. Kontakta oss om du behöver checka in tidigare.",
      0,
    ),
    makeItem(
      "Finns det parkering?",
      "Ja, vi erbjuder gratis parkering för alla gäster. Parkeringen ligger precis utanför entrén.",
      1,
    ),
    makeItem(
      "Kan jag ta med husdjur?",
      "Husdjur är välkomna i utvalda rum. Vänligen meddela oss i förväg så ordnar vi ett lämpligt rum.",
      2,
    ),
  ],
};

// ─── Section Definition ─────────────────────────────────

export const accordionSection: SectionDefinition = {
  id: "accordion",
  version: "1.0.0",
  name: "Dragspel",
  description: "Expanderbar lista — perfekt för vanliga frågor och svar.",
  category: "content",
  tags: ["accordion", "dragspel", "faq", "frågor", "expanderbar"],
  thumbnail: "",

  settingsSchema: [
    {
      key: "iconPosition",
      type: "segmented",
      label: "Ikonposition",
      default: "right",
      options: [
        { value: "left", label: "Vänster" },
        { value: "right", label: "Höger" },
      ],
    },
    {
      key: "gap",
      type: "range",
      label: "Utrymme mellan objekt",
      default: 0,
      min: 0,
      max: 32,
      step: 2,
      unit: "px",
    },
    {
      key: "defaultMode",
      type: "select",
      label: "Välj standardläge",
      default: "all_closed",
      options: [
        { value: "all_closed", label: "Alla objekt stängda" },
        { value: "first_open", label: "Första objektet öppnat" },
        { value: "all_open", label: "Alla objekt öppnade" },
      ],
    },
    {
      key: "allowMultiple",
      type: "toggle",
      label: "Tillåt flera öppnade objekt",
      default: false,
    },
    {
      key: "useTransition",
      type: "toggle",
      label: "Använd övergångseffekter",
      default: true,
    },
  ],
  settingDefaults: {
    iconPosition: "right",
    gap: 0,
    defaultMode: "all_closed",
    allowMultiple: false,
    useTransition: true,
  },

  presets: [defaultPreset, cardPreset],

  createDefault: () => ({
    definitionId: "accordion",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    isActive: true,
    settings: {},
    presetSettings: {},
    blocks: [],
    title: "Dragspel",
  }),
};

registerSectionDefinition(accordionSection);
