/**
 * Base event schema for every analytics-pipeline event.
 *
 * Every concrete event in Phase 2 (BookingCompletedSchema, OrderPaidSchema,
 * …) extends this base. The base captures the envelope — the fields every
 * event must carry regardless of domain — and leaves `payload` loosely typed
 * for concrete schemas to refine.
 *
 * `received_at` is intentionally absent. It's server-assigned at ingest and
 * lives only on the wire / in the database; emitters never set it.
 *
 * Defense in depth: this schema enforces format at the application boundary;
 * the Postgres CHECK constraints in analytics.event enforce the same shape
 * at the row level. Either alone would catch the obvious bugs; both together
 * make malformed events hard to land even via a buggy emitter or a
 * direct-SQL admin patch.
 */

import { z } from "zod";

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

const ActorSchema = z.discriminatedUnion("actor_type", [
  z.object({
    actor_type: z.literal("guest"),
    actor_id: z.string().min(1),
  }),
  z.object({
    actor_type: z.literal("merchant"),
    actor_id: z.string().min(1),
  }),
  z.object({
    actor_type: z.literal("system"),
    actor_id: z.null(),
  }),
  z.object({
    actor_type: z.literal("anonymous"),
    actor_id: z.null(),
  }),
]);

export const BaseEventSchema = z
  .object({
    event_id: z.string().regex(ULID_REGEX, "event_id must be a valid ULID"),
    tenant_id: z.string().min(1, "tenant_id is required"),
    event_name: z.string().min(1, "event_name is required"),
    schema_version: z
      .string()
      .regex(SEMVER_REGEX, "schema_version must be semver MAJOR.MINOR.PATCH"),
    occurred_at: z.coerce.date(),
    correlation_id: z.string().nullable().optional(),
    payload: z.record(z.string(), z.unknown()),
    context: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .and(ActorSchema);

export type BaseEvent = z.infer<typeof BaseEventSchema>;
