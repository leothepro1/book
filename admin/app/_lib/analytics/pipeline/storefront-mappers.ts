/**
 * Storefront-event field mappers.
 *
 * Pure functions that convert operational/Prisma values to the shapes
 * the storefront analytics schemas require. Centralised here so every
 * emit-site goes through the same bridge — adding a new
 * `AccommodationType` enum value or changing the timezone library
 * happens in exactly one place.
 *
 * No imports from runtime, loader, or worker code. No I/O. No
 * environment access. Safe to use from server components, client
 * components, server actions, and the worker bundle.
 */

import { AccommodationType } from "@prisma/client";

// ── accommodationTypeToSchema ────────────────────────────────────────
//
// Bridge from Prisma's UPPERCASE `AccommodationType` enum to the
// lowercase enum that `accommodation_viewed` v0.1.0 specifies.
//
// Exhaustive over the 5 enum values. If a new value is added to the
// Prisma enum without updating this mapper, TypeScript will fail at
// compile time on the `never` fallthrough — `assertUnreachable` enforces
// that the schema bump and the mapper update happen together.

export type AccommodationTypeSchema =
  | "hotel"
  | "cabin"
  | "camping"
  | "apartment"
  | "pitch";

export function accommodationTypeToSchema(
  t: AccommodationType,
): AccommodationTypeSchema {
  switch (t) {
    case AccommodationType.HOTEL:
      return "hotel";
    case AccommodationType.CABIN:
      return "cabin";
    case AccommodationType.CAMPING:
      return "camping";
    case AccommodationType.APARTMENT:
      return "apartment";
    case AccommodationType.PITCH:
      return "pitch";
    default:
      return assertUnreachable(t);
  }
}

// ── toTenantCivilDate ────────────────────────────────────────────────
//
// Converts a JavaScript `Date` (which is always a UTC instant under the
// hood) to a `YYYY-MM-DD` civil-date string in the named IANA timezone.
//
// Used by `availability_searched` to produce property-local check-in
// and check-out dates regardless of the guest's browser timezone.
//
// Implementation uses `Intl.DateTimeFormat` with the `timeZone` option
// — the only standard, robust way to do timezone conversion in JS
// without pulling a date library into the worker bundle. Output
// formatted as `en-CA` locale because that's the locale whose default
// short-date format is `YYYY-MM-DD`; the locale choice has no other
// effect on the output.

export function toTenantCivilDate(d: Date, tenantTimezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tenantTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d);
}

// ── Internal helpers ─────────────────────────────────────────────────

function assertUnreachable(x: never): never {
  throw new Error(
    `accommodationTypeToSchema: unhandled AccommodationType value: ${String(x)}`,
  );
}
