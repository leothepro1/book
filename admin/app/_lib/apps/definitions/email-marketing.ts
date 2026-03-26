import { registerApp } from "../registry";
import type { AppDefinition } from "../types";

const emailMarketing: AppDefinition = {
  id: "email-marketing",
  name: "E-postmarknadsföring",
  tagline: "Synka gäster med Mailchimp eller Klaviyo",
  description:
    "Automatisk synkronisering av gästdata till ditt e-postverktyg. " +
    "Bygg segment baserat på bokningshistorik, vistelseperiod och ordervärde. " +
    "Skicka riktade kampanjer till rätt gäster vid rätt tidpunkt.",
  icon: "campaign",
  category: "marketing",
  developer: "bedfront",
  pricing: [
    {
      tier: "free",
      pricePerMonth: 0,
      features: [
        "Grundläggande gästexport",
        "Manuell synkronisering",
      ],
    },
    {
      tier: "grow",
      pricePerMonth: 24900,
      features: [
        "Allt i Gratis",
        "Automatisk synkronisering",
        "Bokningssegment",
        "Taggning baserat på vistelse",
      ],
    },
    {
      tier: "pro",
      pricePerMonth: 49900,
      features: [
        "Allt i Grow",
        "Intäktssegmentering",
        "Automatiserade flöden",
        "A/B-testning av segment",
      ],
    },
  ],
  requiredSetup: [],
  dependencies: [],
  permissions: ["guests:read", "bookings:read", "orders:read"],
  webhooks: ["booking.confirmed", "order.paid", "guest.updated"],
  healthCheck: {
    endpoint: "/api/apps/email-marketing/health",
    intervalMinutes: 30,
    timeoutMs: 15000,
    degradedThresholdMs: 5000,
  },
  highlights: [
    { icon: "group", title: "Automatisk synkronisering", description: "Gäster synkas automatiskt till din e-postlista vid varje bokning." },
    { icon: "label", title: "Smarta segment", description: "VIP-gäster, återkommande besökare och nya kunder segmenteras automatiskt." },
    { icon: "campaign", title: "Automationstriggers", description: "Trigga kampanjer baserat på bokningar, köp och gästbeteende." },
  ],
  longDescription:
    "## Synkronisera gäster automatiskt\n\n" +
    "E-postmarknadsföringsappen kopplar din bokningsmotor till Mailchimp eller Klaviyo. " +
    "Varje gäst som bokar synkas automatiskt med korrekt segmentering.\n\n" +
    "## Smarta segment\n\n" +
    "Fem automatiska segment skapas direkt: VIP-gäster, återkommande, nya, senaste och inaktiva. " +
    "Segmenten uppdateras i realtid baserat på bokningshistorik och total spend.",
  worksWithApps: ["guest-crm"],
  screenshots: [],
  worksWithServices: [{ name: "Mailchimp" }, { name: "Klaviyo" }],
  changelog: [
    { version: "1.0.0", date: "2026-03-01", changes: ["Mailchimp-integration", "5 automatiska segment", "Automationstriggers vid bokning"] },
  ],
  setupSteps: [
    {
      id: "provider-keys",
      type: "api_key",
      title: "Anslut e-posttjänst",
      description: "Ange API-nyckeln från din e-postleverantör (Mailchimp eller Klaviyo).",
      required: true,
      apiKeyConfig: {
        fields: [
          {
            key: "provider",
            label: "Leverantör",
            placeholder: "mailchimp",
            secret: false,
          },
          {
            key: "apiKey",
            label: "API-nyckel",
            placeholder: "xxxxxxxx-us21",
            secret: true,
            helpUrl: "https://mailchimp.com/help/about-api-keys/",
          },
        ],
      },
    },
    {
      id: "select-list",
      type: "account_select",
      title: "Välj lista/målgrupp",
      description: "Välj vilken lista eller målgrupp som gäster ska synkas till.",
      required: true,
      dependsOn: "provider-keys",
      accountSelectConfig: {
        fetchEndpoint: "/api/apps/email-marketing/lists",
        labelKey: "name",
        valueKey: "id",
      },
    },
    {
      id: "sync-config",
      type: "config",
      title: "Synkroniseringsinställningar",
      description: "Konfigurera vad som ska synkas och när.",
      required: false,
      dependsOn: "select-list",
      configFields: [
        {
          key: "syncOnBooking",
          label: "Synka vid bokning",
          type: "toggle",
          default: true,
          hint: "Lägg till gästen i listan automatiskt vid bokningsbekräftelse.",
        },
        {
          key: "syncOnOrder",
          label: "Synka vid köp",
          type: "toggle",
          default: true,
          hint: "Lägg till kunden i listan vid produktköp.",
        },
        {
          key: "tagPrefix",
          label: "Taggprefix",
          type: "text",
          default: "bedfront",
          hint: "Prefix för automatiska taggar i e-postverktyget (t.ex. 'bedfront:vip').",
        },
      ],
    },
    {
      id: "review",
      type: "review",
      title: "Granska och aktivera",
      description: "Kontrollera dina inställningar innan appen aktiveras.",
      required: true,
      dependsOn: "sync-config",
    },
  ],
};

registerApp(emailMarketing);
