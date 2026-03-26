import { registerApp } from "../registry";
import type { AppDefinition } from "../types";

const guestCrm: AppDefinition = {
  id: "guest-crm",
  name: "Gäst-CRM",
  tagline: "Gästprofiler, historik och segmentering",
  description:
    "Samla all gästdata på ett ställe. Se bokningshistorik, preferenser och kommunikation per gäst. " +
    "Segmentera gäster baserat på antal besök, intäkt och beteende. " +
    "Perfekt för personlig service och riktad marknadsföring.",
  icon: "contacts",
  category: "crm",
  developer: "bedfront",
  pricing: [
    {
      tier: "free",
      pricePerMonth: 0,
      features: [
        "Gästprofiler",
        "Bokningshistorik",
        "Grundläggande sökning",
      ],
    },
    {
      tier: "grow",
      pricePerMonth: 34900,
      features: [
        "Allt i Gratis",
        "Gästsegmentering",
        "Anteckningar och taggar",
        "Exportera gästlista",
        "VIP-markering",
      ],
    },
  ],
  requiredSetup: ["pms"],
  dependencies: [],
  permissions: ["guests:read", "guests:write", "bookings:read"],
  webhooks: ["booking.confirmed", "guest.updated"],
  highlights: [
    { icon: "contacts", title: "Gästprofiler", description: "Samla all gästdata — bokningshistorik, preferenser och kommunikation." },
    { icon: "auto_awesome", title: "VIP-markering", description: "Automatisk VIP-status baserat på antal besök och total spend." },
    { icon: "segment", title: "Segmentering", description: "Dela in gäster i grupper baserat på beteende och värde." },
  ],
  longDescription:
    "## Alla gäster på ett ställe\n\n" +
    "Gäst-CRM samlar all gästdata från bokningar, köp och kommunikation i en profil. " +
    "Se hela historiken — antal besök, total spend, preferenser.\n\n" +
    "## Automatisk VIP-hantering\n\n" +
    "Sätt en tröskel för VIP-status och appen markerar gäster automatiskt. " +
    "Perfekt för personlig service och riktade kampanjer.",
  worksWithApps: ["email-marketing"],
  screenshots: [],
  worksWithServices: [],
  changelog: [
    { version: "1.0.0", date: "2026-03-01", changes: ["Gästprofiler med bokningshistorik", "Automatisk VIP-markering", "Grundläggande segmentering"] },
  ],
  setupSteps: [
    {
      id: "crm-config",
      type: "config",
      title: "CRM-inställningar",
      description: "Konfigurera hur gästprofiler hanteras.",
      required: false,
      configFields: [
        {
          key: "autoMerge",
          label: "Automatisk sammanslagning",
          type: "toggle",
          default: true,
          hint: "Slå ihop gästprofiler automatiskt baserat på e-postadress.",
        },
        {
          key: "retentionMonths",
          label: "Bevarandeperiod (månader)",
          type: "number",
          default: 36,
          hint: "Hur länge gästdata sparas efter senaste bokning. 0 = obegränsat.",
        },
        {
          key: "vipThreshold",
          label: "VIP-tröskel (antal bokningar)",
          type: "number",
          default: 3,
          hint: "Antal bokningar innan en gäst automatiskt markeras som VIP.",
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

registerApp(guestCrm);
