import type { ProviderFormDefinition } from "./types";
import { mewsForm } from "./mews-form";
import { fakeForm } from "./fake-form";
import { saltoForm } from "./salto-form";

export type { ProviderFormDefinition, FormFieldDefinition } from "./types";

export const PROVIDER_FORMS: Record<string, ProviderFormDefinition> = {
  mews: mewsForm,
  fake: fakeForm,
  salto: saltoForm,
};

export type ProviderDisplayInfo = {
  name: string;
  description: string;
  icon?: string;
  logo?: string;
  /** "pms" or "lock" — determines which actions to call for save/test/disconnect */
  integrationType: "pms" | "lock";
};

export const PROVIDER_DISPLAY: Record<string, ProviderDisplayInfo> = {
  mews: {
    name: "Mews",
    description: "Molnbaserat PMS",
    logo: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773584928/Mews_kdszmq.png",
    integrationType: "pms",
  },
  fake: {
    name: "Fake PMS",
    description: "Utvecklingsläge",
    logo: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773585376/images_nlcroo.png",
    integrationType: "pms",
  },
  salto: {
    name: "Salto",
    description: "Digitala nycklar",
    logo: "https://communitycontrols.com/wp-content/uploads/2018/02/salto-logo.png",
    integrationType: "lock",
  },
};
