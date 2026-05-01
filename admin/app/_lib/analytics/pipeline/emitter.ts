/**
 * Transactional outbox emitter for the analytics pipeline.
 *
 * `emitAnalyticsEvent(tx, params)` writes an event to `analytics.outbox`
 * in the caller's Prisma transaction. Operational commit and outbox-row
 * persistence happen as one atomic unit: if the operational tx rolls
 * back, the outbox row never lands; if it commits, the row is durable
 * and the drainer (Phase 1B) will deliver it.
 *
 * After the operational transaction commits, the caller should call
 * `signalAnalyticsFlush(tenantId)` once to wake the drainer. That signal
 * is fire-and-forget — if Inngest is unreachable, the cron fallback
 * (Phase 1B) picks the row up within ~60 seconds.
 *
 * Idempotency. When `idempotencyKey` is provided, the event_id is a
 * deterministic ULID derived from `${tenantId}:${eventName}:${idempotencyKey}`.
 * Re-emit with the same key produces the same event_id; the outbox
 * UNIQUE (tenant_id, event_id) constraint dedupes via ON CONFLICT DO
 * NOTHING. The function returns the canonical (event_id, outbox_id) in
 * both the insert and the conflict path so callers can't tell the
 * difference. When `idempotencyKey` is omitted, a random ULID is
 * generated and the caller is responsible for not double-emitting.
 *
 * Validation. The payload is validated against the registered Zod schema
 * for (eventName, schemaVersion) BEFORE the SQL insert. Validation failure
 * throws AnalyticsValidationError and the operational tx is the caller's
 * responsibility to roll back. Unknown event_name throws
 * AnalyticsSchemaNotRegisteredError before payload validation runs (so
 * the error message names the right typo).
 *
 * Phase 1A scope: the emitter API exists and is verified end-to-end via
 * tests + verify-phase1a.ts. Real operational call sites (booking
 * confirmation, payment side-effects) are wired up in Phase 1B once the
 * drainer proves the pipeline works.
 */

import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { _unguardedAnalyticsPipelineClient } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { inngest } from "@/inngest/client";

import {
  AnalyticsEmitError,
  AnalyticsTransactionRequiredError,
  AnalyticsValidationError,
} from "./errors";
import { analyticsBreadcrumb, analyticsSpan } from "./observability";
import {
  type RegisteredEventName,
  getEventSchema,
} from "./schemas/registry";
import { deterministicULIDFromKey, randomULID } from "./ulid";

// ── Types ────────────────────────────────────────────────────────────────

type Actor =
  | { actor_type: "guest"; actor_id: string }
  | { actor_type: "merchant"; actor_id: string }
  | { actor_type: "system"; actor_id: null }
  | { actor_type: "anonymous"; actor_id: null };

export interface EmitAnalyticsEventParams<TEventName extends RegisteredEventName> {
  tenantId: string;
  eventName: TEventName;
  schemaVersion: string;
  occurredAt: Date;
  actor: Actor;
  payload: unknown;
  context?: Record<string, unknown>;
  correlationId?: string | null;
  idempotencyKey?: string;
  /**
   * Caller-supplied ULID to use as the outbox row's `event_id`. Takes
   * precedence over `idempotencyKey` derivation. Used by the Phase 3
   * dispatch endpoint (`/api/analytics/collect`), which receives an
   * already-ULID'd event from the worker and wants that exact id to
   * land on the analytics.event row — so the worker's
   * sessionStorage-tracked id matches the warehouse id 1:1.
   *
   * Must be a valid 26-char Crockford Base32 ULID (validated at the
   * dispatch endpoint, not re-validated here — one boundary check is
   * enough). When this is set, `idempotencyKey` is ignored.
   */
  eventId?: string;
}

export interface EmitAnalyticsEventResult {
  event_id: string;
  outbox_id: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function isTransactionClient(tx: unknown): tx is Prisma.TransactionClient {
  // The full PrismaClient has $transaction; the tx client returned to the
  // $transaction callback does NOT. This is the supported way to runtime-
  // distinguish them.
  if (!tx || typeof tx !== "object") return false;
  const obj = tx as Record<string, unknown>;
  if (typeof obj.$executeRaw !== "function") return false;
  if (typeof obj.$transaction === "function") return false;
  return true;
}

/**
 * SHA-256 of the seed, formatted as a hex string. Used internally for
 * the deterministic event_id seed; exported in case future emitter call
 * sites want to canonicalize an idempotency key the same way.
 */
function _sha256Hex(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}
export const _emitInternals = { sha256Hex: _sha256Hex };

// ── emit ─────────────────────────────────────────────────────────────────

export async function emitAnalyticsEvent<TEventName extends RegisteredEventName>(
  tx: Prisma.TransactionClient,
  params: EmitAnalyticsEventParams<TEventName>,
): Promise<EmitAnalyticsEventResult> {
  if (!isTransactionClient(tx)) {
    throw new AnalyticsTransactionRequiredError();
  }

  const {
    tenantId,
    eventName,
    schemaVersion,
    occurredAt,
    actor,
    payload,
    context,
    correlationId,
    idempotencyKey,
    eventId: explicitEventId,
  } = params;

  // 1. Compute event_id. Precedence:
  //      a) explicit `eventId` (Phase 3 dispatch endpoint passes the
  //         worker's ULID through so the warehouse row's id matches
  //         the worker's sessionStorage record exactly);
  //      b) deterministic from `${tenantId}:${eventName}:${idempotencyKey}`
  //         when an idempotency key is given (server-side mutation
  //         retry collapses to the existing outbox row);
  //      c) random otherwise.
  //    Tenant + event_name are part of (b)'s seed so the same key
  //    across different tenants / events never collides.
  const eventId = explicitEventId
    ? explicitEventId
    : idempotencyKey
      ? deterministicULIDFromKey(`${tenantId}:${eventName}:${idempotencyKey}`)
      : randomULID();

  // 2. Look up the registered schema. Throws if event_name unknown
  //    (AnalyticsSchemaNotRegisteredError) — short-circuits before payload
  //    validation so the error message names the right typo.
  const schema = getEventSchema(eventName, schemaVersion);

  // 3. Build the candidate event and validate against the registered schema.
  //    Validation matches the same shape the drainer (Phase 1B) will
  //    re-validate before writing to analytics.event — registry is the
  //    single source of truth across both gates.
  const candidate = {
    event_id: eventId,
    tenant_id: tenantId,
    event_name: eventName,
    schema_version: schemaVersion,
    occurred_at: occurredAt,
    correlation_id: correlationId ?? null,
    payload,
    context: context ?? null,
    actor_type: actor.actor_type,
    actor_id: actor.actor_id,
  };

  await analyticsSpan(
    "emit.validate",
    {
      tenant_id: tenantId,
      pipeline_step: "emit.validate",
      event_name: eventName,
      schema_version: schemaVersion,
    },
    async () => {
      const result = schema.safeParse(candidate);
      if (!result.success) {
        throw new AnalyticsValidationError(result.error.issues);
      }
    },
  );

  // 4. Insert into analytics.outbox via raw SQL.

  /*
   * RAW SQL INSERT — INTENTIONAL DESIGN, NOT AN OVERSIGHT
   * ──────────────────────────────────────────────────────
   *
   * This insert goes through `tx.$executeRaw` instead of
   * `tx.analyticsPipelineOutbox.create({...})`. Three reasons, in order
   * of importance:
   *
   * 1. The Phase 0 dev guard (app/_lib/db/prisma.ts) attaches a
   *    `$allOperations` interceptor to all three analytics-pipeline
   *    models on the exported `prisma`. Prisma propagates extensions
   *    into transaction clients, so `tx.analyticsPipelineOutbox.create`
   *    inside an operational `prisma.$transaction(...)` would trigger
   *    the guard and throw. The guard is intentionally aggressive — its
   *    job is to catch ALL direct pipeline-model access without
   *    `withTenant`. We must not weaken it just to let the emitter
   *    through. Raw SQL goes through `tx.$executeRaw`, which is a
   *    client-level method, NOT a model method — the model extension
   *    cannot fire on it.
   *
   * 2. Raw SQL is the correct semantic level for this write. The
   *    emitter is a deliberate, documented breach of operational
   *    domain encapsulation: it writes from the operational schema's
   *    transaction into the `analytics` schema in the same atomic
   *    unit. Documenting that breach with explicit SQL is more honest
   *    than hiding it behind a Prisma model write that happens to
   *    cross schemas. Shopify's `after_commit` Kafka producer uses raw
   *    SQL / direct gateway calls for the same reason — not
   *    ActiveRecord.
   *
   * 3. The safety boundary is Zod, not Prisma. The schema validation
   *    immediately above (the `emit.validate` span) is the type guard
   *    for this insert. The payload that lands in SQL has already been
   *    matched against the registered schema. We don't lose safety by
   *    dropping Prisma's typed insert here — we move the safety
   *    boundary from compile-time Prisma types to runtime Zod schemas,
   *    which is the correct layer for an event system whose payloads
   *    are versioned independently of the database column types.
   *
   * The dev guard is intentionally LEFT ACTIVE for the analytics
   * pipeline models on the `prisma` export. The emitter is the ONE
   * legitimate cross-domain write path, and it is the only code path
   * that uses raw SQL for this purpose. Any other code that finds
   * itself wanting to do this is doing something wrong and should be
   * calling `emitAnalyticsEvent` (for writes) or `withTenant` (for
   * reads) instead.
   */

  const outboxRowId = randomULID();
  const payloadJson = JSON.stringify(payload);
  const contextJson = context !== undefined ? JSON.stringify(context) : null;

  await analyticsSpan(
    "emit.outbox_insert",
    {
      tenant_id: tenantId,
      pipeline_step: "emit.outbox_insert",
      event_name: eventName,
      schema_version: schemaVersion,
    },
    async () => {
      await tx.$executeRaw`
        INSERT INTO analytics.outbox (
          id, tenant_id, event_id, event_name, schema_version,
          payload, actor_type, actor_id, correlation_id, created_at
        ) VALUES (
          ${outboxRowId},
          ${tenantId},
          ${eventId},
          ${eventName},
          ${schemaVersion},
          ${payloadJson}::jsonb,
          ${actor.actor_type},
          ${actor.actor_id},
          ${correlationId ?? null},
          NOW()
        )
        ON CONFLICT (tenant_id, event_id) DO NOTHING
      `;
      // `context` lives on the future analytics.event row, not on the
      // outbox row. The drainer (Phase 1B) will copy it from the
      // outbox payload's caller-supplied envelope. (Outbox does not
      // currently have a context column — see prisma/schema.prisma.
      // The variable is kept here so the validate-step's `candidate`
      // is self-consistent; it'll be threaded through in 1B.)
      void contextJson;
    },
  );

  // 5. Look up the canonical row IDs. ON CONFLICT DO NOTHING returns 0
  //    affected rows on conflict — we can't tell from the executeRaw
  //    return value whether we inserted or collided. This SELECT returns
  //    the existing row's id either way, giving idempotent callers the
  //    same result on every emit with the same key.
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM analytics.outbox
    WHERE tenant_id = ${tenantId} AND event_id = ${eventId}
    LIMIT 1
  `;
  if (rows.length === 0) {
    // Should be impossible: we just inserted (or matched an existing).
    // If this fires, the outbox table or the partial unique index has
    // been tampered with — fail loud rather than silently returning a
    // bogus id.
    throw new AnalyticsEmitError(
      `outbox row vanished after upsert: tenant_id=${tenantId} event_id=${eventId}`,
    );
  }
  const canonicalOutboxId = rows[0].id;

  analyticsBreadcrumb("emit", "outbox_insert", {
    event_name: eventName,
    schema_version: schemaVersion,
    event_id: eventId,
    outbox_id: canonicalOutboxId,
    idempotent: idempotencyKey !== undefined,
    event_id_source: explicitEventId
      ? "explicit"
      : idempotencyKey
        ? "deterministic"
        : "random",
  });

  return { event_id: eventId, outbox_id: canonicalOutboxId };
}

// ── emit (standalone) ────────────────────────────────────────────────────

/**
 * Standalone variant of `emitAnalyticsEvent` for callers that don't have
 * an operational `tx` to attach to.
 *
 * ── When to use this vs the transactional variant ──────────────────────────
 *
 *   `emitAnalyticsEvent(tx, params)` — DEFAULT. Use whenever the
 *   operational mutation that triggered the analytics event is itself
 *   inside a `prisma.$transaction(async (tx) => …)`. The outbox row
 *   commits with the operational state — if the operational tx aborts,
 *   the outbox row never lands. This is what every transactional code
 *   path should use (booking creation in ingest.ts, future direct-
 *   booking creators, etc.).
 *
 *   `emitAnalyticsEventStandalone(params)` — EXCEPTION. Use ONLY when
 *   the caller's site has no operational tx. Concretely, today this
 *   means `processOrderPaidSideEffects` — a handler called by the
 *   Stripe webhook AFTER the order is already committed as PAID.
 *   There's no operational tx to attach to: the order's commit is
 *   long over, and the function exists specifically to orchestrate
 *   independently-idempotent side effects.
 *
 * ── Why we accept that the outbox write is not atomic with operational state
 *
 * In the transactional case, atomicity buys us: "if the operational
 * mutation rolls back, the analytics event is silently dropped". That
 * matters because we never want the data warehouse to see an event for
 * a mutation that didn't actually happen.
 *
 * In the standalone case, atomicity isn't recoverable — the operational
 * mutation has already committed before we got here. There's nothing to
 * roll back to. The standalone helper still opens a short tx (so the
 * outbox INSERT + the canonical-id SELECT are atomic with each other,
 * matching the transactional variant's semantics), but the broader
 * "atomic with operational state" guarantee is gone by construction.
 *
 * If the standalone emit fails, the operational mutation has still
 * happened — the only loss is one analytics event. That's acceptable
 * for after-the-fact handlers; it would not be acceptable for the
 * mutation itself.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────
 *
 * Prefer `emitAnalyticsEvent(tx, params)`. Reach for the standalone
 * variant only when the call site genuinely has no operational tx.
 * Two places in the codebase qualify today:
 *   - `processOrderPaidSideEffects` (Phase 1B integration, this PR)
 *   - The reconciliation cron's call to the same handler
 * Anything else should use the transactional variant.
 */
export async function emitAnalyticsEventStandalone<
  TEventName extends RegisteredEventName,
>(
  params: EmitAnalyticsEventParams<TEventName>,
): Promise<EmitAnalyticsEventResult> {
  return _unguardedAnalyticsPipelineClient.$transaction(async (tx) =>
    emitAnalyticsEvent(tx, params),
  );
}

// ── signal ───────────────────────────────────────────────────────────────

/**
 * Fire-and-forget signal to wake the analytics outbox drainer. Safe to
 * call after the operational transaction commits. Never throws — if
 * Inngest is unreachable, the cron fallback (Phase 1B) catches the row.
 */
export async function signalAnalyticsFlush(
  tenantId: string,
  hintCount?: number,
): Promise<void> {
  try {
    const data: { tenant_id: string; hint_count?: number } = { tenant_id: tenantId };
    if (hintCount !== undefined) data.hint_count = hintCount;
    await inngest.send({ name: "analytics.outbox.flush", data });
  } catch (err) {
    // Never throw — the cron fallback (Phase 1B) is the safety net for
    // lost signals. We DO log so operators can spot a sustained
    // unreachable Inngest as a separate signal-failed counter.
    log("warn", "analytics.signal_failed", {
      tenantId,
      hintCount: hintCount ?? null,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
