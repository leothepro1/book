/**
 * availability_searched v0.1.0 (storefront)
 * ─────────────────────────────────────────
 *
 * Fires when the guest performs an availability search (date range +
 * guest count). Phase 5 uses this for demand-curve analysis ("when do
 * guests look for stays?"), conversion-from-search rates, and zero-
 * result detection (queries that found no matches — operational signal
 * for inventory gaps).
 *
 * Triggered by: the analytics worker (Phase 3 PR-B), subscribed to the
 * portal's search-form submission events. Fires once per submitted
 * search, including searches that return zero results.
 *
 * Consent category: `analytics`.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Semantic Contract
 * ──────────────────────────────────────────────────────────────────────
 *
 * `check_in_date`, `check_out_date`. ISO 8601 civil dates in
 *   `YYYY-MM-DD` format, interpreted in the TENANT'S TIMEZONE
 *   (`Tenant.settings.property.timezone`, an IANA name such as
 *   `Europe/Stockholm`). NOT the browser's timezone. NOT UTC.
 *
 *   Rationale: "check-in 15 juni" is a property-local concept. A guest
 *   in `America/New_York` selecting "tomorrow" must produce the same
 *   civil date that the property staff would write on the booking
 *   sheet. Treating the dates as browser-local would shift them by up
 *   to 12 hours; treating them as UTC would shift them by up to the
 *   property's UTC offset.
 *
 *   Emit-sites MUST convert the browser-clock Date to a tenant-local
 *   civil date before emit. The canonical helper is exported from
 *   `app/_lib/analytics/pipeline/storefront-mappers.ts`:
 *
 *       toTenantCivilDate(d: Date, tenantTimezone: string): string
 *
 *   The helper uses `Intl.DateTimeFormat` with the `timeZone` option
 *   to derive the YYYY-MM-DD string in the named zone.
 *
 * `number_of_guests`. Positive integer, defined as `adults + children`
 *   per the booking-form input. Infants are NOT included (the current
 *   guest-count UI does not capture infants). When an infants control
 *   is added to the search form, this schema bumps to v0.2.0 with a
 *   new `guests_infants` field; v0.1.0 readers continue working with
 *   adults+children semantics undisturbed.
 *
 * `results_count`. Non-negative integer. The count of accommodation
 *   categories returned by `adapter.getAvailability(...)` AFTER the
 *   adapter's own availability filtering AND AFTER any user-applied
 *   filters in `filters_applied`. Includes only categories the guest
 *   could actually book — categories that are unavailable, sold out,
 *   or filtered out are NOT counted.
 *
 *   Zero is a valid and meaningful value. Phase 5 zero-result
 *   detection (the "queries that found no matches" inventory-gap
 *   signal named in the docstring above) relies on this — emit-sites
 *   MUST fire the event with `results_count: 0` when the search
 *   returns nothing rather than suppressing emission.
 *
 * `filters_applied`. Array of namespaced filter identifiers. Format:
 *
 *       <namespace>:<value>
 *
 *   Recognised namespaces:
 *
 *     • `facility:<FacilityType>` for facility filters. The value is
 *       the lowercased Prisma `FacilityType` enum value, e.g.
 *       `"facility:wifi"`, `"facility:pet_friendly"`. Emit-sites MUST
 *       lowercase the enum value before composing the identifier.
 *       Cross-tenant aggregation on facility identifiers is meaningful
 *       — the `FacilityType` enum is platform-wide.
 *
 *     • `category:<cuid>` for `AccommodationCategory` filters. The
 *       value is the category's cuid, e.g.
 *       `"category:cmcb12abc..."`. Cuids are opaque per-tenant —
 *       cross-tenant aggregation on category identifiers is NOT
 *       meaningful by design.
 *
 *   Empty array when no filters applied. Order of elements is the
 *   order the guest applied them in the UI; this is preserved for
 *   debugging and is NOT semantically meaningful for aggregation.
 *
 *   Adding a new namespace (e.g. a future `price_range:`) requires a
 *   v0.2.0 schema bump. Phase 5 readers MUST tolerate unknown
 *   namespaces during migration windows — bucket into "unknown
 *   filter" rather than discarding the event.
 *
 * `storefront_context`. Shared StorefrontContextSchema fields. See
 *   `_storefront-context.ts` for the contract on each.
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";
import { StorefrontContextSchema } from "./_storefront-context";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const AvailabilitySearchedPayloadSchema = StorefrontContextSchema.and(
  z.object({
    check_in_date: z.string().regex(ISO_DATE, "check_in_date must be YYYY-MM-DD"),
    check_out_date: z.string().regex(ISO_DATE, "check_out_date must be YYYY-MM-DD"),
    number_of_guests: z.number().int().positive(),
    results_count: z.number().int().nonnegative(),
    filters_applied: z.array(z.string().min(1)),
  }),
);

export const AvailabilitySearchedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("availability_searched"),
    schema_version: z.literal("0.1.0"),
    payload: AvailabilitySearchedPayloadSchema,
  }),
);

export type AvailabilitySearchedPayload = z.infer<typeof AvailabilitySearchedPayloadSchema>;
export type AvailabilitySearchedEvent = z.infer<typeof AvailabilitySearchedSchema>;
