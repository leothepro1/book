import { registerApp } from "../registry";
import type { AppDefinition } from "../types";

const bookingCom: AppDefinition = {
  id: "booking-com",
  name: "Booking.com",
  tagline: "Ta emot bokningar direkt från Booking.com",
  description:
    "Ta emot bokningar direkt från Booking.com. Ordrar skapas automatiskt i Bedfront " +
    "med full spårning per kanal. Se intäkter, konverteringar och gästdata " +
    "uppdelat per försäljningskanal.",
  icon: "hotel",
  category: "channels",
  developer: "bedfront",
  pricing: [
    {
      tier: "free",
      pricePerMonth: 0,
      features: [
        "Automatisk orderimport från Booking.com",
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
    endpoint: "/api/apps/booking-com/health",
    intervalMinutes: 15,
    timeoutMs: 10000,
    degradedThresholdMs: 5000,
  },

  salesChannel: {
    handle: "booking_com",
    displayName: "Booking.com",
    color: "#003580",
    orderIngestion: true,
    requiresExternalId: true,
  },

  heroHeading: "Booking.com som försäljningskanal",
  heroDescription:
    "Koppla din Booking.com-profil till Bedfront och ta emot bokningar automatiskt. " +
    "Varje order taggas med källkanal för fullständig intäktsanalys.",

  permissionLabels: [
    "Skapar ordrar från Booking.com-bokningar",
    "Läser bokningsdata från PMS",
    "Skapar och uppdaterar gästprofiler",
  ],

  highlights: [
    {
      icon: "conversion_path",
      title: "Kanalattribution",
      description: "Varje order taggas automatiskt med Booking.com som källa.",
    },
    {
      icon: "sync",
      title: "Automatisk import",
      description: "Bokningar importeras i realtid via webhooks — ingen manuell hantering.",
    },
    {
      icon: "analytics",
      title: "Intäktsanalys per kanal",
      description: "Se hur mycket intäkt Booking.com genererar jämfört med direktbokningar.",
    },
  ],

  longDescription:
    "## Booking.com som försäljningskanal\n\n" +
    "Koppla din Booking.com-profil och ta emot bokningar automatiskt i Bedfront. " +
    "Varje order som kommer via Booking.com taggas med källkanal och externt boknings-ID.\n\n" +
    "## Fullständig attribution\n\n" +
    "Analysera intäkter per kanal. Se vilka kanaler som konverterar bäst " +
    "och optimera din distributionsstrategi baserat på faktisk data.",

  screenshots: [],
  worksWithApps: ["channel-manager", "revenue-analytics"],
  worksWithServices: [{ name: "Booking.com" }],
  changelog: [
    {
      version: "1.0.0",
      date: "2026-03-27",
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
      description: "Ange dina Booking.com API-nycklar för att koppla kontot.",
      required: true,
      apiKeyConfig: {
        fields: [
          {
            key: "hotelId",
            label: "Hotell-ID",
            placeholder: "T.ex. 1234567",
            secret: false,
          },
          {
            key: "apiKey",
            label: "API-nyckel",
            placeholder: "Din Booking.com API-nyckel",
            secret: true,
            helpUrl: "https://partner.booking.com/",
          },
        ],
      },
    },
    {
      id: "webhook-setup",
      type: "webhook",
      title: "Registrera webhooks",
      description: "Bedfront registrerar webhooks hos Booking.com för att ta emot bokningar automatiskt.",
      required: true,
      dependsOn: "api-credentials",
    },
    {
      id: "review",
      type: "review",
      title: "Granska och aktivera",
      description: "Kontrollera dina inställningar innan Booking.com-kanalen aktiveras.",
      required: true,
      dependsOn: "webhook-setup",
    },
  ],
};

registerApp(bookingCom);
