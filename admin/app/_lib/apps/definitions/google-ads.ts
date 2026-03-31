import { registerApp } from "../registry";
import type { AppDefinition } from "../types";

const googleAds: AppDefinition = {
  id: "google-ads",
  name: "Google & Youtube",
  tagline: "Synka bokningar med Google Ads-konverteringar",
  description:
    "Koppla din bokningsmotor till Google Ads för automatisk konverteringsspårning. " +
    "Se vilka annonser som genererar bokningar och optimera din annonsbudget baserat på faktisk intäkt.",
  icon: "ads_click",
  iconUrl: "https://cdn.shopify.com/app-store/listing_images/a78e004f44cded1b6998e7a6e081a230/icon/COng2Lf0lu8CEAE=.png",
  category: "marketing",
  developer: "bedfront",
  pricing: [
    {
      tier: "free",
      pricePerMonth: 0,
      features: [
        "När du kör en kampanj debiteras annonskostnaden ditt Google Ads-konto direkt. Du anger en daglig kampanjbudget.",
      ],
    },
  ],
  requiredSetup: ["payments"],
  dependencies: [],
  permissions: ["orders:read", "analytics:read"],
  webhooks: ["order.paid", "order.refunded"],
  wizardComponent: "google-ads",
  permissionLabels: [
    "Synkar produkter och erbjudanden",
    "Spårar bokningar och konverteringar",
    "Samlar data för annonsering och remarketing",
    "Installerar Google Ads & Analytics-taggar",
  ],
  heroHeading: "Spåra och nå fler gäster via Google",
  heroDescription:
    "Få full koll på bokningar med avancerad spårning, samtidigt som du når fler gäster via Google och YouTube. " +
    "Optimera kampanjer och öka direktbokningar med datadrivna insikter.",
  termsUrl: "https://rutgr.com/legal/google-ads-terms",
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
    { url: "https://cdn.shopify.com/app-store/listing_images/a78e004f44cded1b6998e7a6e081a230/promotional_image/CPzrq9WawYIDEAE=.jpeg?height=720&quality=90&width=1280", alt: "Google & Youtube kampanjöversikt" },
    { url: "https://cdn.shopify.com/app-store/listing_images/a78e004f44cded1b6998e7a6e081a230/desktop_screenshot/CJqPt9WawYIDEAE=.jpeg?height=360&quality=90&width=640", alt: "Konverteringsspårning" },
    { url: "https://cdn.shopify.com/app-store/listing_images/a78e004f44cded1b6998e7a6e081a230/desktop_screenshot/CKrLwdWawYIDEAE=.jpeg?height=360&quality=90&width=640", alt: "Kampanjhantering" },
    { url: "https://cdn.shopify.com/app-store/listing_images/a78e004f44cded1b6998e7a6e081a230/desktop_screenshot/CPW6zNWawYIDEAE=.jpeg?height=900&quality=90&width=1600", alt: "Resultatöversikt" },
    { url: "https://cdn.shopify.com/app-store/listing_images/a78e004f44cded1b6998e7a6e081a230/desktop_screenshot/COej1tWawYIDEAE=.jpeg?height=900&quality=90&width=1600", alt: "Detaljerad statistik" },
  ],
  longDescription:
    "## Anslut ditt hotell till Google och nå fler gäster\n\n" +
    "Använd det bästa av Google direkt från din adminpanel: Synka rum, priser och tillgänglighet till Google Hotel Ads och konvertera fler sökande resenärer till betalande gäster. Öka beläggningen med Performance Max-annonser på Search, YouTube och Display, och få tillgång till insikter om dina gästers bokningsbeteende med Google Analytics.\n\n" +
    "- Anslut ditt hotell till Google Hotel Ads och syns när resenärer söker boende\n" +
    "- Synka rumstyper, priser och tillgänglighet automatiskt från din portal\n" +
    "- Spåra konverteringar och förstå vilka kanaler som driver bokningar\n" +
    "- Koppla samman hela gästens resa — från sökning till incheckning — med insikter i Google Analytics\n" +
    "- Optimera dina annonser med Googles AI och nå rätt resenär vid rätt tillfälle",
  worksWithApps: ["revenue-analytics"],
  worksWithServices: [{ name: "Google Ads" }, { name: "Google Analytics" }],
  supportUrl: "https://rutgr.com/support/google-ads",
  documentationUrl: "https://rutgr.com/docs/google-ads",
  privacyPolicyUrl: "https://rutgr.com/legal/google-ads-privacy",
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
        {
          key: "ga4MeasurementId",
          label: "GA4 Measurement ID",
          type: "text",
          default: "",
          hint: "Hittas i GA4 under Admin → Dataströmmar. Format: G-XXXXXXXXXX.",
        },
        {
          key: "ga4ApiSecret",
          label: "GA4 API-hemlighet",
          type: "text",
          default: "",
          hint: "Skapas i GA4 under Admin → Dataströmmar → Measurement Protocol API secrets.",
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
