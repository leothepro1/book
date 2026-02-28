import type { TenantConfig } from "./types";

export async function getTenantConfig(_hint: string): Promise<TenantConfig> {
  return {
    tenantId: "default",

    theme: {
      version: 1,

      colors: {
        background: "#0b1020",
        text: "#ffffff",
        buttonBg: "#ffffff",
        buttonText: "#0b1020",
      },

      header: {
        logoUrl: undefined,
        logoWidth: 120,
      },

      background: {
        mode: "fill",
      },

      buttons: {
        variant: "solid",
        radius: "rounder",
        shadow: "soft",
      },

      typography: {
        headingFont: "inter",
        bodyFont: "inter",
        mutedOpacity: 0.72,
      },
    },

    home: {
      version: 1,
      links: [
        {
          id: "checkin",
          order: 10,
          isEnabled: true,
          label_sv: "Checka in",
          label_en: "Check in",
          icon: "calendar",
          type: "internalModule",
          moduleKey: "checkin",
        },
        {
          id: "info",
          order: 20,
          isEnabled: true,
          label_sv: "Information",
          label_en: "Information",
          icon: "info",
          type: "internalModule",
          moduleKey: "info",
        },
      ],
    },

    footer: {
      version: 1,
      items: [
        {
          key: "home",
          order: 10,
          isEnabled: true,
          label_sv: "Hem",
          label_en: "Home",
          requiredFeature: "none",
        },
        {
          key: "shop",
          order: 20,
          isEnabled: true,
          label_sv: "Shop",
          label_en: "Shop",
          requiredFeature: "commerce",
        },
        {
          key: "account",
          order: 30,
          isEnabled: true,
          label_sv: "Konto",
          label_en: "Account",
          requiredFeature: "account",
        },
      ],
    },

    features: {
      commerceEnabled: false,
      accountEnabled: false,

      notificationsEnabled: true,
      languageSwitcherEnabled: true,
    },

    rules: [],
  };
}
