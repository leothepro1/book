import { registerApp } from "../registry";
import type { AppDefinition } from "../types";

const googleAds: AppDefinition = {
  id: "google-ads",
  name: "Google Ads",
  tagline: "Synka bokningar med Google Ads-konverteringar",
  description:
    "Koppla din bokningsmotor till Google Ads för automatisk konverteringsspårning. " +
    "Se vilka annonser som genererar bokningar och optimera din annonsbudget baserat på faktisk intäkt.",
  icon: "ads_click",
  category: "marketing",
  developer: "bedfront",
  pricing: [
    {
      tier: "free",
      pricePerMonth: 0,
      features: [
        "Grundläggande konverteringsspårning",
        "Bokningsbekräftelse som konvertering",
      ],
    },
    {
      tier: "grow",
      pricePerMonth: 29900,
      features: [
        "Allt i Gratis",
        "Intäktsbaserad optimering",
        "Dynamisk remarketing",
        "Offline-konverteringar",
      ],
    },
  ],
  requiredSetup: ["payments"],
  dependencies: [],
  permissions: ["orders:read", "analytics:read"],
  webhooks: ["order.paid", "order.refunded"],
  wizardComponent: "google-ads",
  termsUrl: "https://bedfront.com/legal/google-ads-terms",
  healthCheck: {
    endpoint: "/api/apps/google-ads/health",
    intervalMinutes: 15,
    timeoutMs: 10000,
    degradedThresholdMs: 3000,
  },
  highlights: [
    { icon: "conversion_path", title: "Server-side konverteringar", description: "Spåra köp och bokningar utan cookies eller klient-JavaScript — fungerar alltid." },
    { icon: "trending_up", title: "ROAS-optimering", description: "Skicka intäktsdata till Google Ads för automatisk budoptimering med Smart Bidding." },
    { icon: "enhanced_encryption", title: "Förbättrad matchning", description: "SHA-256-krypterad e-post ger ~70% matchrate mot ~40% utan." },
  ],
  screenshots: [
    { url: "https://res.cloudinary.com/bedfront/image/upload/apps/google-ads/wizard.png", alt: "Google Ads installationsguide" },
    { url: "https://res.cloudinary.com/bedfront/image/upload/apps/google-ads/dashboard.png", alt: "Konverteringsöversikt" },
    { url: "https://res.cloudinary.com/bedfront/image/upload/apps/google-ads/settings.png", alt: "Inställningar" },
  ],
  longDescription:
    "## Automatisk konverteringsspårning\n\n" +
    "Google Ads-appen kopplar din bokningsmotor direkt till Google Ads Conversions API. " +
    "Varje gång en gäst slutför en bokning eller ett köp skickas en konverteringshändelse " +
    "server-side — helt utan cookies eller klient-JavaScript.\n\n" +
    "## Förbättrad matchning\n\n" +
    "Med förbättrad matchning aktiverad hashas gästens e-postadress med SHA-256 och skickas " +
    "tillsammans med konverteringen. Detta ökar matchraten från ~40% till ~70%, vilket ger " +
    "Google Ads betydligt bättre data för automatisk budoptimering.\n\n" +
    "## GCLID-stöd\n\n" +
    "Appen fångar automatiskt GCLID från annonskick-URL:er och lagrar det under hela " +
    "bokningsflödet. När konverteringen registreras inkluderas GCLID för exakt attribution " +
    "till rätt annonskampanj och sökord.",
  worksWithApps: ["revenue-analytics"],
  worksWithServices: [{ name: "Google Ads" }, { name: "Google Analytics" }],
  supportUrl: "https://bedfront.com/support/google-ads",
  documentationUrl: "https://bedfront.com/docs/google-ads",
  privacyPolicyUrl: "https://bedfront.com/legal/google-ads-privacy",
  changelog: [
    { version: "1.0.0", date: "2026-03-01", changes: ["Första versionen med konverteringsspårning", "Förbättrad matchning med SHA-256", "GCLID-stöd"] },
  ],
  setupSteps: [
    {
      id: "connect-google",
      type: "oauth",
      title: "Anslut Google-konto",
      description: "Logga in med ditt Google-konto för att ge Bedfront åtkomst till Google Ads.",
      required: true,
      oauthConfig: {
        provider: "google",
        scopes: ["https://www.googleapis.com/auth/adwords"],
        callbackPath: "/api/apps/google-ads/callback",
      },
    },
    {
      id: "select-account",
      type: "account_select",
      title: "Välj Google Ads-konto",
      description: "Välj vilket Google Ads-konto som ska ta emot konverteringsdata.",
      required: true,
      dependsOn: "connect-google",
      accountSelectConfig: {
        fetchEndpoint: "/api/apps/google-ads/accounts",
        labelKey: "descriptiveName",
        valueKey: "customerId",
      },
    },
    {
      id: "tracking-config",
      type: "config",
      title: "Konverteringsinställningar",
      description: "Konfigurera vilka händelser som ska spåras som konverteringar i Google Ads.",
      required: true,
      dependsOn: "select-account",
      configFields: [
        {
          key: "conversionActionId",
          label: "Konverterings-ID",
          type: "text",
          default: "",
          hint: "Hittas i Google Ads under Verktyg → Konverteringar. Numeriskt ID.",
        },
        {
          key: "trackPurchase",
          label: "Spåra köp",
          type: "toggle",
          default: true,
          hint: "Skicka en konvertering till Google Ads när en bokning betalas.",
        },
        {
          key: "enhancedConversions",
          label: "Förbättrade konverteringar",
          type: "toggle",
          default: true,
          hint: "Förbättrar träffsäkerheten genom att använda krypterad e-post (SHA-256).",
        },
        {
          key: "sendRevenue",
          label: "Skicka intäktsdata",
          type: "toggle",
          default: true,
          hint: "Inkludera bokningsbelopp i konverteringsdata för ROAS-optimering.",
        },
      ],
    },
    {
      id: "review",
      type: "review",
      title: "Granska och aktivera",
      description: "Kontrollera dina inställningar innan appen aktiveras.",
      required: true,
      dependsOn: "tracking-config",
    },
  ],
};

registerApp(googleAds);
