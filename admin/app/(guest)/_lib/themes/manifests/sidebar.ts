/**
 * Sidebar Theme Manifest
 *
 * A two-column layout theme with a persistent left sidebar containing
 * the availability search widget. The sidebar follows the guest across
 * all booking-flow pages (home, search, product detail, addons) and
 * disappears at checkout.
 *
 * Design language: slate neutral palette, sharp modern typography,
 * minimal button styling. Built for conversion — the search form is
 * always one glance away.
 *
 * Templates:
 *   home    — landing page (content sections added by tenant)
 *   stays   — search results page
 *   product — accommodation detail page
 *   addons  — addon selection page
 */

import { registerTheme } from "../registry";
import type { ThemeManifest } from "../types";
import type { ThemeConfig } from "../../theme/types";

const sidebar: ThemeManifest = {
  id: "sidebar",
  name: "Sidebar",
  version: "1.0.0",
  author: { name: "Hospitality Platform" },
  description:
    "Tvåkolumnslayout med persistent sökpanel. Sökformuläret följer gästen genom hela bokningsflödet — från startsidan till boendeval och tillval.",
  thumbnail: "/themes/sidebar/thumbnail.jpg",
  previewImages: [
    "/themes/sidebar/preview-home.jpg",
    "/themes/sidebar/preview-search.jpg",
    "/themes/sidebar/preview-product.jpg",
  ],
  tags: ["sidebar", "search", "horizontal", "booking", "two-column"],

  layout: "sidebar-left",

  // ── Theme-level settings ────────────────────────────────────
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
    {
      key: "sidebarWidth",
      type: "number",
      label: "Sidopanelbredd",
      description: "Bredd på sökpanelen (px)",
      default: 320,
      min: 260,
      max: 400,
      step: 10,
    },
  ],
  settingDefaults: {
    pagePadding: 17,
    sidebarWidth: 320,
  },

  // ── Detail page (admin theme browser) ───────────────────────
  detail: {
    heading: "Sök och boka — alltid tillgängligt",
    description:
      "Sidebar är byggt för konvertering. En vänsterkolumn med sökformulär följer " +
      "gästen genom hela bokningsflödet — från startsida till sökresultat, boendeval " +
      "och tillval. Sökningen är alltid synlig, alltid ett klick bort. Perfekt för " +
      "anläggningar med många boendekategorier där gästen vill jämföra och filtrera.",
    features: [
      {
        image: "/themes/sidebar/feature-persistent.jpg",
        title: "Persistent sökpanel",
        description:
          "Sökformuläret sitter fast i vänsterkolumnen och följer med på alla sidor. " +
          "Gästen behöver aldrig navigera tillbaka för att ändra datum eller gästantal.",
      },
      {
        image: "/themes/sidebar/feature-single-source.jpg",
        title: "En sektion — alla sidor",
        description:
          "Ändra sökpanelens rubrik, knapptext eller filter på en sida och ändringen " +
          "syns överallt. Ingen duplicering, ingen synkronisering.",
      },
      {
        image: "/themes/sidebar/feature-responsive.jpg",
        title: "Responsiv på mobil",
        description:
          "På mobil fälls sidopanelen ihop till en kompakt sökknapp ovanför innehållet. " +
          "Ett tryck expanderar hela sökformuläret inline.",
      },
    ],
  },

  // ── Design preset (applied when tenant installs this theme) ─
  designPreset: {
    version: 1,
    colors: {
      background: "#FAFAFA",
      text: "#1A1A2E",
      buttonBg: "#1A1A2E",
      buttonText: "#FFFFFF",
    },
    header: {
      logoUrl: "",
      logoWidth: 110,
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
      headingFont: "dm_sans",
      bodyFont: "inter",
      mutedOpacity: 0.55,
    },
    tiles: {
      background: "#F0F0F4",
      radius: "rounded",
      shadow: "none",
    },
  } satisfies ThemeConfig,

  // ── Section groups ─────────────────────────────────────────
  sectionGroups: {
    header: [],
    footer: [],
    sidebar: [
      {
        id: "search-widget",
        type: "search",
        variant: "default",
        order: 0,
        defaults: {
          // Content
          title: "Sök & boka",
          buttonLabel: "Sök tillgänglighet",
          checkInPlaceholder: "Incheckning",
          checkOutPlaceholder: "Utcheckning",
          typeFilterLabel: "Boendetyp",
          dateLabel: "Datum",
          guestLabel: "Gäster",
          adultsLabel: "Vuxna",
          adultsDescription: "13 år och äldre",
          childrenLabel: "Barn",
          childrenDescription: "0–12 år",
          // Visibility
          showTypeFilter: true,
          // Constraints
          maxAdults: 10,
          maxChildren: 10,
          // Appearance
          titleAlign: "left",
          bgColor: "#FFFFFF",
          fieldStyle: "white",
          showShadow: false,
          textColor: "#202020",
          buttonColor: "#207EA9",
          accentColor: "#207EA9",
          headingFont: "inter",
          bodyFont: "inter",
          buttonFont: "inter",
        },
        schema: [
          // ── Content group ──
          {
            key: "title",
            type: "text",
            label: "Rubrik",
            description: "Rubrik ovanför sökformuläret",
            default: "Sök & boka",
            group: "Innehåll",
          },
          {
            key: "buttonLabel",
            type: "text",
            label: "Knapptext",
            description: "Text på sökknappen",
            default: "Sök tillgänglighet",
            group: "Innehåll",
          },
          {
            key: "checkInPlaceholder",
            type: "text",
            label: "Incheckning placeholder",
            default: "Incheckning",
            group: "Innehåll",
          },
          {
            key: "checkOutPlaceholder",
            type: "text",
            label: "Utcheckning placeholder",
            default: "Utcheckning",
            group: "Innehåll",
          },
          // ── Visibility group ──
          {
            key: "showTypeFilter",
            type: "toggle",
            label: "Visa boendetypfilter",
            description: "Dölj om anläggningen bara har en boendetyp",
            default: true,
            group: "Synlighet",
          },
          // ── Constraints group ──
          {
            key: "maxAdults",
            type: "number",
            label: "Max vuxna",
            default: 10,
            min: 1,
            max: 30,
            step: 1,
            group: "Begränsningar",
          },
          {
            key: "maxChildren",
            type: "number",
            label: "Max barn",
            default: 10,
            min: 0,
            max: 20,
            step: 1,
            group: "Begränsningar",
          },
          // ── Appearance group ──
          {
            key: "titleAlign",
            type: "segmented",
            label: "Rubrikens placering",
            default: "left",
            options: [
              { value: "left", label: "Vänster" },
              { value: "center", label: "Centrerad" },
            ],
            group: "Utseende",
          },
          {
            key: "bgColor",
            type: "color",
            label: "Bakgrundsfärg",
            default: "#FFFFFF",
            group: "Bakgrund",
          },
          {
            key: "fieldStyle",
            type: "segmented",
            label: "Fält och kort",
            default: "white",
            options: [
              { value: "transparent", label: "Genomskinlig" },
              { value: "white", label: "Vit" },
            ],
            group: "Bakgrund",
          },
          {
            key: "showShadow",
            type: "toggle",
            label: "Visa skugga",
            default: false,
            group: "Bakgrund",
          },
          {
            key: "textColor",
            type: "color",
            label: "Textfärg",
            default: "#202020",
            group: "Färger",
          },
          {
            key: "buttonColor",
            type: "color",
            label: "Knappar",
            default: "#207EA9",
            group: "Färger",
          },
          {
            key: "accentColor",
            type: "color",
            label: "Accentfärg",
            default: "#207EA9",
            group: "Färger",
          },
          {
            key: "headingFont",
            type: "fontPicker",
            label: "Rubriker",
            default: "inter",
            group: "Typografi",
          },
          {
            key: "bodyFont",
            type: "fontPicker",
            label: "Brödtext",
            default: "inter",
            group: "Typografi",
          },
          {
            key: "buttonFont",
            type: "fontPicker",
            label: "Knappar",
            default: "inter",
            group: "Typografi",
          },
        ],
      },
    ],
  },

  // ── Per-page templates ─────────────────────────────────────
  templates: {
    home: {
      name: "Startsida",
      sections: [],
    },
    stays: {
      name: "Sökresultat",
      sections: [],
    },
    product: {
      name: "Boende",
      sections: [],
    },
    addons: {
      name: "Tillval",
      sections: [],
    },
  },
};

registerTheme(sidebar);

export default sidebar;
