/**
 * accommodation_archived v0.1.0  (registered, emit deferred to Phase 4 CDC)
 * ────────────────────────────────────────────────────────────────────────
 *
 * An accommodation was archived — `status = ARCHIVED` (soft-delete).
 *
 * Same Q4 deferral as accommodation_published — multiple admin
 * write-paths make Phase 4 CDC the canonical capture point. Schema +
 * registry entry land in Phase 2; emit activates with CDC.
 *
 * Operational ↔ analytics field mapping (planned for Phase 4):
 *   accommodation_id    ← Accommodation.id
 *   accommodation_type  ← Accommodation.type
 *   display_name        ← localized name at archive time
 *   archived_at         ← timestamp of the status transition
 *   archived_by_actor_id ← if discoverable from CDC metadata; else null
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

export const AccommodationArchivedPayloadSchema = z.object({
  accommodation_id: z.string().min(1),
  accommodation_type: z.enum(["hotel", "cabin", "camping", "apartment", "pitch"]),
  display_name: z.string().min(1),
  archived_at: z.coerce.date(),
  archived_by_actor_id: z.string().min(1).nullable(),
});

export const AccommodationArchivedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("accommodation_archived"),
    schema_version: z.literal("0.1.0"),
    payload: AccommodationArchivedPayloadSchema,
  }),
);

export type AccommodationArchivedPayload = z.infer<typeof AccommodationArchivedPayloadSchema>;
export type AccommodationArchivedEvent = z.infer<typeof AccommodationArchivedSchema>;
