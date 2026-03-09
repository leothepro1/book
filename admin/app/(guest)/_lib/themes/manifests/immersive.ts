/**
 * Pebble Theme Manifest (registered as "immersive")
 *
 * A warm, editorial layout with a centred hero slider and tabbed categories.
 *
 * Templates:
 *   home — Welcome text → hero slider → "Under din vistelse" → category tabs
 */

import { registerTheme } from "../registry";
import type { ThemeManifest } from "../types";
import type { ThemeConfig } from "../../theme/types";

const immersive: ThemeManifest = {
  id: "immersive",
  name: "Pebble",
  version: "2.0.0",
  author: { name: "Hospitality Platform" },
  description: "Redaktionell layout med centrerad bildslider och tabbade kategorier. Perfekt för resorts och upplevelseboenden.",
  thumbnail: "/themes/immersive.png",
  previewImages: [],
  tags: ["editorial", "slider", "warm", "resort"],

  settings: [
    {
      key: "pagePadding",
      type: "number",
      label: "Sidmarginal",
      description: "Yttre padding på sidan (px)",
      default: 17,
      min: 0,
      max: 32,
      step: 1,
    },
  ],
  settingDefaults: {
    pagePadding: 17,
  },

  detail: {
    heading: "Redaktionell upplevelse med bildslider",
    description:
      "Pebble kombinerar en centrerad bildslider med tabbade kategorier. Perfekt för att visa upp anläggningens erbjudanden med en varm, inbjudande känsla.",
    features: [
      {
        image: "/themes/pebble-feature-1.png",
        title: "Centrerad bildslider",
        description: "En slider där det aktiva itemet står i centrum med mjuk skalning och gradient-overlay.",
      },
      {
        image: "/themes/pebble-feature-2.png",
        title: "Tabbade kategorier",
        description: "Organisera innehåll i kategorier med horisontella tabs och ett snyggt bildrutnät.",
      },
      {
        image: "/themes/pebble-feature-3.png",
        title: "Konfigurerbar gradient",
        description: "Välj färg på slider-gradienten för att matcha er profil.",
      },
    ],
  },

  designPreset: {
    version: 1,
    colors: {
      background: "#FAF9F7",
      text: "#1A1917",
      buttonBg: "#F97805",
      buttonText: "#FFFFFF",
    },
    header: {
      logoUrl: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773087652/pebble_ohpeu5.png",
      logoWidth: 78,
    },
    background: {
      mode: "fill",
    },
    buttons: {
      variant: "solid",
      radius: "rounded",
      shadow: "none",
    },
    typography: {
      headingFont: "noto_sans",
      bodyFont: "inter",
      mutedOpacity: 0.6,
    },
    tiles: {
      background: "#F0EFEC",
      radius: "rounded",
      shadow: "none",
    },
  } satisfies ThemeConfig,

  sectionGroups: {
    header: [],
    footer: [],
  },

  templates: {
    home: {
      name: "Startsida",
      sections: [
        {
          id: "checkin-slot",
          type: "checkin-slot",
          variant: "pebble",
          order: 0,
          defaults: {},
          schema: [],
        },
        {
          id: "hero-slider",
          type: "hero-slider",
          variant: "pebble",
          order: 1,
          defaults: { gradientColor: "#000000" },
          schema: [
            {
              key: "gradientColor",
              type: "color",
              label: "Gradientfärg",
              description: "Färg på gradient-overlay (vänster → mitten)",
              default: "#000000",
            },
          ],
        },
        {
          id: "category-tabs",
          type: "category-tabs",
          variant: "pebble",
          order: 2,
          defaults: {},
          schema: [],
        },
      ],
    },
  },
};

registerTheme(immersive);

export default immersive;
