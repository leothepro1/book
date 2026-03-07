import type { FontKey } from "./types";
import { FONT_CATALOG } from "@/app/_lib/fonts/catalog";

const googleMap = new Map(
  FONT_CATALOG.filter((f) => f.google).map((f) => [f.key, f.google!])
);

/**
 * Generates a Google Fonts <link> URL for the given font keys.
 * Deduplicates and skips system/unavailable fonts.
 */
export function googleFontsUrl(keys: FontKey[]): string | null {
  const families = new Set<string>();

  for (const key of keys) {
    const family = googleMap.get(key);
    if (family) families.add(family);
  }

  if (families.size === 0) return null;

  const familyParams = Array.from(families)
    .map((f) => `family=${f}:wght@400;500;600;700`)
    .join("&");

  return `https://fonts.googleapis.com/css2?${familyParams}&display=swap`;
}
