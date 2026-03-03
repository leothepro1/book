import type { FontKey } from "./types";

/**
 * Maps FontKey → Google Fonts family name.
 * Returns null for system fonts or fonts not on Google Fonts.
 */
const GOOGLE_FONT_MAP: Partial<Record<FontKey, string>> = {
  albert_sans: "Albert+Sans",
  dm_sans: "DM+Sans",
  epilogue: "Epilogue",
  ibm_plex_sans: "IBM+Plex+Sans",
  inter: "Inter",
  link_sans: "Ysabeau+SC", // Link Sans not on Google Fonts, closest alternative
  manrope: "Manrope",
  oxanium: "Oxanium",
  poppins: "Poppins",
  red_hat_display: "Red+Hat+Display",
  roboto: "Roboto",
  rubik: "Rubik",
  space_grotesk: "Space+Grotesk",
  syne: "Syne",
  biorhyme: "BioRhyme",
  bitter: "Bitter",
  caudex: "Caudex",
  corben: "Corben",
  domine: "Domine",
  hahmlet: "Hahmlet",
  playfair: "Playfair+Display",
};

/**
 * Generates a Google Fonts <link> URL for the given font keys.
 * Deduplicates and skips system/avenir fonts.
 */
export function googleFontsUrl(keys: FontKey[]): string | null {
  const families = new Set<string>();

  for (const key of keys) {
    const family = GOOGLE_FONT_MAP[key];
    if (family) families.add(family);
  }

  if (families.size === 0) return null;

  const familyParams = Array.from(families)
    .map((f) => `family=${f}:wght@400;500;600;700`)
    .join("&");

  return `https://fonts.googleapis.com/css2?${familyParams}&display=swap`;
}
