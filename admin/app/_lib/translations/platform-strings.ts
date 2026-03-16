// ── Platform string registry ──────────────────────────────────
//
// Platform strings are defined in code, not in the database.
// Tenant overrides win. Platform defaults are the final fallback.
//
// Add entries here as platform-authored copy grows.

import type { PlatformStringDefinition, PlatformStringMap } from "./types";
import { makeResourceId } from "./types";

const PLATFORM_STRINGS: PlatformStringDefinition[] = [
  // Add platform strings here as needed, e.g.:
  // {
  //   resourceId: makeResourceId("platform:global:checkin_button"),
  //   defaultTranslations: { sv: "Checka in", en: "Check in", de: "Einchecken" },
  // },
];

export const platformStringMap: PlatformStringMap = new Map(
  PLATFORM_STRINGS.map((s) => [s.resourceId, s]),
);
