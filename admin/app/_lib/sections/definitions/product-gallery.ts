/**
 * Section Definition: Product Gallery
 * ────────────────────────────────────
 * Locked section for the product page. Renders product images
 * in a 1+4 mosaic layout (1 large left, 4 small right).
 *
 * Images are pulled dynamically from the product's media config —
 * no manual image list in settings. The section is purely structural.
 */

import type { SectionDefinition, SectionPreset } from "../types";
import { registerSectionDefinition } from "../registry";

const defaultPreset: SectionPreset = {
  key: "default",
  version: "1.0.0",
  name: "Standard",
  description: "1 stor bild + 4 miniatyrer i rutnät.",
  thumbnail: "",
  cssClass: "s-product-gallery--default",

  blockTypes: [
    {
      type: "__placeholder",
      version: "1.0.0",
      name: "Placeholder",
      description: "Unused — locked section, no user blocks.",
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

  settingsSchema: [
    {
      key: "cornerRadius",
      type: "range",
      label: "Hörnradie",
      default: 12,
      min: 0,
      max: 24,
      step: 2,
      unit: "px",
    },
    {
      key: "gap",
      type: "range",
      label: "Mellanrum",
      default: 10,
      min: 0,
      max: 24,
      step: 2,
      unit: "px",
    },
  ],
  settingDefaults: {
    cornerRadius: 12,
    gap: 10,
  },

  changeStrategy: "reset",
  migrations: {},
  createDefaultBlocks: () => [],
};

export const productGallerySection: SectionDefinition = {
  id: "product-gallery",
  version: "1.0.0",
  name: "Produktgalleri",
  description: "Visar produktbilder i 1+4 rutnät.",
  category: "media",
  tags: ["product", "gallery", "galleri", "bilder", "produkt"],
  thumbnail: "",
  scope: "locked",
  lockedTo: "product",
  editableFields: ["cornerRadius", "gap"],

  settingsSchema: [],
  settingDefaults: {},

  presets: [defaultPreset],

  createDefault: () => ({
    definitionId: "product-gallery",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    isActive: true,
    locked: true,
    settings: {},
    presetSettings: { cornerRadius: 12, gap: 10 },
    blocks: [],
    title: "Produktgalleri",
  }),
};

registerSectionDefinition(productGallerySection);
