export type Locale = "sv" | "en";

const dict = {
  sv: {
    notificationsTitle: "Notiser",
    noNotificationsTitle: "Inga notiser än",
    noNotificationsBody: "Meddelanden, nya funktioner och insikter visas här.",
  },
  en: {
    notificationsTitle: "Notifications",
    noNotificationsTitle: "No notifications yet",
    noNotificationsBody: "Messages, new features, and insights will appear here.",
  },
} as const;

export function t(locale: Locale, key: keyof typeof dict["en"]) {
  return dict[locale]?.[key] ?? dict.en[key];
}