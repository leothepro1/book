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
  editableFields: [
    // Innehåll
    "emptyHeading",
    "emptyDescription",
    "noResultsHeading",
    "noResultsDescription",
    // Färger
    "bgColor",
    "textColor",
    "buttonColor",
    "accentColor",
    "showShadow",
    // Typografi
    "headingFont",
    "bodyFont",
    "buttonFont",
  ],

  settingsSchema: [
    // ── Innehåll (ingen grupp — renderas först utan label) ──
    {
      key: "emptyHeading",
      type: "richtext",
      label: "Rubrik (ingen sökning)",
      default: "Lediga boenden",
    },
    {
      key: "emptyDescription",
      type: "richtext",
      label: "Beskrivning (ingen sökning)",
      default: "Välj datum och antal gäster för att se tillgänglighet och priser.",
    },
    {
      key: "noResultsHeading",
      type: "richtext",
      label: "Rubrik (inga resultat)",
      default: "Inga lediga boenden",
    },
    {
      key: "noResultsDescription",
      type: "richtext",
      label: "Beskrivning (inga resultat)",
      default: "Prova andra datum eller färre gäster.",
    },
    {
      key: "showShadow",
      type: "toggle",
      label: "Visa skugga",
      default: true,
    },
    // ── Färger ──
    {
      key: "bgColor",
      type: "color",
      label: "Bakgrundsfärg",
      default: "#FFFFFF",
      group: "Färger",
    },
    {
      key: "textColor",
      type: "color",
      label: "Textfärg",
      default: "#202020",
      group: "Färger",
    },
    {
      key: "buttonColor",
      type: "color",
      label: "Knappar",
      default: "#1a1a1a",
      group: "Färger",
    },
    {
      key: "accentColor",
      type: "color",
      label: "Accentfärg",
      default: "#207EA9",
      group: "Färger",
    },
    // ── Typografi ──
    {
      key: "headingFont",
      type: "fontPicker",
      label: "Rubriker",
      default: "",
      group: "Typografi",
    },
    {
      key: "bodyFont",
      type: "fontPicker",
      label: "Brödtext",
      default: "",
      group: "Typografi",
    },
    {
      key: "buttonFont",
      type: "fontPicker",
      label: "Knappar",
      default: "",
      group: "Typografi",
    },
  ],
  settingDefaults: {
    emptyHeading: "Lediga boenden",
    emptyDescription: "Välj datum och antal gäster för att se tillgänglighet och priser.",
    noResultsHeading: "Inga lediga boenden",
    noResultsDescription: "Prova andra datum eller färre gäster.",
    bgColor: "#FFFFFF",
    textColor: "#202020",
    buttonColor: "#1a1a1a",
    accentColor: "#207EA9",
    headingFont: "",
    bodyFont: "",
    buttonFont: "",
    showShadow: true,
  },

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
