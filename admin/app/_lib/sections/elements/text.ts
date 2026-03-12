import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Text element — body/paragraph text.
 *
 * Mirrors heading's panel layout: richtext input (hideLabel),
 * text size, alignment, and hidden link field.
 * Sizes are tuned for body text (smaller range than heading).
 */
export const textElement: ElementDefinition = {
  type: "text",
  version: "2.0.0",
  name: "Text",
  description: "Brödtext eller kort beskrivning.",
  icon: "view_headline",
  supportsAction: false,
  skipPresetPicker: true,

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
    link: null,
  },

  presets: [
    {
      key: "center",
      name: "Centrerad",
      description: "Text centrerad",
      thumbnail: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773174437/center_xtcgv4.png",
      settingOverrides: { alignment: "center" },
    },
    {
      key: "left",
      name: "Vänsterjusterad",
      description: "Text vänsterjusterad",
      thumbnail: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773174437/v%C3%A4nster_ggq9ft.png",
      settingOverrides: { alignment: "left" },
    },
    {
      key: "right",
      name: "Högerjusterad",
      description: "Text högerjusterad",
      thumbnail: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773174436/h%C3%B6ger_centrerad_fibuzh.png",
      settingOverrides: { alignment: "right" },
    },
  ],
};

registerElementDefinition(textElement);
