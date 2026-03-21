/**
 * Section Definition: Textblock
 * ─────────────────────────────
 * Card-style container with multiple text units.
 * Each block: heading + body, center-aligned.
 * Divider between blocks via CSS border — not an element.
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
        content: "Rubrik",
        size: "sm",
        alignment: "center",
      },
      action: NO_ACTION,
      sortOrder: 0,
    },
    {
      type: "text",
      settings: {
        content: "En kort beskrivning av ämnet.",
        size: "sm",
        alignment: "center",
      },
      action: NO_ACTION,
      sortOrder: 1,
    },
  ],
};

// ─── Block Type ─────────────────────────────────────────

const textBlockType: BlockTypeDefinition = {
  type: "text-block",
  version: "1.0.0",
  name: "Textblock",
  description: "Rubrik och brödtext.",
  icon: "article",
  slots: [contentSlot],
  settingsSchema: [],
  settingDefaults: {},
};

// ─── Default Block Factory ──────────────────────────────

function makeBlock(heading: string, body: string, sortOrder: number) {
  return {
    type: "text-block" as const,
    settings: {},
    slots: {
      content: [
        {
          id: "",
          type: "heading" as const,
          settings: {
            content: heading,
            size: "sm",
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
    },
    sortOrder,
    isActive: true,
  };
}

// ─── Preset: Default ────────────────────────────────────

const defaultPreset: SectionPreset = {
  key: "default",
  version: "1.0.0",
  name: "Textblock",
  description: "Kort med textblock separerade med linje.",
  thumbnail: "",
  cssClass: "s-text-blocks--default",

  blockTypes: [textBlockType],
  minBlocks: 1,
  maxBlocks: -1,

  settingsSchema: [],
  settingDefaults: {},

  changeStrategy: "preserve_compatible",
  migrations: {},

  createDefaultBlocks: () => [
    makeBlock("Incheckning", "Incheckning sker från kl. 15:00. Kontakta receptionen vid tidig ankomst.", 0),
    makeBlock("Utcheckning", "Utcheckning senast kl. 11:00. Sen utcheckning kan erbjudas vid tillgänglighet.", 1),
  ],
};

// ─── Section Definition ─────────────────────────────────

export const textBlocksSection: SectionDefinition = {
  id: "text-blocks",
  version: "1.0.0",
  name: "Textblock",
  description: "Kort med centrerade textblock separerade med linjer.",
  category: "content",
  tags: ["text", "block", "info", "kort", "innehåll"],
  thumbnail: "",
  scope: "free",

  settingsSchema: [],
  settingDefaults: {},

  presets: [defaultPreset],

  createDefault: () => ({
    definitionId: "text-blocks",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    isActive: true,
    settings: {},
    presetSettings: {},
    blocks: [],
    title: "Textblock",
  }),
};

registerSectionDefinition(textBlocksSection);
