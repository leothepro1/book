import { registerApp } from "../registry";
import type { AppDefinition } from "../types";

const revenueAnalytics: AppDefinition = {
  id: "revenue-analytics",
  name: "Intäktsanalys",
  tagline: "RevPAR, beläggning och intäktsrapporter i realtid",
  description:
    "Fullständig intäktsanalys för din verksamhet. " +
    "Se RevPAR, beläggningsgrad, ADR och intäkt per kanal i realtid. " +
    "Jämför perioder, identifiera trender och fatta datadrivna beslut.",
  icon: "monitoring",
  category: "analytics",
  developer: "bedfront",
  pricing: [
    {
      tier: "free",
      pricePerMonth: 0,
      features: [
        "Grundläggande intäktsöversikt",
        "Månadsvis beläggning",
        "Ordersammanställning",
      ],
    },
    {
      tier: "grow",
      pricePerMonth: 39900,
      features: [
        "Allt i Gratis",
        "RevPAR och ADR",
        "Kanalfördelning",
        "Periodjämförelse",
        "Exportera rapporter",
      ],
    },
  ],
  requiredSetup: [],
  dependencies: [],
  permissions: ["orders:read", "bookings:read", "analytics:read"],
  webhooks: [],
  highlights: [
    { icon: "monitoring", title: "RevPAR i realtid", description: "Se Revenue Per Available Room, ADR och beläggningsgrad live." },
    { icon: "compare_arrows", title: "Periodjämförelse", description: "Jämför intäkter mellan perioder för att identifiera trender." },
    { icon: "download", title: "Exportera rapporter", description: "Ladda ner detaljerade rapporter i CSV-format." },
  ],
  longDescription:
    "## Fullständig intäktsanalys\n\n" +
    "Intäktsanalys-appen ger dig en komplett överblick av din verksamhets ekonomiska hälsa. " +
    "Se RevPAR, ADR, beläggningsgrad och intäkt per kanal i realtid.\n\n" +
    "## Datadrivna beslut\n\n" +
    "Jämför perioder, identifiera säsongsmönster och optimera din prissättning baserat på " +
    "faktisk data — inte magkänsla.",
  worksWithApps: ["google-ads", "meta-ads", "channel-manager"],
  screenshots: [],
  worksWithServices: [],
  changelog: [
    { version: "1.0.0", date: "2026-03-01", changes: ["Grundläggande intäktsöversikt", "Beläggningsrapport", "Periodjämförelse"] },
  ],
  setupSteps: [
    {
      id: "analytics-config",
      type: "config",
      title: "Rapportinställningar",
      description: "Konfigurera standardvärden för dina rapporter.",
      required: false,
      configFields: [
        {
          key: "defaultDateRange",
          label: "Standardperiod",
          type: "select",
          default: "30d",
          options: [
            { label: "Senaste 7 dagarna", value: "7d" },
            { label: "Senaste 30 dagarna", value: "30d" },
            { label: "Senaste 90 dagarna", value: "90d" },
            { label: "Innevarande månad", value: "mtd" },
            { label: "Innevarande år", value: "ytd" },
          ],
        },
        {
          key: "currency",
          label: "Rapportvaluta",
          type: "select",
          default: "SEK",
          options: [
            { label: "SEK", value: "SEK" },
            { label: "EUR", value: "EUR" },
            { label: "NOK", value: "NOK" },
            { label: "DKK", value: "DKK" },
          ],
        },
      ],
    },
    {
      id: "review",
      type: "review",
      title: "Granska och aktivera",
      description: "Kontrollera dina inställningar innan appen aktiveras.",
      required: true,
    },
  ],
};

registerApp(revenueAnalytics);
