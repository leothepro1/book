// ── Supported locales ─────────────────────────────────────────
//
// Single source of truth for all locale codes.
// Swedish is always the platform primary — cannot be removed or unpublished.

export const SUPPORTED_LOCALES = [
  { code: "sv", name: "Svenska", flag: "🇸🇪", country: "se", required: true },
  { code: "en", name: "Engelska", flag: "🇬🇧", country: "gb", required: false },
  { code: "de", name: "Tyska", flag: "🇩🇪", country: "de", required: false },
  { code: "fr", name: "Franska", flag: "🇫🇷", country: "fr", required: false },
  { code: "es", name: "Spanska", flag: "🇪🇸", country: "es", required: false },
  { code: "it", name: "Italienska", flag: "🇮🇹", country: "it", required: false },
  { code: "nl", name: "Nederländska", flag: "🇳🇱", country: "nl", required: false },
  { code: "nb", name: "Norska", flag: "🇳🇴", country: "no", required: false },
  { code: "da", name: "Danska", flag: "🇩🇰", country: "dk", required: false },
  { code: "fi", name: "Finska", flag: "🇫🇮", country: "fi", required: false },
  { code: "pl", name: "Polska", flag: "🇵🇱", country: "pl", required: false },
  { code: "pt", name: "Portugisiska", flag: "🇵🇹", country: "pt", required: false },
  { code: "ru", name: "Ryska", flag: "🇷🇺", country: "ru", required: false },
  { code: "ja", name: "Japanska", flag: "🇯🇵", country: "jp", required: false },
  { code: "zh", name: "Kinesiska", flag: "🇨🇳", country: "cn", required: false },
  { code: "ar", name: "Arabiska", flag: "🇸🇦", country: "sa", required: false },
  { code: "tr", name: "Turkiska", flag: "🇹🇷", country: "tr", required: false },
  { code: "ko", name: "Koreanska", flag: "🇰🇷", country: "kr", required: false },
  { code: "cs", name: "Tjeckiska", flag: "🇨🇿", country: "cz", required: false },
  { code: "ro", name: "Rumänska", flag: "🇷🇴", country: "ro", required: false },
] as const;

/** SVG flag URL for a country code. Uses flagcdn.com (free, no API key). */
export function getFlagUrl(countryCode: string, size: number = 24): string {
  return `https://flagcdn.com/${size}x${Math.round(size * 0.75)}/${countryCode}.png`;
}

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]["code"];

export const PRIMARY_LOCALE: SupportedLocale = "sv";

export function isValidLocale(code: string): code is SupportedLocale {
  return SUPPORTED_LOCALES.some((l) => l.code === code);
}

export function getLocaleInfo(code: SupportedLocale) {
  return SUPPORTED_LOCALES.find((l) => l.code === code);
}
