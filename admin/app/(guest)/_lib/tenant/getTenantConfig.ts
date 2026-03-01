import type { TenantConfig } from "./types";

export async function getTenantConfig(_hint: string): Promise<TenantConfig> {
  return {
    tenantId: "default",
    property: {
      name: "Apelviken Camping",
      address: "Apelviksvägen 47, 439 76 Kungsbacka",
      latitude: 57.4875,
      longitude: 12.0739,
      checkInTime: "14:00",
      checkOutTime: "11:00",
      timezone: "Europe/Stockholm",
    },
    theme: {
      version: 1,
      colors: {
        background: "#fff",
        text: "#2D2C2B",
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
    supportLinks: {
      supportUrl: "https://apelviken.se/support",
      faqUrl: "https://apelviken.se/faq",
    },
    rules: [],
  };
}
