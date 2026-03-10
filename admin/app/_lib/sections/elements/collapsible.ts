import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Collapsible text element — body text with a toggle link.
 *
 * Shows truncated/collapsed text by default. A toggle link at the
 * bottom toggles between collapsed and expanded states. The tenant
 * configures the label for each state (e.g. "Visa mer" / "Visa mindre").
 */
export const collapsibleElement: ElementDefinition = {
  type: "collapsible",
  version: "1.0.0",
  name: "Hopfällbar text",
  description: "Brödtext med visa mer / visa mindre.",
  icon: "text",
  supportsAction: false,

  settingsSchema: [
    {
      key: "content",
      type: "richtext",
      label: "Text",
      description: "Brödtextinnehåll.",
      default: "Skriv din text här…",
      required: true,
      hideLabel: true,
    },
    {
      key: "size",
      type: "select",
      label: "Textstorlek",
      default: "md",
      options: [
        { value: "xs", label: "Extra liten" },
        { value: "sm", label: "Liten" },
        { value: "md", label: "Medium" },
        { value: "lg", label: "Stor" },
      ],
    },
    {
      key: "alignment",
      type: "segmented",
      label: "Justering",
      default: "left",
      options: [
        { value: "left", label: "Vänster" },
        { value: "center", label: "Center" },
        { value: "right", label: "Höger" },
      ],
    },
    {
      key: "label_closed",
      type: "text",
      label: "Länktext (stängd)",
      default: "Visa mer",
    },
    {
      key: "label_open",
      type: "text",
      label: "Länktext (öppen)",
      default: "Visa mindre",
    },
    {
      key: "toggle_style",
      type: "select",
      label: "Växlarstil",
      default: "underline",
      hidden: true,
      options: [
        { value: "underline", label: "Understruken" },
        { value: "chevron", label: "Chevron" },
        { value: "button", label: "Knapp" },
      ],
    },
    {
      key: "link",
      type: "link",
      label: "Länk",
      hidden: true,
    },
  ],

  settingDefaults: {
    content: "Skriv din text här…",
    size: "md",
    alignment: "left",
    label_closed: "Visa mer",
    label_open: "Visa mindre",
    toggle_style: "underline",
    link: null,
  },

  presets: [
    {
      key: "underline",
      name: "Understruken",
      description: "Visa mer med understruken länk",
      thumbnail: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773175004/show_more_1_preset_kiorbt.png",
      settingOverrides: { toggle_style: "underline" },
    },
    {
      key: "chevron",
      name: "Chevron",
      description: "Visa mer med chevron-ikon",
      thumbnail: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773175004/show_more_2_bur4ik.png",
      settingOverrides: { toggle_style: "chevron" },
    },
    {
      key: "button",
      name: "Knapp",
      description: "Visa mer i en knapp",
      thumbnail: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773175004/show_more_321_i40ust.png",
      settingOverrides: { toggle_style: "button" },
    },
  ],
};

registerElementDefinition(collapsibleElement);
