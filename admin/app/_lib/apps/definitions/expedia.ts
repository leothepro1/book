import { registerApp } from "../registry";
import type { AppDefinition } from "../types";

const expedia: AppDefinition = {
  id: "expedia",
  name: "Expedia",
  tagline: "Ta emot bokningar direkt från Expedia",
  description:
    "Ta emot bokningar direkt från Expedia Group (Expedia, Hotels.com, Vrbo). " +
    "Ordrar skapas automatiskt i Bedfront med full spårning per kanal. " +
    "Se intäkter, konverteringar och gästdata uppdelat per försäljningskanal.",
  icon: "flight",
  category: "channels",
  developer: "bedfront",
  pricing: [
    {
      tier: "free",
      pricePerMonth: 0,
      features: [
        "Automatisk orderimport från Expedia",
        "Kanalattribution på alla ordrar",
        "Fullständig gästdata",
      ],
    },
  ],
  requiredSetup: ["pms"],
  dependencies: [],
  permissions: ["orders:write", "bookings:read", "bookings:write", "guests:write"],
  webhooks: ["order.paid", "order.cancelled", "order.fulfilled"],
  healthCheck: {
    endpoint: "/api/apps/expedia/health",
    intervalMinutes: 15,
    timeoutMs: 10000,
    degradedThresholdMs: 5000,
  },

  salesChannel: {
    handle: "expedia",
    displayName: "Expedia",
    color: "#00355F",
    orderIngestion: true,
    requiresExternalId: true,
  },

  heroHeading: "Expedia som försäljningskanal",
  heroDescription:
    "Koppla din Expedia-profil till Bedfront och ta emot bokningar automatiskt. " +
    "Varje order taggas med källkanal för fullständig intäktsanalys.",

  permissionLabels: [
    "Skapar ordrar från Expedia-bokningar",
    "Läser bokningsdata från PMS",
    "Skapar och uppdaterar gästprofiler",
  ],

  highlights: [
    {
      icon: "conversion_path",
      title: "Kanalattribution",
      description: "Varje order taggas automatiskt med Expedia som källa.",
    },
    {
      icon: "sync",
      title: "Automatisk import",
      description: "Bokningar importeras i realtid via webhooks — ingen manuell hantering.",
    },
    {
      icon: "analytics",
      title: "Intäktsanalys per kanal",
      description: "Se hur mycket intäkt Expedia genererar jämfört med andra kanaler.",
    },
  ],

  longDescription:
    "## Expedia som försäljningskanal\n\n" +
    "Koppla din Expedia-profil och ta emot bokningar automatiskt i Bedfront. " +
    "Varje order som kommer via Expedia taggas med källkanal och externt boknings-ID.\n\n" +
    "## Expedia Group\n\n" +
    "Täcker Expedia, Hotels.com och Vrbo — alla bokningar samlas i en vy.",

  screenshots: [],
  worksWithApps: ["channel-manager", "revenue-analytics"],
  worksWithServices: [{ name: "Expedia" }, { name: "Hotels.com" }, { name: "Vrbo" }],
  changelog: [
    {
      version: "1.0.0",
      date: "2026-03-28",
      changes: [
        "Automatisk orderimport via webhooks",
        "Kanalattribution på ordrar",
        "Externt boknings-ID-spårning",
      ],
    },
  ],

  setupSteps: [
    {
      id: "api-credentials",
      type: "api_key",
      title: "API-nycklar",
      description: "Ange dina Expedia API-nycklar för att koppla kontot.",
      required: true,
      apiKeyConfig: {
        fields: [
          {
            key: "propertyId",
            label: "Fastighets-ID",
            placeholder: "T.ex. 12345678",
            secret: false,
          },
          {
            key: "apiKey",
            label: "API-nyckel",
            placeholder: "Din Expedia API-nyckel",
            secret: true,
            helpUrl: "https://developers.expediagroup.com/",
          },
        ],
      },
    },
    {
      id: "webhook-setup",
      type: "webhook",
      title: "Registrera webhooks",
      description: "Bedfront registrerar webhooks hos Expedia för att ta emot bokningar automatiskt.",
      required: true,
      dependsOn: "api-credentials",
    },
    {
      id: "review",
      type: "review",
      title: "Granska och aktivera",
      description: "Kontrollera dina inställningar innan Expedia-kanalen aktiveras.",
      required: true,
      dependsOn: "webhook-setup",
    },
  ],
};

registerApp(expedia);
