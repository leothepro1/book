import type { ProviderFormDefinition } from "./types";

export const fakeForm: ProviderFormDefinition = {
  fields: [
    {
      key: "scenario",
      label: "Scenario",
      type: "select",
      options: ["happy", "empty", "error", "slow", "cancelled"],
      default: "happy",
      required: true,
    },
    {
      key: "delayMs",
      label: "Simulerad fördröjning (ms)",
      type: "number",
      default: 800,
    },
  ],
  helpText: "Utvecklingsläge — simulerar ett PMS utan riktiga uppgifter",
};
