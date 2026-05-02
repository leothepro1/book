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
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Global conventions referenced by every concrete event schema
 * ──────────────────────────────────────────────────────────────────────────
 *
 * The conventions below apply to every event in the analytics pipeline,
 * server-emitted and storefront-emitted alike. Per-event schemas reference
 * these conventions by name rather than re-stating them.
 *
 * Monetary amounts. Every `amount` field across the pipeline is an integer
 *   in MINOR UNITS of the named currency — ören for SEK, cents for EUR,
 *   etc. Floats are never used for money. Per-event schemas constrain
 *   `amount` with `z.number().int().nonnegative()`; the unit is the
 *   convention named here.
 *
 * Currency. Every `currency` field is an ISO 4217 three-letter code in
 *   UPPERCASE ("SEK", "EUR", "NOK", "DKK"). Constrained per-event with
 *   `z.string().length(3)`; the casing is convention named here.
 *
 * `event_id` uniqueness scope. Uniqueness is per `(tenant_id, event_id)`,
 *   enforced by the analytics outbox UNIQUE constraint. Same `event_id` may
 *   coexist across tenants and across event types within a tenant. Cross-
 *   event uniqueness within a tenant is NOT required and downstream
 *   readers MUST NOT assume it.
 *
 * `tenant_id` format. Cuid as produced by Prisma's `@default(cuid())`,
 *   matching `Tenant.id`. Constrained as `z.string().min(1)`; format is
 *   convention named here.
 *
 * `occurred_at` clock source. Browser clock for storefront-emitted events,
 *   server clock for server-emitted events. Each event's docstring names
 *   which side observes the timestamp. Phase 5 readers should treat
 *   storefront timestamps as untrusted within reasonable clock-skew bounds.
 *   Server-side enforcement of skew limits (rejection of stale or future-
 *   dated events) is the dispatch endpoint's responsibility — see
 *   `app/api/analytics/collect/route.ts` and is tracked by a separate
 *   Dispatch hardening PR. The base schema does NOT enforce a skew bound.
 *
 * `correlation_id` semantics. Nullable (default null). When set, must be a
 *   ULID (same character set as `event_id`). Set by the emit-site when an
 *   event is part of a logical user-action chain that produces a downstream
 *   event of a different type — for example, a storefront-emitted
 *   `checkout_started` correlates with a server-emitted `payment_succeeded`
 *   via a session-level identifier the emit-site passes through to the
 *   server. When no such relation exists, leave null. The base schema
 *   does NOT enforce ULID format on `correlation_id` (the field accepts
 *   any string for forward compatibility); per-event docstrings name the
 *   format expected at each emit-site.
 *
 * `actor_type` for storefront-emitted events. Always "anonymous" with
 *   `actor_id: null`. Storefront pixels do not have authenticated guest
 *   context — guest authentication happens at checkout entry, after most
 *   storefront events have already fired. Server-emitted events use
 *   "guest", "merchant", or "system" per their own docstrings.
 *
 * Schema versioning. Pre-stable while the pipeline is pre-Apelviken-go-live
 *   (every event starts at v0.1.0). Post-go-live, version bumps follow
 *   semver: PATCH for additive optional fields, MINOR for additive required
 *   fields with a default, MAJOR for anything that could break a downstream
 *   consumer (renames, removals, required-field additions without default,
 *   semantic redefinition of an existing field). Multiple versions of the
 *   same event MAY be live simultaneously during migration windows — the
 *   registry maps `(event_name, schema_version)` → schema, and both gates
 *   (emitter + drainer) look up by the pair.
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
