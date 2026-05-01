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
 * portal's search-form submission events.
 *
 * Consent category: `analytics`.
 *
 * Operational ↔ analytics field mapping:
 *   check_in_date       ← form input, formatted YYYY-MM-DD
 *   check_out_date      ← form input
 *   number_of_guests    ← form input
 *   results_count       ← from the storefront's search response
 *                         (server-rendered or via API)
 *   filters_applied     ← list of filter ids the guest applied
 *                         (e.g. "wifi", "pet-friendly"). Empty array
 *                         when no filters.
 *   storefront_context  ← shared
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
