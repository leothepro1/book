import type { ProviderFormDefinition } from "./types";

/**
 * Dev-only option. The server reroutes provider="fake" to a real Mews
 * demo connection when DEV_MEWS_DEMO_ACCESS_TOKEN is set in
 * .env.local, so no per-connection fields are needed here — "Koppla
 * in" becomes a one-click shortcut to the operator's private Mews
 * demo hotel.
 */
export const fakeForm: ProviderFormDefinition = {
  fields: [],
  helpText:
    "Utvecklingsläge — kopplar dev-tenanten till det privata Mews demo-kontot via DEV_MEWS_DEMO_ACCESS_TOKEN.",
};
