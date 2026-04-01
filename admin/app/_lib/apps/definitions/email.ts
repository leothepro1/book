import { registerApp } from "../registry";
import type { AppDefinition } from "../types";

const email: AppDefinition = {
  id: "email",
  name: "E-post",
  tagline: "Kampanjer, automationer och transaktionella e-postmeddelanden",
  description:
    "Skicka nyhetsbrev, skapa automatiserade flöden och hantera all e-post " +
    "direkt från plattformen. Inbyggd bounce-hantering, suppressionslista " +
    "och detaljerad leveransstatistik — ingen extern tjänst behövs.",
  icon: "mail",
  iconUrl: "https://cdn.shopify.com/app-store/listing_images/14711ad7477a3d0211488990623ad24c/icon/COHnkub2sZEDEAE=.png",
  category: "marketing",
  developer: "bedfront",
  pricing: [
    {
      tier: "free",
      pricePerMonth: 0,
      features: [
        "Transaktionella e-postmeddelanden",
        "Mallanpassning och varumärkesprofil",
        "Avregistreringssida",
        "Leveranslogg",
      ],
    },
    {
      tier: "grow",
      pricePerMonth: 29900,
      features: [
        "Allt i Gratis",
        "Kampanjer med schemaläggning",
        "Automatiserade flöden",
        "Kontaktlistor och segment",
        "Öppnings- och klickstatistik",
      ],
    },
    {
      tier: "pro",
      pricePerMonth: 59900,
      features: [
        "Allt i Grow",
        "A/B-testning av ämnesrader",
        "Avancerad attribution",
        "Egen sändardomän",
        "Dedikerad IP",
      ],
    },
  ],
  requiredSetup: [],
  dependencies: [],
  permissions: ["guests:read", "bookings:read", "orders:read"],
  webhooks: [],
  setupSteps: [],
  highlights: [
    {
      icon: "campaign",
      title: "Kampanjer",
      description: "Skapa och schemalägg nyhetsbrev till dina gäster med den visuella redigeraren.",
    },
    {
      icon: "account_tree",
      title: "Automationer",
      description: "Välkomstflöden, post-vistelse-uppföljning och reaktivering — helt automatiskt.",
    },
    {
      icon: "verified",
      title: "Leveransbarhet",
      description: "Inbyggd bounce-hantering, suppressionslista och rate limiting skyddar ditt avsändarrykte.",
    },
  ],
  longDescription:
    "## Allt du behöver för e-post — inbyggt\n\n" +
    "E-postappen ersätter externa verktyg som Mailchimp och Klaviyo med en " +
    "fullständig e-postmotor inbyggd i plattformen. Kampanjer, automationer " +
    "och transaktionella meddelanden hanteras från ett och samma ställe.\n\n" +
    "## Kampanjer\n\n" +
    "Skapa nyhetsbrev med den visuella blockredigeraren. Välj mottagare, " +
    "schemalägg utskick och följ upp med öppnings- och klickstatistik i realtid.\n\n" +
    "## Automationer\n\n" +
    "Bygg automatiserade flöden som triggas av gästbeteende. Välkomstserier " +
    "vid registrering, uppföljning efter vistelse och reaktivering av inaktiva gäster.\n\n" +
    "## Leveransbarhet i fokus\n\n" +
    "Bounce-hantering, suppressionslistor och rate limiting körs automatiskt " +
    "i bakgrunden. Dina meddelanden når inkorgen — inte skräpposten.",
  worksWithApps: ["email-marketing", "guest-crm"],
  screenshots: [],
  worksWithServices: [],
  changelog: [
    {
      version: "1.0.0",
      date: "2026-04-01",
      changes: [
        "Kampanjer med schemaläggning",
        "Automatiserade flöden (3 triggers)",
        "Bounce-hantering och suppressionslista",
        "Blockredigerare för e-postmallar",
      ],
    },
  ],
};

registerApp(email);
