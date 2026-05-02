/**
 * accommodation_viewed v0.1.0 (storefront)
 * ────────────────────────────────────────
 *
 * Fires when a guest opens an accommodation detail page (the
 * room/cabin/spot drill-down view). Phase 5 uses this for popularity
 * rankings, conversion-from-view aggregations, and inventory-demand
 * heat maps.
 *
 * Triggered by: the analytics worker (Phase 3 PR-B) on the storefront's
 * accommodation detail route (`/stays/[slug]`). Emit fires once per
 * page mount inside the client component for that route.
 *
 * Consent category: `analytics`.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Semantic Contract
 * ──────────────────────────────────────────────────────────────────────
 *
 * `accommodation_id`. The `Accommodation.id` value (cuid) — NOT the URL
 *   slug, NOT the `externalId`. The URL on `/stays/[slug]` carries the
 *   slug; emit-sites MUST resolve slug → cuid via server-side data
 *   plumbed into the client component as React props (the page's
 *   server component fetches the row, passes the cuid down). The
 *   worker CANNOT do this lookup itself — it has no database access
 *   from inside the worker bundle.
 *
 *   Rationale: only `Accommodation.id` is immutable for the
 *   accommodation's lifetime. `slug` is mutable by admin (rename
 *   operation), `externalId` rotates on PMS reseat. Phase 5 joins
 *   against this field expect immutability — a join key that drifts
 *   silently corrupts trend analysis.
 *
 * `accommodation_type`. Lowercase enum:
 *
 *     "hotel" | "cabin" | "camping" | "apartment" | "pitch"
 *
 *   Prisma's `AccommodationType` enum is UPPERCASE
 *   (`HOTEL` | `CABIN` | `CAMPING` | `APARTMENT` | `PITCH`); emit-sites
 *   MUST lowercase before emit. The canonical mapper is exported from
 *   `app/_lib/analytics/pipeline/storefront-mappers.ts`:
 *
 *       accommodationTypeToSchema(t: AccommodationType):
 *         "hotel" | "cabin" | "camping" | "apartment" | "pitch"
 *
 *   Two emit-sites that both go through the mapper produce identical
 *   values; emit-sites that hand-roll a `.toLowerCase()` are
 *   structurally OK but strongly discouraged — adding a new
 *   `AccommodationType` enum value would silently broaden the schema's
 *   accepted set if the bridge is hand-rolled.
 *
 * `storefront_context`. Shared StorefrontContextSchema fields. See
 *   `_storefront-context.ts` for the contract on each.
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
