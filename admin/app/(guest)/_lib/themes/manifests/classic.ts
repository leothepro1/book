/**
 * Classic Theme Manifest
 *
 * The original guest portal layout — the default for all tenants.
 *
 * Templates:
 *   home — Contained hero → info-bar → 3-col grid links → card feed
 *
 * Future templates (shop, account, stays…) will be added here as
 * the platform grows. Each is independent and optional.
 */

import { registerTheme } from "../registry";
import type { ThemeManifest } from "../types";
import type { ThemeConfig } from "../../theme/types";

const classic: ThemeManifest = {
  id: "classic",
  name: "Classic",
  version: "1.0.0",
  author: { name: "Hospitality Platform" },
  description: "Den ursprungliga gästportal-layouten. Ren, professionell och beprövad.",
  thumbnail: "/themes/classic.png",
  previewImages: [],
  tags: ["clean", "professional", "default"],

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
    heading: "En ren och professionell grund",
    description:
      "Classic är den beprövade layouten som passar alla typer av boenden. En tydlig hero-bild, informationspaneler och ett överskådligt rutnät med snabblänkar ger gästen allt de behöver direkt.",
    features: [
      {
        image: "/themes/classic-feature-1.png",
        title: "Inramad hero",
        description: "En elegant hero-sektion med rundade hörn som ramar in din omslagsbild.",
      },
      {
        image: "/themes/classic-feature-2.png",
        title: "Informationspanel",
        description: "Visa bokningsstatus och väder sida vid sida i en delad kortlayout.",
      },
      {
        image: "/themes/classic-feature-3.png",
        title: "Snabblänkar i rutnät",
        description: "Tre kolumner med genvägar till incheckning, nyckel, Wi-Fi och mer.",
      },
    ],
  },

  designPreset: {
    version: 1,
    colors: {
      background: "#FFFFFF",
      text: "#2D2C2B",
      buttonBg: "#2B2C2D",
      buttonText: "#FFFFFF",
    },
    header: {
      logoUrl: "",
      logoWidth: 113,
    },
    background: {
      mode: "fill",
    },
    buttons: {
      variant: "solid",
      radius: "round",
      shadow: "soft",
    },
    typography: {
      headingFont: "nunito",
      bodyFont: "inter",
      mutedOpacity: 0.72,
    },
    tiles: {
      background: "#F1F0EE",
      radius: "round",
      shadow: "none",
    },
  } satisfies ThemeConfig,

  // ── Shared section groups (rendered on every page) ──
  sectionGroups: {
    header: [],
    footer: [],
  },

  // ── Per-page templates ──
  templates: {
    home: {
      name: "Startsida",
      sections: [],
    },

    stays: {
      name: "Bokningar",
      sections: [],
    },

    // Future: shop, account, check-in, check-out, help-center
  },
};

registerTheme(classic);

export default classic;
