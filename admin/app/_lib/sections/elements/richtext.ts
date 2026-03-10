import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Rich text element — composite heading + body text.
 *
 * Architectural decision: this is a SINGLE element with grouped settings,
 * not a container with child elements. This keeps the element model flat
 * and avoids introducing a new "composite" abstraction layer.
 *
 * Settings are prefixed (heading_*, text_*) to avoid key collisions.
 * The `group` field on SettingField drives panel section labels.
 * Each group mirrors the panel layout of its standalone counterpart
 * (Rubrik / Text) exactly.
 */
export const richtextElement: ElementDefinition = {
  type: "richtext",
  version: "1.0.0",
  name: "Rich text",
  description: "Rubrik och brödtext i ett element.",
  icon: "text",
  supportsAction: false,
  skipPresetPicker: true,

  settingsSchema: [
    // ── Rubrik group ──
    {
      key: "heading_content",
      type: "richtext",
      label: "Text",
      description: "Rubrikens textinnehåll.",
      default: "Rubrik",
      required: true,
      hideLabel: true,
      group: "Rubrik",
    },
    {
      key: "heading_size",
      type: "select",
      label: "Textstorlek",
      default: "md",
      group: "Rubrik",
      options: [
        { value: "sm", label: "Liten" },
        { value: "md", label: "Medium" },
        { value: "lg", label: "Stor" },
        { value: "xl", label: "Extra stor" },
      ],
    },
    {
      key: "heading_alignment",
      type: "segmented",
      label: "Justering",
      default: "center",
      group: "Rubrik",
      options: [
        { value: "left", label: "Vänster" },
        { value: "center", label: "Center" },
        { value: "right", label: "Höger" },
      ],
    },
    {
      key: "heading_link",
      type: "link",
      label: "Länk",
      hidden: true,
      group: "Rubrik",
    },

    // ── Text group ──
    {
      key: "text_content",
      type: "richtext",
      label: "Text",
      description: "Brödtextinnehåll.",
      default: "Skriv din text här…",
      required: true,
      hideLabel: true,
      group: "Text",
    },
    {
      key: "text_size",
      type: "select",
      label: "Textstorlek",
      default: "md",
      group: "Text",
      options: [
        { value: "xs", label: "Extra liten" },
        { value: "sm", label: "Liten" },
        { value: "md", label: "Medium" },
        { value: "lg", label: "Stor" },
      ],
    },
    {
      key: "text_alignment",
      type: "segmented",
      label: "Justering",
      default: "left",
      group: "Text",
      options: [
        { value: "left", label: "Vänster" },
        { value: "center", label: "Center" },
        { value: "right", label: "Höger" },
      ],
    },
    {
      key: "text_link",
      type: "link",
      label: "Länk",
      hidden: true,
      group: "Text",
    },
  ],

  settingDefaults: {
    heading_content: "Rubrik",
    heading_size: "md",
    heading_alignment: "center",
    heading_link: null,
    text_content: "Skriv din text här…",
    text_size: "md",
    text_alignment: "left",
    text_link: null,
  },

  presets: [
    {
      key: "center",
      name: "Centrerad",
      description: "Rubrik och text centrerade",
      thumbnail: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773174143/center_321_mibswv.png",
      settingOverrides: { heading_alignment: "center", text_alignment: "center" },
    },
    {
      key: "left",
      name: "Vänsterjusterad",
      description: "Rubrik och text vänsterjusterade",
      thumbnail: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773174152/uiouiouoiu_wmnnwo.png",
      settingOverrides: { heading_alignment: "left", text_alignment: "left" },
    },
    {
      key: "right",
      name: "Högerjusterad",
      description: "Rubrik och text högerjusterade",
      thumbnail: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773174153/gdfsgd_lqvea2.png",
      settingOverrides: { heading_alignment: "right", text_alignment: "right" },
    },
  ],
};

registerElementDefinition(richtextElement);
