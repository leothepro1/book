/**
 * Section Definition: Product Content
 * ────────────────────────────────────
 * 65/35 split layout for the product page.
 * Left column: highlights, description, features.
 * Right column: reserved for booking/cart sidebar (future).
 * Locked to product page.
 */

import type { SectionDefinition, SectionPreset } from "../types";
import { NO_ACTION } from "../types";
import { registerSectionDefinition } from "../registry";

const defaultPreset: SectionPreset = {
  key: "default",
  version: "1.0.0",
  name: "Standard",
  description: "65/35 split med produktinnehåll.",
  thumbnail: "",
  cssClass: "s-product-content--default",

  blockTypes: [
    {
      type: "content-block",
      version: "1.0.0",
      name: "Innehåll",
      description: "Produktinnehåll.",
      icon: "article",
      slots: [
        {
          key: "main",
          name: "Huvudinnehåll",
          description: "Vänster kolumn — fritt innehåll.",
          allowedElements: [
            "product-title",
            "product-description",
            "product-highlights",
            "product-features",
            "accommodation-highlights",
            "divider",
            "heading",
            "text",
          ],
          minElements: 0,
          maxElements: 20,
          defaultElements: [],
        },
        {
          key: "sidebar",
          name: "Köpblock",
          description: "Höger kolumn — pris, datum, köpknapp.",
          allowedElements: [
            "product-price",
            "product-booking-form",
            "add-to-cart",
            "divider",
          ],
          minElements: 1,
          maxElements: 10,
          defaultElements: [
            { type: "product-price", settings: { size: "lg" }, action: NO_ACTION, sortOrder: 0 },
            { type: "product-booking-form", settings: {}, action: NO_ACTION, sortOrder: 1 },
            { type: "add-to-cart", settings: { label: "Boka nu", outline: false, width: "full", icon: "", icon_placement: "left", icon_size: 20, icon_weight: 400, icon_fill: "outlined" }, action: NO_ACTION, sortOrder: 2 },
          ],
        },
      ],
      settingsSchema: [],
      settingDefaults: {},
    },
  ],
  minBlocks: 1,
  maxBlocks: 1,

  settingsSchema: [],
  settingDefaults: {},

  changeStrategy: "reset",
  migrations: {},
  createDefaultBlocks: () => [
    {
      type: "content-block" as const,
      settings: {},
      slots: {
        main: [],
        sidebar: [
          { id: "", type: "product-price" as const, settings: { size: "lg" }, action: NO_ACTION, sortOrder: 0 },
          { id: "", type: "product-booking-form" as const, settings: {}, action: NO_ACTION, sortOrder: 1 },
          { id: "", type: "add-to-cart" as const, settings: { label: "Boka nu", outline: false, width: "full", icon: "", icon_placement: "left", icon_size: 20, icon_weight: 400, icon_fill: "outlined" }, action: NO_ACTION, sortOrder: 2 },
        ],
      },
      sortOrder: 0,
      isActive: true,
    },
  ],
};

export const productContentSection: SectionDefinition = {
  id: "product-content",
  version: "1.0.0",
  name: "Produktinnehåll",
  description: "Huvudinnehåll med titel, höjdpunkter, beskrivning och egenskaper.",
  category: "content",
  tags: ["product", "content", "produkt", "innehåll"],
  thumbnail: "",
  scope: "locked",
  lockedTo: "product",
  editableFields: [],

  settingsSchema: [],
  settingDefaults: {},

  presets: [defaultPreset],

  createDefault: () => ({
    definitionId: "product-content",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    isActive: true,
    locked: true,
    settings: {},
    presetSettings: {},
    blocks: [],
    title: "Produktinnehåll",
  }),
};

registerSectionDefinition(productContentSection);
