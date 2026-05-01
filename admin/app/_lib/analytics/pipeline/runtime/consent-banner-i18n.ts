/**
 * Phase 3 PR-B Commit G — consent banner i18n strings.
 *
 * Hardcoded sv/en/de translations. Bundled into the loader.<hash>.js
 * artifact (no runtime fetches). Each string is short and operator-
 * editable — Apelviken's GDPR review may request wording changes;
 * those land via PR.
 *
 * Language source: `document.documentElement.lang` (root layout sets
 * `lang="sv"` for the guest portal, but the storefront engine may
 * override via the URL `/p/[token]/[locale]/...` middleware). Falls
 * back to sv on any unknown lang code.
 *
 * If you add a new locale: append a new `*_STRINGS` constant matching
 * the same key set, then update `pickLocale()`. The TypeScript
 * `Record<keyof typeof SV_STRINGS, string>` constraint catches missing
 * keys at compile time.
 */

const SV_STRINGS = {
  title: "Cookies på den här sidan",
  body: "Vi använder cookies för att förbättra din upplevelse och förstå hur vår bokningssida används. Du kan välja vilka kategorier du tillåter.",
  acceptAll: "Acceptera alla",
  rejectAll: "Endast nödvändiga",
  settings: "Inställningar",
  save: "Spara val",
  essentialLabel: "Nödvändiga",
  essentialDescription: "Krävs för att webbplatsen ska fungera. Kan inte stängas av.",
  analyticsLabel: "Analys",
  analyticsDescription: "Hjälper oss förstå hur sidan används så vi kan förbättra den.",
  marketingLabel: "Marknadsföring",
  marketingDescription: "Används för riktade erbjudanden och annonser.",
  closeAriaLabel: "Stäng cookie-bannern",
} as const;

type ConsentStringSet = Record<keyof typeof SV_STRINGS, string>;

const EN_STRINGS: ConsentStringSet = {
  title: "Cookies on this site",
  body: "We use cookies to improve your experience and understand how our booking site is used. You can choose which categories you allow.",
  acceptAll: "Accept all",
  rejectAll: "Only essential",
  settings: "Settings",
  save: "Save choices",
  essentialLabel: "Essential",
  essentialDescription: "Required for the site to function. Cannot be turned off.",
  analyticsLabel: "Analytics",
  analyticsDescription: "Helps us understand how the site is used so we can improve it.",
  marketingLabel: "Marketing",
  marketingDescription: "Used for targeted offers and ads.",
  closeAriaLabel: "Close cookie banner",
};

const DE_STRINGS: ConsentStringSet = {
  title: "Cookies auf dieser Seite",
  body: "Wir verwenden Cookies, um Ihre Erfahrung zu verbessern und zu verstehen, wie unsere Buchungsseite genutzt wird. Sie können wählen, welche Kategorien Sie zulassen.",
  acceptAll: "Alle akzeptieren",
  rejectAll: "Nur notwendige",
  settings: "Einstellungen",
  save: "Auswahl speichern",
  essentialLabel: "Notwendig",
  essentialDescription: "Erforderlich, damit die Website funktioniert. Kann nicht deaktiviert werden.",
  analyticsLabel: "Analyse",
  analyticsDescription: "Hilft uns zu verstehen, wie die Seite genutzt wird, damit wir sie verbessern können.",
  marketingLabel: "Marketing",
  marketingDescription: "Wird für gezielte Angebote und Werbung verwendet.",
  closeAriaLabel: "Cookie-Banner schließen",
};

export type SupportedLocale = "sv" | "en" | "de";

const LOCALE_TABLE: Record<SupportedLocale, ConsentStringSet> = {
  sv: SV_STRINGS,
  en: EN_STRINGS,
  de: DE_STRINGS,
};

/**
 * Pick the closest supported locale from a BCP 47 tag (e.g. "sv-SE",
 * "en-GB", "de"). Falls back to sv for unknown languages — Bedfront's
 * primary market is Sweden.
 */
export function pickLocale(tag: string | null | undefined): SupportedLocale {
  if (!tag) return "sv";
  const lang = tag.toLowerCase().slice(0, 2);
  if (lang === "sv" || lang === "en" || lang === "de") return lang;
  return "sv";
}

export function consentStrings(locale: SupportedLocale): ConsentStringSet {
  return LOCALE_TABLE[locale];
}
