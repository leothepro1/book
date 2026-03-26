import { registerApp } from "../registry";
import type { AppDefinition } from "../types";

const mailchimp: AppDefinition = {
  id: "mailchimp",
  name: "Mailchimp",
  tagline: "E-postmarknadsföring och automation för dina gäster",
  description:
    "Synkronisera dina gäster med Mailchimp och trigga automatiserade kampanjer baserade på bokningar och köp. " +
    "Automatiska segment för VIP-gäster, återkommande besökare och nya kunder. " +
    "Spåra vilka e-postmeddelanden som driver intäkter.",
  icon: "mail",
  category: "marketing",
  developer: "bedfront",
  wizardComponent: "mailchimp",
  pricing: [
    {
      tier: "free",
      pricePerMonth: 0,
      features: [
        "Upp till 500 kontakter synkroniserade",
        "Automatiska segment (VIP, återkommande, nya)",
        "Grundläggande automationstriggers",
      ],
    },
    {
      tier: "grow",
      pricePerMonth: 29900,
      features: [
        "Obegränsat antal kontakter",
        "Alla automationstriggers",
        "Intäktsattribuering",
        "Anpassade segment",
      ],
    },
  ],
  requiredSetup: [],
  dependencies: [],
  permissions: ["orders:read", "bookings:read", "guests:read"],
  webhooks: [
    "booking.confirmed",
    "booking.cancelled",
    "booking.checked_in",
    "booking.checked_out",
    "order.paid",
    "guest.created",
    "guest.updated",
  ],
  healthCheck: {
    endpoint: "/api/apps/mailchimp/health",
    intervalMinutes: 60,
    timeoutMs: 5000,
    degradedThresholdMs: 3000,
  },
  highlights: [
    { icon: "sync", title: "Automatisk synkronisering", description: "Gäster synkas i realtid vid varje bokning, köp och utcheckning." },
    { icon: "label", title: "5 automatiska segment", description: "VIP, återkommande, nya, senaste och inaktiva gäster — alltid uppdaterade." },
    { icon: "attach_money", title: "Intäktsattribuering", description: "Se vilka Mailchimp-kampanjer som driver bokningar och intäkter." },
  ],
  longDescription:
    "## Synkronisera gäster till Mailchimp\n\n" +
    "Mailchimp-appen kopplar din bokningsmotor direkt till din Mailchimp-publik. " +
    "Varje gäst som bokar, köper eller checkar ut synkas automatiskt med fullständig " +
    "profildata och smarta segment.\n\n" +
    "## Automatiska segment\n\n" +
    "Fem segment skapas automatiskt:\n" +
    "- **VIP-gäster** — spenderat över din valda tröskel\n" +
    "- **Återkommande** — minst 2 bokningar\n" +
    "- **Nya gäster** — exakt 1 bokning\n" +
    "- **Senaste** — bokade inom 90 dagar\n" +
    "- **Inaktiva** — inte bokat på 180 dagar\n\n" +
    "## Automationstriggers\n\n" +
    "Trigga Mailchimp-automationer baserat på bokningshändelser. " +
    "Skicka välkomstmeddelanden vid bokning, uppföljning efter utcheckning, " +
    "och nå ut till inaktiva gäster automatiskt.",
  worksWithApps: ["guest-crm", "revenue-analytics"],
  screenshots: [],
  worksWithServices: [{ name: "Mailchimp" }],
  supportUrl: "https://bedfront.com/support/mailchimp",
  documentationUrl: "https://bedfront.com/docs/mailchimp",
  changelog: [
    { version: "1.0.0", date: "2026-03-20", changes: ["Automatisk gästsynkronisering", "5 inbyggda segment", "Automationstriggers vid bokning och utcheckning"] },
  ],
  setupSteps: [
    {
      id: "api-key",
      type: "api_key",
      title: "Anslut Mailchimp",
      description: "Ange din Mailchimp API-nyckel",
      required: true,
      apiKeyConfig: {
        fields: [
          {
            key: "apiKey",
            label: "API-nyckel",
            placeholder: "abc123def456...-us21",
            secret: true,
            helpUrl: "https://mailchimp.com/help/about-api-keys/",
          },
        ],
      },
    },
    {
      id: "list-select",
      type: "account_select",
      title: "Välj publik",
      description: "Välj vilken Mailchimp-publik dina gäster ska synkroniseras till",
      required: true,
      dependsOn: "api-key",
      accountSelectConfig: {
        fetchEndpoint: "/api/apps/mailchimp/lists",
        labelKey: "name",
        valueKey: "id",
      },
    },
    {
      id: "automations",
      type: "config",
      title: "Automationer",
      description: "Välj vilka händelser som ska trigga e-postautomationer",
      required: false,
      dependsOn: "list-select",
      configFields: [
        {
          key: "triggerBookingConfirmed",
          label: "Bokningsbekräftelse",
          type: "toggle",
          default: true,
          hint: "Triggar automation när en bokning bekräftas",
        },
        {
          key: "triggerCheckedOut",
          label: "Utcheckning",
          type: "toggle",
          default: true,
          hint: "Skicka uppföljning och be om recension",
        },
        {
          key: "triggerLapsed",
          label: "Inaktiva gäster",
          type: "toggle",
          default: false,
          hint: "Trigga automation för gäster som inte bokat på 180 dagar",
        },
        {
          key: "vipThreshold",
          label: "VIP-gräns (kr)",
          type: "number",
          default: 10000,
          hint: "Gäster som spenderat mer märks som VIP",
        },
      ],
    },
    {
      id: "review",
      type: "review",
      title: "Granska och aktivera",
      description: "Kontrollera dina inställningar innan appen aktiveras.",
      required: true,
      dependsOn: "automations",
    },
  ],
};

registerApp(mailchimp);
