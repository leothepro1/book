// Admin i18n - följer samma pattern som guest portal
export type AdminLocale = "sv" | "en";

const adminDict = {
  sv: {
    // Sidebar
    myPortal: 'Min portal',
    home: 'Startsida',
    account: 'Kontosida',
    bookings: 'Gäster',
    organization: 'Organisation',
    tools: 'Tools',
    analytics: 'Analyser',
    integrations: 'Integrationer',
  },
  en: {
    myPortal: 'My portal',
    home: 'Home',
    account: 'Account',
    bookings: 'Guests',
    organization: 'Organization',
    tools: 'Tools',
    analytics: 'Analytics',
    integrations: 'Integrations',
  },
  // Placeholder för framtida: de, fr, es, no
} as const;

export function t(locale: AdminLocale, key: keyof typeof adminDict["sv"]) {
  return adminDict[locale]?.[key] ?? adminDict.sv[key];
}
