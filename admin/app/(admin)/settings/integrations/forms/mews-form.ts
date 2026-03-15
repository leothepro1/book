import type { ProviderFormDefinition } from "./types";

export const mewsForm: ProviderFormDefinition = {
  fields: [
    {
      key: "clientToken",
      label: "Client Token",
      type: "password",
      required: true,
      tooltip: "Plattformsnyckel för din integration. Samma för alla hotell du kopplar in. Finns under Mews > Inställningar > Integrationer.",
    },
    {
      key: "accessToken",
      label: "Access Token",
      type: "password",
      required: true,
      tooltip: "Unik nyckel per hotell. Genereras när hotellet godkänner din integration i Mews. Ska inte delas med andra hotell.",
    },
    {
      key: "clientName",
      label: "Client Name",
      type: "text",
      required: true,
      tooltip: "Namn på din applikation som visas i Mews logg. Använd format: NamnPåApp/1.0.0 — t.ex. MinGästportal/1.0.0",
    },
    {
      key: "webhookSecret",
      label: "Webhook Secret",
      type: "password",
      required: true,
      tooltip: "En hemlig kod du väljer själv. Mews lägger till den i webhook-URL:en så att vi kan verifiera att anrop verkligen kommer från Mews.",
    },
    {
      key: "enterpriseId",
      label: "Enterprise ID",
      type: "text",
      default: "",
      tooltip: "Mews unika ID för ditt hotell. Fylls i automatiskt när anslutningen testas — du behöver normalt inte ange detta manuellt.",
    },
    {
      key: "initialSyncDays",
      label: "Historik att synkronisera (dagar)",
      type: "number",
      default: 90,
      tooltip: "Hur många dagar bakåt vi hämtar bokningar vid första synkroniseringen. 90 dagar rekommenderas. Max 365.",
    },
  ],
  helpText: "Läs om hur du hittar dina Mews nycklar",
  docsUrl: "https://docs.mews.com/channel-manager-api/mews-operations",
  docsLabel: "här",
};
