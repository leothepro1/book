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
          description: "Vänster kolumn — produktinformation.",
          allowedElements: [
            "product-title",
            "product-description",
            "product-highlights",
            "product-features",
            "divider",
            "heading",
            "text",
          ],
          minElements: 1,
          maxElements: 20,
          defaultElements: [
            { type: "product-title", settings: { size: "lg", alignment: "left" }, action: NO_ACTION, sortOrder: 0 },
            { type: "divider", settings: { thickness: 1, style: "solid" }, action: NO_ACTION, sortOrder: 1 },
            { type: "product-highlights", settings: { iconSize: 24 }, action: NO_ACTION, sortOrder: 2 },
            { type: "divider", settings: { thickness: 1, style: "solid" }, action: NO_ACTION, sortOrder: 3 },
            { type: "product-description", settings: { size: "md", alignment: "left" }, action: NO_ACTION, sortOrder: 4 },
            { type: "divider", settings: { thickness: 1, style: "solid" }, action: NO_ACTION, sortOrder: 5 },
            { type: "product-features", settings: { columns: "3", iconSize: 20 }, action: NO_ACTION, sortOrder: 6 },
          ],
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
        main: [
          { id: "", type: "product-title" as const, settings: { size: "lg", alignment: "left" }, action: NO_ACTION, sortOrder: 0 },
          { id: "", type: "divider" as const, settings: { thickness: 1, style: "solid" }, action: NO_ACTION, sortOrder: 1 },
          { id: "", type: "product-highlights" as const, settings: { iconSize: 24 }, action: NO_ACTION, sortOrder: 2 },
          { id: "", type: "divider" as const, settings: { thickness: 1, style: "solid" }, action: NO_ACTION, sortOrder: 3 },
          { id: "", type: "product-description" as const, settings: { size: "md", alignment: "left" }, action: NO_ACTION, sortOrder: 4 },
          { id: "", type: "divider" as const, settings: { thickness: 1, style: "solid" }, action: NO_ACTION, sortOrder: 5 },
          { id: "", type: "product-features" as const, settings: { columns: "3", iconSize: 20 }, action: NO_ACTION, sortOrder: 6 },
        ],
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
