import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

export const headingElement: ElementDefinition = {
  type: "heading",
  version: "1.0.0",
  name: "Rubrik",
  description: "Rubriktext i olika storlekar (H1–H6).",
  icon: "title",
  supportsAction: false,
  skipPresetPicker: true,

  settingsSchema: [
    {
      key: "content",
      type: "richtext",
      label: "Text",
      description: "Rubrikens textinnehåll.",
      default: "Rubrik",
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
        { value: "xl", label: "Extra stor" },
      ],
    },
    {
      key: "alignment",
      type: "segmented",
      label: "Justering",
      default: "center",
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
    content: "Rubrik",
    size: "md",
    alignment: "center",
    link: null,
  },

  presets: [
    {
      key: "center",
      name: "Centrerad rubrik",
      description: "Rubrik centrerad i mitten",
      thumbnail: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773172780/centrerad_uw7eda.png",
      settingOverrides: { alignment: "center" },
    },
    {
      key: "left",
      name: "Vänsterjusterad rubrik",
      description: "Rubrik justerad till vänster",
      thumbnail: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773172780/left_pmaeij.png",
      settingOverrides: { alignment: "left" },
    },
    {
      key: "right",
      name: "Högerjusterad rubrik",
      description: "Rubrik justerad till höger",
      thumbnail: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773172780/h%C3%B6gerjusteradd_rubrik_m0qt0i.png",
      settingOverrides: { alignment: "right" },
    },
  ],
};

registerElementDefinition(headingElement);
