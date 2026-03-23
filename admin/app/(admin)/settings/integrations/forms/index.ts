import type { ProviderFormDefinition } from "./types";
import { mewsForm } from "./mews-form";
import { fakeForm } from "./fake-form";

export type { ProviderFormDefinition, FormFieldDefinition } from "./types";

export const PROVIDER_FORMS: Record<string, ProviderFormDefinition> = {
  mews: mewsForm,
  fake: fakeForm,
};

export type ProviderDisplayInfo = {
  name: string;
  description: string;
  icon?: string;
  logo?: string;
};

export const PROVIDER_DISPLAY: Record<string, ProviderDisplayInfo> = {
  mews: {
    name: "Mews",
    description: "Molnbaserat PMS",
    logo: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773584928/Mews_kdszmq.png",
  },
  fake: {
    name: "Fake PMS",
    description: "Utvecklingsläge",
    logo: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773585376/images_nlcroo.png",
  },
};
