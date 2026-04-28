import { registerApp } from "../registry";
import type { AppDefinition } from "../types";

const spotBooking: AppDefinition = {
  id: "spot-booking",
  name: "Platsbokning",
  tagline: "Lat dina gaster valja exakt var de vill bo",
  description:
    "Lagg till en interaktiv karta dar gasterna kan valja sin specifika plats. " +
    "Perfekt for campingplatser, stugbyar och resorts dar laget ar en del av upplevelsen.",
  icon: "map",
  iconUrl: "https://res.cloudinary.com/dmgmoisae/image/upload/q_auto/f_auto/v1775408407/CIqiqqXsiIADEAE_uh5a5l.png",
  category: "operations",
  developer: "bedfront",
  pricing: [
    {
      tier: "free",
      pricePerMonth: 0,
      features: [
        "Interaktiv karta",
        "Obegransat antal platser",
        "Realtidstillganglighet",
      ],
    },
  ],
  requiredSetup: [],
  dependencies: [],
  permissions: ["accommodations:read", "accommodations:write", "bookings:read"],
  webhooks: [],
  wizardComponent: "spot-booking",
  permissionLabels: [
    "Laser boendeinformation och tillganglighet",
    "Uppdaterar boenden med kartmarkeringar",
    "Laser bokningar for tillganglighetskontroll",
  ],
  heroHeading: "Lat gasterna valja sin plats pa kartan",
  heroDescription:
    "Ge dina gaster mojlighet att sjalva valja exakt var de vill bo. " +
    "En interaktiv karta visar tillgangliga platser i realtid och gor bokningsupplevelsen personlig.",
  highlights: [
    {
      icon: "map",
      title: "Interaktiv karta",
      description:
        "Ladda upp din egen kartbild och markera varje bokningsbar plats med drag-and-drop.",
    },
    {
      icon: "visibility",
      title: "Realtidstillganglighet",
      description:
        "Gasten ser direkt vilka platser som ar lediga for sina valda datum.",
    },
    {
      icon: "add_shopping_cart",
      title: "Platsillagg",
      description:
        "Lagg till en valfri avgift nar gasten valjer en specifik plats istallet for automatisk tilldelning.",
    },
  ],
  screenshots: [],
  longDescription:
    "## Platsbokning for campingplatser, stugbyar och resorts\n\n" +
    "Med Platsbokning kan du ladda upp en karta over ditt omrade och markera varje bokningsbar plats. " +
    "Gasterna ser en interaktiv karta i bokningsfloden dar de kan valja exakt vilken plats de vill ha.\n\n" +
    "- Ladda upp valfri kartbild (oversiktsplan, satellitbild, illustration)\n" +
    "- Markera platser med drag-and-drop direkt i adminpanelen\n" +
    "- Platser kopplas till befintliga boenden i systemet\n" +
    "- Realtidstillganglighet — bokade platser doljs automatiskt\n" +
    "- Valfri tilllaggsavgift for platsval",
  worksWithApps: [],
  worksWithServices: [],
  supportUrl: "https://rutgr.com/support/spot-booking",
  documentationUrl: "https://rutgr.com/docs/spot-booking",
  changelog: [
    {
      version: "1.0.0",
      date: "2026-03-31",
      changes: [
        "Forsta versionen med interaktiv karta",
        "Installationsguide med kartuppladdning",
        "Platsmarkeringar med drag-and-drop",
      ],
    },
  ],
  setupSteps: [],
  pages: [
    { slug: "", label: "Överblick", icon: "dashboard" },
    { slug: "settings", label: "Inställningar", icon: "settings" },
  ],
};

registerApp(spotBooking);
