/**
 * Section Definition: Produktserie (Featured Collection)
 * ──────────────────────────────────────────────────────
 * Data-driven product grid. Tenant picks a collection via
 * collectionPicker — products are fetched live via dataSources.
 *
 * Each product renders as a card: image, title, price.
 * No manual block editing — content comes from the product catalog.
 *
 * Shopify equivalent: "Featured collection" section.
 */

import type { SectionDefinition, SectionPreset } from "../types";
import { registerSectionDefinition } from "../registry";

// ─── Preset: Default ────────────────────────────────────

const defaultPreset: SectionPreset = {
  key: "default",
  version: "1.0.0",
  name: "Rutnät",
  description: "Produktkort i rutnät — bild, titel, pris.",
  thumbnail: "",
  cssClass: "s-produktserie--default",

  blockTypes: [],
  minBlocks: 0,
  maxBlocks: 0,

  settingsSchema: [
    {
      key: "columns",
      type: "range",
      label: "Kolumner på skrivbordet",
      default: 3,
      min: 1,
      max: 6,
      step: 1,
    },
    {
      key: "aspectRatio",
      type: "select",
      label: "Bildformat",
      default: "1:1",
      options: [
        { value: "1:1", label: "Kvadrat (1:1)" },
        { value: "3:4", label: "Porträtt (3:4)" },
        { value: "4:3", label: "Landskap (4:3)" },
        { value: "16:9", label: "Widescreen (16:9)" },
      ],
    },
    {
      key: "maxProducts",
      type: "range",
      label: "Max antal produkter",
      default: 12,
      min: 1,
      max: 50,
      step: 1,
    },
    {
      key: "showPrice",
      type: "toggle",
      label: "Visa pris",
      default: true,
      group: "Produktkort",
    },
    {
      key: "showCompareAtPrice",
      type: "toggle",
      label: "Visa ordinarie pris",
      default: true,
      group: "Produktkort",
    },
    {
      key: "showSecondImage",
      type: "toggle",
      label: "Visa andra bild på hovring",
      default: false,
      group: "Produktkort",
    },
    {
      key: "mobileColumns",
      type: "segmented",
      label: "Antal kolumner",
      default: "2",
      options: [
        { value: "1", label: "1 kolumn" },
        { value: "2", label: "2 kolumner" },
      ],
      group: "Mobil",
    },
  ],
  settingDefaults: {
    columns: "3",
    aspectRatio: "1:1",
    maxProducts: 12,
    showPrice: true,
    showCompareAtPrice: true,
    showSecondImage: false,
    mobileColumns: "2",
  },

  changeStrategy: "preserve_compatible",
  migrations: {},

  createDefaultBlocks: () => [],
};

// ─── Section Definition ─────────────────────────────────

export const produktserieSection: SectionDefinition = {
  id: "produktserie",
  version: "1.0.0",
  name: "Produktserie",
  description: "Visa produkter från en kollektion — bild, titel och pris.",
  category: "content",
  tags: ["produkt", "kollektion", "serie", "shop", "pris", "kort"],
  thumbnail: "",
  scope: "free",

  dataSources: [
    { key: "collection", type: "collection", settingKey: "collectionId" },
  ],

  settingsSchema: [
    {
      key: "collectionId",
      type: "collectionPicker",
      label: "Produktserie",
      default: "",
    },
    {
      key: "heading",
      type: "richtext",
      label: "Rubrik",
      default: "Utvald produktserie",
    },
    {
      key: "headingSize",
      type: "segmented",
      label: "Rubrikstorlek",
      default: "md",
      options: [
        { value: "sm", label: "Liten" },
        { value: "md", label: "Medel" },
        { value: "lg", label: "Stor" },
      ],
    },
    {
      key: "description",
      type: "richtext",
      label: "Beskrivning",
      default: "",
    },
    {
      key: "showDescription",
      type: "toggle",
      label: "Visa produktseriebeskrivning",
      default: false,
    },
  ],
  settingDefaults: {
    collectionId: "",
    heading: "",
    headingSize: "md",
    showDescription: false,
    description: "",
  },

  presets: [defaultPreset],

  createDefault: () => ({
    definitionId: "produktserie",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    isActive: true,
    settings: { heading: "Utvald produktserie" },
    presetSettings: {},
    blocks: [],
    title: "Produktserie",
  }),
};

registerSectionDefinition(produktserieSection);
