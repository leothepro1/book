import { registerApp } from "../registry";
import type { AppDefinition } from "../types";

const metaAds: AppDefinition = {
  id: "meta-ads",
  name: "Meta Pixel & CAPI",
  tagline: "Facebook- och Instagram-spårning med Conversions API",
  description:
    "Installera Meta Pixel och Conversions API för att spåra bokningar från Facebook och Instagram. " +
    "Server-side-händelser ger tillförlitlig data trots webbläsarblockerare och iOS-begränsningar.",
  icon: "share",
  category: "marketing",
  developer: "bedfront",
  pricing: [
    {
      tier: "free",
      pricePerMonth: 0,
      features: [
        "Meta Pixel (klientsidan)",
        "PageView, ViewContent, InitiateCheckout",
        "Purchase-konvertering",
      ],
    },
    {
      tier: "grow",
      pricePerMonth: 19900,
      features: [
        "Allt i Gratis",
        "Conversions API (server-side)",
        "Avancerad matchning",
        "Anpassade målgrupper",
      ],
    },
  ],
  wizardComponent: "meta-ads",
  requiredSetup: [],
  dependencies: [],
  permissions: ["orders:read", "guests:read"],
  webhooks: ["order.paid", "order.refunded"],
  healthCheck: {
    endpoint: "/api/apps/meta-ads/health",
    intervalMinutes: 15,
    timeoutMs: 10000,
    degradedThresholdMs: 3000,
  },
  highlights: [
    { icon: "shield", title: "Fungerar efter iOS 14", description: "Server-side Conversions API kringgår webbläsarblockerare och iOS-begränsningar." },
    { icon: "fingerprint", title: "Förbättrad matchning", description: "Hashad kunddata (e-post, telefon, namn) ökar attributionen markant." },
    { icon: "sync_alt", title: "Automatisk deduplicering", description: "Automatisk deduplicering mot Meta Pixel via event_id förhindrar dubbelräkning." },
  ],
  screenshots: [
    { url: "https://res.cloudinary.com/bedfront/image/upload/apps/meta-ads/wizard.png", alt: "Meta Ads installationsguide" },
    { url: "https://res.cloudinary.com/bedfront/image/upload/apps/meta-ads/events.png", alt: "Events Manager-vy" },
  ],
  longDescription:
    "## Server-side Conversions API\n\n" +
    "Meta Ads-appen skickar köphändelser direkt till Meta Conversions API (CAPI) — " +
    "helt server-side. Det innebär att spårning fungerar även med annonsblockerare, " +
    "Safari ITP och iOS 14+ begränsningar.\n\n" +
    "## Förbättrad matchning\n\n" +
    "Välj vilka kundfält som ska användas för matchning: e-post, telefon, och/eller namn. " +
    "Alla fält hashas med SHA-256 innan de lämnar servern — Meta ser aldrig kunddata i klartext.\n\n" +
    "## 60-dagars token\n\n" +
    "Meta-anslutningen är giltig i 60 dagar. Appen varnar dig proaktivt 7 dagar innan " +
    "den löper ut så att du kan förnya utan avbrott.",
  worksWithApps: ["revenue-analytics"],
  worksWithServices: [{ name: "Meta Business Suite" }, { name: "Facebook Ads" }, { name: "Instagram Ads" }],
  supportUrl: "https://rutgr.com/support/meta-ads",
  documentationUrl: "https://rutgr.com/docs/meta-ads",
  changelog: [
    { version: "1.0.0", date: "2026-03-01", changes: ["Conversions API (CAPI) integration", "Förbättrad matchning med SHA-256", "Automatisk tokenförnyelse"] },
  ],
  setupSteps: [
    {
      id: "connect-meta",
      type: "oauth",
      title: "Anslut Meta-konto",
      description: "Logga in med ditt Facebook-konto för att ge Bedfront åtkomst till Meta Business.",
      required: true,
      oauthConfig: {
        provider: "meta",
        scopes: ["ads_management", "ads_read", "business_management"],
        callbackPath: "/api/apps/meta-ads/callback",
      },
    },
    {
      id: "select-account",
      type: "account_select",
      title: "Välj annonskonto",
      description: "Välj vilket Meta-annonskonto som ska ta emot konverteringsdata.",
      required: true,
      dependsOn: "connect-meta",
      accountSelectConfig: {
        fetchEndpoint: "/api/apps/meta-ads/accounts",
        labelKey: "name",
        valueKey: "id",
      },
    },
    {
      id: "pixel-config",
      type: "config",
      title: "Pixelinställningar",
      description: "Ange ditt Pixel-ID och konfigurera CAPI-spårning.",
      required: true,
      dependsOn: "select-account",
      configFields: [
        {
          key: "pixelId",
          label: "Meta Pixel-ID",
          type: "text",
          default: "",
          hint: "Hittas i Meta Business Suite under Datakällor → Pixlar.",
        },
        {
          key: "testEventCode",
          label: "Testhändelsekod",
          type: "text",
          default: "",
          hint: "Valfritt — används för att testa CAPI-händelser i Meta Events Manager.",
        },
        {
          key: "sendPurchaseEvents",
          label: "Skicka köphändelser",
          type: "toggle",
          default: true,
          hint: "Skickar Purchase-händelse när en betalning genomförs.",
        },
        {
          key: "enhancedMatching",
          label: "Förbättrad matchning",
          type: "toggle",
          default: true,
          hint: "Förbättrar träffsäkerheten med krypterad e-post (SHA-256).",
        },
      ],
    },
    {
      id: "review",
      type: "review",
      title: "Granska och aktivera",
      description: "Kontrollera dina inställningar innan appen aktiveras.",
      required: true,
      dependsOn: "pixel-config",
    },
  ],
};

registerApp(metaAds);
