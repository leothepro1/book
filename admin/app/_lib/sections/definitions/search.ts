/**
 * Section Definition: Search
 * ──────────────────────────
 * Platform-controlled search container for the booking engine.
 * Tightly coupled to PMS — renders the Airbnb-style morphing search bar
 * with accommodation type, date range, and guest count panels.
 *
 * This is a LOCKED section — no blocks or elements.
 * Tenants can toggle visibility but cannot delete, add, or reorder.
 * editableFields will be added later for accent color, labels, etc.
 */

import type { SectionDefinition, SectionPreset } from "../types";
import { registerSectionDefinition } from "../registry";

// ─── Preset: default ────────────────────────────────────────

const defaultPreset: SectionPreset = {
  key: "default",
  version: "1.0.0",
  name: "Standard",
  description: "Morfande sökfält med paneler för boendetyp, datum och gäster.",
  thumbnail: "",
  cssClass: "s-search--default",

  blockTypes: [
    {
      type: "__placeholder",
      version: "1.0.0",
      name: "Placeholder",
      description: "Unused — locked sections have no blocks.",
      icon: "block",
      slots: [
        {
          key: "content",
          name: "Innehåll",
          description: "Unused.",
          allowedElements: ["heading"],
          minElements: 0,
          maxElements: 0,
          defaultElements: [],
        },
      ],
      settingsSchema: [],
      settingDefaults: {},
    },
  ],
  minBlocks: 0,
  maxBlocks: 0,

  settingsSchema: [],
  settingDefaults: {},

  changeStrategy: "reset",
  migrations: {},
  createDefaultBlocks: () => [],
};

// ─── Section Definition ─────────────────────────────────────

export const searchSection: SectionDefinition = {
  id: "search",
  version: "1.0.0",
  name: "Sökformulär",
  description: "Bokningssök med boendetyp, datum och gäster. Kopplat till PMS.",
  category: "content",
  tags: ["search", "booking", "sök", "bokning"],
  thumbnail: "",
  scope: "locked",
  lockedTo: ["home", "stays"],
  editableFields: [],

  settingsSchema: [],
  settingDefaults: {},

  presets: [defaultPreset],

  createDefault: () => ({
    definitionId: "search",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    isActive: true,
    locked: true,
    settings: {},
    presetSettings: {},
    blocks: [],
    title: "Sökformulär",
  }),
};

registerSectionDefinition(searchSection);
