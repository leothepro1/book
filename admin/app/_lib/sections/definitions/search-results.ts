/**
 * Section Definition: Search Results
 * ───────────────────────────────────
 * Locked section for the stays/search page.
 * Renders the compact search form + availability results.
 * Platform-controlled — tenants can toggle visibility but not edit content.
 */

import type { SectionDefinition, SectionPreset } from "../types";
import { registerSectionDefinition } from "../registry";

const defaultPreset: SectionPreset = {
  key: "default",
  version: "1.0.0",
  name: "Standard",
  description: "Sökformulär och tillgänglighetsresultat.",
  thumbnail: "",
  cssClass: "s-search-results--default",

  blockTypes: [
    {
      type: "__placeholder",
      version: "1.0.0",
      name: "Placeholder",
      description: "Unused — locked section.",
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

export const searchResultsSection: SectionDefinition = {
  id: "search-results",
  version: "1.0.0",
  name: "Sökresultat",
  description: "Sökformulär och tillgänglighetsresultat från PMS.",
  category: "content",
  tags: ["search", "results", "sök", "resultat", "boende"],
  thumbnail: "",
  scope: "locked",
  lockedTo: "stays",
  editableFields: [],

  settingsSchema: [],
  settingDefaults: {},

  presets: [defaultPreset],

  createDefault: () => ({
    definitionId: "search-results",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    isActive: true,
    locked: true,
    settings: {},
    presetSettings: {},
    blocks: [],
    title: "Sökresultat",
  }),
};

registerSectionDefinition(searchResultsSection);
