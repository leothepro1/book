/**
 * accommodation_viewed v0.1.0 (storefront)
 * ────────────────────────────────────────
 *
 * Fires when a guest opens an accommodation detail page (the
 * room/cabin/spot drill-down view). Phase 5 uses this for popularity
 * rankings, conversion-from-view aggregations, and inventory-demand
 * heat maps.
 *
 * Triggered by: the analytics worker (Phase 3 PR-B) on URL match for
 * `/stay/[accommodationId]` (or whatever route shape the storefront
 * lands on).
 *
 * Consent category: `analytics`.
 *
 * Operational ↔ analytics field mapping:
 *   accommodation_id    ← Accommodation.id (read from URL)
 *   accommodation_type  ← read from a server-injected data attribute
 *                         on the page; the worker doesn't fetch DB
 *                         from inside the worker
 *   storefront_context  ← shared
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";
import { StorefrontContextSchema } from "./_storefront-context";

export const AccommodationViewedPayloadSchema = StorefrontContextSchema.and(
  z.object({
    accommodation_id: z.string().min(1),
    accommodation_type: z.enum(["hotel", "cabin", "camping", "apartment", "pitch"]),
  }),
);

export const AccommodationViewedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("accommodation_viewed"),
    schema_version: z.literal("0.1.0"),
    payload: AccommodationViewedPayloadSchema,
  }),
);

export type AccommodationViewedPayload = z.infer<typeof AccommodationViewedPayloadSchema>;
export type AccommodationViewedEvent = z.infer<typeof AccommodationViewedSchema>;
