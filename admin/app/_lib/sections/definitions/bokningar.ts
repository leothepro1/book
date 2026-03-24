/**
 * Section Definition: Bokningar
 * ─────────────────────────────
 * Platform-controlled section for the stays page.
 *
 * This is a LOCKED section — it has no blocks or elements.
 * All configuration lives in section-level settings and preset settings.
 * The stays page renderer reads these settings directly.
 *
 * This section is:
 *   - Auto-seeded when the stays page has no sections
 *   - Locked (cannot be deleted by tenants)
 *   - Flat in the editor tree (no expand/collapse)
 */

import type { SectionDefinition, SectionPreset } from "../types";
import { registerSectionDefinition } from "../registry";

// ─── Preset: default ────────────────────────────────────────

const defaultPreset: SectionPreset = {
  key: "default",
  version: "1.0.0",
  name: "Standard",
  description: "Standardlayout med två flikar.",
  thumbnail: "",
  cssClass: "s-bokningar--default",

  // No blocks — locked sections store config in settings only
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

  settingsSchema: [
    {
      key: "cardImageUrl",
      type: "image",
      label: "Kortbild",
      tooltip: "Bilden hämtas från PMS för boendetypen. Lägg till en reservbild som backup.",
      default: "",
      group: "Innehåll",
    },
    {
      key: "layout",
      type: "segmented",
      label: "Visningsläge",
      default: "tabs",
      group: "Layout",
      options: [
        { value: "tabs", label: "Flikar" },
        { value: "list", label: "Lista" },
      ],
    },
    {
      key: "cardShadow",
      type: "toggle",
      label: "Använd skugga",
      default: true,
      group: "Design",
    },
  ],
  settingDefaults: {
    layout: "tabs",
    tabCurrentLabel: "Aktuella",
    tabPreviousLabel: "Tidigare",
    cardShadow: true,
    cardImageUrl: "",
  },

  changeStrategy: "reset",
  migrations: {},
  createDefaultBlocks: () => [],
};

// ─── Section Definition ─────────────────────────────────────

export const bokningarSection: SectionDefinition = {
  id: "bokningar",
  version: "1.0.0",
  name: "Bokningar",
  description: "Bokningsöversikt med flikar för aktuella och tidigare vistelser.",
  category: "content",
  tags: ["bokningar", "stays", "bookings"],
  thumbnail: "",
  scope: "locked",
  editableFields: ["cardLayout", "heading", "description", "layout", "cardShadow", "cardImageUrl", "colorSchemeId", "paddingTop"],

  settingsSchema: [
    {
      key: "heading",
      type: "richtext",
      label: "Rubrik",
      default: "Bokningar",
      required: true,
      hideLabel: false,
      group: "Innehåll",
    },
    {
      key: "description",
      type: "richtext",
      label: "Text",
      default: "",
      hideLabel: false,
      group: "Innehåll",
    },
    {
      key: "cardLayout",
      type: "layoutPicker",
      label: "Layout",
      default: "horizontal",
      group: "Layout",
      layoutOptions: [
        {
          value: "horizontal",
          label: "Horisontell",
          image: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773842581/horisonzel_fvzrlj.png",
        },
        {
          value: "vertical",
          label: "Vertikal",
          image: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773842581/vertical_32_mmybtk.png",
        },
      ],
    },
  ],
  settingDefaults: {
    heading: "Bokningar",
    description: "",
    cardLayout: "horizontal",
    paddingTop: 19,
    paddingRight: 17,
    paddingBottom: 124,
    paddingLeft: 17,
  },

  presets: [defaultPreset],

  createDefault: () => ({
    definitionId: "bokningar",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    isActive: true,
    locked: true,
    settings: {
      heading: "Bokningar",
    },
    presetSettings: {
      layout: "tabs",
      tabCurrentLabel: "Aktuella",
      tabPreviousLabel: "Tidigare",
      cardShadow: true,
      cardImageUrl: "",
    },
    blocks: [],
    title: "Bokningar",
  }),
};

registerSectionDefinition(bokningarSection);
