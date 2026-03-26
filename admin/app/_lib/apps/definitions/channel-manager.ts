import { registerApp } from "../registry";
import type { AppDefinition } from "../types";

const channelManager: AppDefinition = {
  id: "channel-manager",
  name: "Kanaldistribution",
  tagline: "Distribuera tillgänglighet till Booking.com, Expedia och fler",
  description:
    "Synka tillgänglighet och priser till OTA-kanaler automatiskt. " +
    "Undvik överbokningar med realtidsuppdateringar och hantera alla kanaler från en plats. " +
    "Stöd för Booking.com, Expedia, Airbnb och fler.",
  icon: "device_hub",
  category: "channels",
  developer: "bedfront",
  pricing: [
    {
      tier: "grow",
      pricePerMonth: 49900,
      features: [
        "Upp till 3 kanaler",
        "Realtidssynkronisering",
        "Centraliserad prishantering",
      ],
    },
    {
      tier: "pro",
      pricePerMonth: 99900,
      features: [
        "Allt i Grow",
        "Obegränsat antal kanaler",
        "Kanalspecifik prissättning",
        "Avancerade restriktioner per kanal",
      ],
    },
  ],
  requiredSetup: ["pms"],
  dependencies: [],
  permissions: ["bookings:read", "bookings:write", "products:read"],
  webhooks: ["booking.confirmed", "booking.cancelled", "availability.updated"],
  healthCheck: {
    endpoint: "/api/apps/channel-manager/health",
    intervalMinutes: 10,
    timeoutMs: 15000,
    degradedThresholdMs: 5000,
  },
  highlights: [
    { icon: "device_hub", title: "Centraliserad distribution", description: "Hantera tillgänglighet och priser på alla OTA-kanaler från ett ställe." },
    { icon: "sync", title: "Realtidssynkronisering", description: "Tillgängligheten uppdateras automatiskt för att undvika överbokningar." },
    { icon: "hotel", title: "Fler kanaler", description: "Stöd för Booking.com, Expedia, Airbnb och fler." },
  ],
  longDescription:
    "## Distribuera till OTA-kanaler\n\n" +
    "Kanaldistributionsappen synkar tillgänglighet och priser automatiskt till Booking.com, " +
    "Expedia, Airbnb och andra kanaler. Uppdateringar sker i realtid för att eliminera " +
    "överbokningsrisken.\n\n" +
    "## En källa till sanning\n\n" +
    "Alla kanaler hämtar data från samma källa — ditt PMS via Bedfront. " +
    "Ändra priser eller blockera datum en gång och det reflekteras överallt.",
  worksWithApps: ["revenue-analytics"],
  screenshots: [],
  worksWithServices: [{ name: "Booking.com" }, { name: "Expedia" }, { name: "Airbnb" }],
  changelog: [
    { version: "1.0.0", date: "2026-03-01", changes: ["Booking.com, Expedia, Airbnb-stöd", "Realtidssynkronisering", "Webhook-baserade uppdateringar"] },
  ],
  setupSteps: [
    {
      id: "channel-config",
      type: "config",
      title: "Välj kanaler",
      description: "Välj vilka OTA-kanaler du vill distribuera till.",
      required: true,
      configFields: [
        {
          key: "enableBookingCom",
          label: "Booking.com",
          type: "toggle",
          default: false,
          hint: "Synka tillgänglighet och priser till Booking.com.",
        },
        {
          key: "enableExpedia",
          label: "Expedia",
          type: "toggle",
          default: false,
          hint: "Synka tillgänglighet och priser till Expedia.",
        },
        {
          key: "enableAirbnb",
          label: "Airbnb",
          type: "toggle",
          default: false,
          hint: "Synka tillgänglighet och priser till Airbnb.",
        },
        {
          key: "syncInterval",
          label: "Synkintervall",
          type: "select",
          default: "realtime",
          options: [
            { label: "Realtid", value: "realtime" },
            { label: "Var 15:e minut", value: "15min" },
            { label: "Varje timme", value: "hourly" },
          ],
          hint: "Hur ofta tillgänglighet synkas till kanalerna.",
        },
      ],
    },
    {
      id: "webhook-setup",
      type: "webhook",
      title: "Registrera webhooks",
      description: "Bedfront registrerar webhooks hos varje kanal för att ta emot bokningar automatiskt.",
      required: true,
      dependsOn: "channel-config",
    },
    {
      id: "review",
      type: "review",
      title: "Granska och aktivera",
      description: "Kontrollera dina inställningar innan kanaldistributionen aktiveras.",
      required: true,
      dependsOn: "webhook-setup",
    },
  ],
};

registerApp(channelManager);
