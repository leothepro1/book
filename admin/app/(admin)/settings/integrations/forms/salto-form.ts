import type { ProviderFormDefinition } from "./types";

export const saltoForm: ProviderFormDefinition = {
  fields: [
    {
      key: "clientId",
      label: "Client ID",
      type: "text",
      required: true,
    },
    {
      key: "clientSecret",
      label: "Client Secret",
      type: "password",
      required: true,
    },
    {
      key: "siteId",
      label: "Site ID",
      type: "text",
      required: true,
      tooltip: "Hotellets Salto-installation. Finns under Settings i Salto Nebula.",
    },
    {
      key: "apiBaseUrl",
      label: "API Base URL",
      type: "text",
      required: false,
      tooltip: "Lämna tomt för standard (api.saltosystems.com). Ange enbart om ni har en on-premise Salto-installation.",
    },
  ],
  helpText: "Anslut ert Salto Nebula-system för att erbjuda digitala rumnycklar till gäster.",
  docsUrl: "https://developer.saltosystems.com/nebula/api/",
  docsLabel: "Salto Nebula API-docs",
};
