/**
 * Section Definition: Purchase Block
 * ───────────────────────────────────
 * Sidebar section for the product page.
 * Contains: price, booking form (dates/guests), buy button.
 * Locked to product page.
 */

import type { SectionDefinition, SectionPreset } from "../types";
import { NO_ACTION } from "../types";
import { registerSectionDefinition } from "../registry";

const defaultPreset: SectionPreset = {
  key: "default",
  version: "1.0.0",
  name: "Standard",
  description: "Pris, datumväljare och köpknapp.",
  thumbnail: "",
  cssClass: "s-purchase--default",

  blockTypes: [
    {
      type: "purchase-content",
      version: "1.0.0",
      name: "Köpblock",
      description: "Pris, datum och köpknapp.",
      icon: "shopping_cart",
      slots: [
        {
          key: "content",
          name: "Innehåll",
          description: "Köpblockets element.",
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
      type: "purchase-content" as const,
      settings: {},
      slots: {
        content: [
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

export const purchaseBlockSection: SectionDefinition = {
  id: "purchase-block",
  version: "1.0.0",
  name: "Köpblock",
  description: "Pris, datumväljare och köpknapp.",
  category: "content",
  tags: ["purchase", "buy", "köp", "pris", "bokning"],
  thumbnail: "",
  scope: "locked",
  lockedTo: "product",
  editableFields: [],

  settingsSchema: [],
  settingDefaults: {},

  presets: [defaultPreset],

  createDefault: () => ({
    definitionId: "purchase-block",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    isActive: true,
    locked: true,
    settings: {},
    presetSettings: {},
    blocks: [],
    title: "Köpblock",
  }),
};

registerSectionDefinition(purchaseBlockSection);
