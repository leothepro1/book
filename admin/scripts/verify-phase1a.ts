/**
 * Phase 1A verification — Inngest setup, schemas, registry, emitter,
 * deterministic ULID, end-to-end emit→outbox round-trip.
 *
 *   $ ANALYTICS_PIPELINE_DEV_GUARD=1 tsx scripts/verify-phase1a.ts
 *
 * 22 checks total: 16 from spec §1A.6 + 6 ULID property assertions.
 * Cleans up its own test rows on the way out via the un-guarded
 * analytics-pipeline client (the "append-only" outbox invariant is for
 * production callers, not for verification scripts).
 */

// Force the dev-guard ON before any app module loads. tsx runs ESM, but
// Node sets process.env from the shell before any import runs, so an
// ANALYTICS_PIPELINE_DEV_GUARD already in the environment is honored.
// This line is a defensive default for direct `tsx scripts/verify-...`
// invocations that forgot to export it.
process.env.ANALYTICS_PIPELINE_DEV_GUARD =
  process.env.ANALYTICS_PIPELINE_DEV_GUARD ?? "1";

const TENANT_A = "cverify1a0000000000000000"; // 25 chars
const TENANT_B = "cverify1b0000000000000000"; // 25 chars
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

const VALID_BOOKING_PAYLOAD = {
  booking_id: "booking_verify",
  accommodation_id: "acc_verify",
  guest_id: "email_a3f7b2c1d4e5f6a7",
  check_in_date: "2026-06-01",
  check_out_date: "2026-06-04",
  number_of_nights: 3,
  number_of_guests: 2,
  total_amount: { amount: 12900, currency: "SEK" },
  source_channel: "direct" as const,
  pms_reference: null,
};

const VALID_PAYMENT_PAYLOAD = {
  payment_id: "pi_verify",
  booking_id: "booking_verify",
  amount: { amount: 12900, currency: "SEK" },
  provider: "stripe" as const,
  payment_instrument: "card" as const,
  provider_reference: "pi_3abc",
  captured_at: new Date(),
};

type CheckResult = { pass: boolean; reason: string };
const results: { name: string; result: CheckResult }[] = [];

function record(name: string, result: CheckResult) {
  results.push({ name, result });
  const mark = result.pass ? "✓" : "✗";
  // eslint-disable-next-line no-console
  console.log(`  ${mark} ${name}${result.reason ? "  — " + result.reason : ""}`);
}

async function check(name: string, fn: () => Promise<CheckResult>): Promise<void> {
  try {
    record(name, await fn());
  } catch (err) {
    record(name, {
      pass: false,
      reason:
        "threw: " + (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
  }
}

async function main() {
  // eslint-disable-next-line no-console
  console.log("Phase 1A verification — Inngest + emitter + outbox round-trip\n");

  const { prisma, _unguardedAnalyticsPipelineClient } = await import(
    "@/app/_lib/db/prisma"
  );
  const { withTenant } = await import("@/app/_lib/analytics/pipeline/tenant");
  const {
    emitAnalyticsEvent,
    signalAnalyticsFlush,
  } = await import("@/app/_lib/analytics/pipeline/emitter");
  const {
    AnalyticsTransactionRequiredError,
    AnalyticsValidationError,
  } = await import("@/app/_lib/analytics/pipeline/errors");
  const {
    ANALYTICS_EVENT_REGISTRY,
    AnalyticsSchemaNotRegisteredError,
    AnalyticsSchemaVersionMissingError,
    getEventSchema,
  } = await import("@/app/_lib/analytics/pipeline/schemas/registry");
  const { BookingCompletedSchema } = await import(
    "@/app/_lib/analytics/pipeline/schemas/booking-completed"
  );
  const { PaymentSucceededSchema } = await import(
    "@/app/_lib/analytics/pipeline/schemas/payment-succeeded"
  );
  const { deterministicULIDFromKey, randomULID } = await import(
    "@/app/_lib/analytics/pipeline/ulid"
  );
  const { inngest } = await import("@/inngest/client");

  // Cleanup helper — delete every outbox row left by previous runs of
  // this script before starting. Idempotent.
  async function cleanup() {
    await prisma.$executeRawUnsafe(
      `DELETE FROM analytics.outbox WHERE tenant_id IN ('${TENANT_A}', '${TENANT_B}')`,
    );
  }
  await cleanup();

  // ── 1. Inngest client constructable ─────────────────────────────────────
  await check("Inngest client constructable (no env vars required)", async () => {
    const ok = inngest && typeof inngest.send === "function";
    return { pass: ok, reason: ok ? "" : "inngest client missing or send() not present" };
  });

  // ── 2. /api/inngest route handler exports GET/POST/PUT ──────────────────
  await check("/api/inngest route exports GET, POST, PUT", async () => {
    const route = await import("@/app/api/inngest/route");
    const ok =
      typeof route.GET === "function" &&
      typeof route.POST === "function" &&
      typeof route.PUT === "function";
    return { pass: ok, reason: ok ? "" : "missing one or more of GET/POST/PUT" };
  });

  // ── 3. Schema registry has both events at v0.1.0 ────────────────────────
  await check("registry contains booking_completed + payment_succeeded at v0.1.0", async () => {
    const ok =
      ANALYTICS_EVENT_REGISTRY.booking_completed["0.1.0"] !== undefined &&
      ANALYTICS_EVENT_REGISTRY.payment_succeeded["0.1.0"] !== undefined;
    return { pass: ok, reason: ok ? "" : "registry missing one or both v0.1.0 schemas" };
  });

  // ── 4. getEventSchema(booking_completed, 0.1.0) returns a schema ────────
  await check("getEventSchema(booking_completed, 0.1.0) returns a schema", async () => {
    const s = getEventSchema("booking_completed", "0.1.0");
    return { pass: !!s, reason: s ? "" : "got null/undefined" };
  });

  // ── 5. unknown version throws AnalyticsSchemaVersionMissingError ────────
  await check("getEventSchema(booking_completed, 99.0.0) throws version-missing", async () => {
    try {
      getEventSchema("booking_completed", "99.0.0");
      return { pass: false, reason: "did not throw" };
    } catch (err) {
      const ok = err instanceof AnalyticsSchemaVersionMissingError;
      return { pass: ok, reason: ok ? "" : `wrong error: ${(err as Error).constructor.name}` };
    }
  });

  // ── 6. unknown event_name throws AnalyticsSchemaNotRegisteredError ──────
  await check("getEventSchema(unknown_event, 0.1.0) throws not-registered", async () => {
    try {
      getEventSchema("unknown_event", "0.1.0");
      return { pass: false, reason: "did not throw" };
    } catch (err) {
      const ok = err instanceof AnalyticsSchemaNotRegisteredError;
      return { pass: ok, reason: ok ? "" : `wrong error: ${(err as Error).constructor.name}` };
    }
  });

  // ── 7. BookingCompletedSchema rejects missing booking_id ────────────────
  await check("BookingCompletedSchema rejects missing booking_id", async () => {
    const r = BookingCompletedSchema.safeParse({
      event_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      tenant_id: TENANT_A,
      event_name: "booking_completed",
      schema_version: "0.1.0",
      occurred_at: new Date(),
      actor_type: "system" as const,
      actor_id: null,
      payload: { ...VALID_BOOKING_PAYLOAD, booking_id: undefined },
    });
    return { pass: !r.success, reason: r.success ? "accepted invalid payload" : "" };
  });

  // ── 8. BookingCompletedSchema rejects non-ISO check_in_date ─────────────
  await check("BookingCompletedSchema rejects non-ISO check_in_date", async () => {
    const r = BookingCompletedSchema.safeParse({
      event_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      tenant_id: TENANT_A,
      event_name: "booking_completed",
      schema_version: "0.1.0",
      occurred_at: new Date(),
      actor_type: "system" as const,
      actor_id: null,
      payload: { ...VALID_BOOKING_PAYLOAD, check_in_date: "2026/06/01" },
    });
    return { pass: !r.success, reason: r.success ? "accepted bad date format" : "" };
  });

  // ── 9. BookingCompletedSchema accepts a valid event ─────────────────────
  await check("BookingCompletedSchema accepts a valid event", async () => {
    const r = BookingCompletedSchema.safeParse({
      event_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      tenant_id: TENANT_A,
      event_name: "booking_completed",
      schema_version: "0.1.0",
      occurred_at: new Date(),
      actor_type: "guest" as const,
      actor_id: "guest-1",
      payload: VALID_BOOKING_PAYLOAD,
    });
    return { pass: r.success, reason: r.success ? "" : `parse error` };
  });

  // ── 10. PaymentSucceededSchema accepts a valid event ────────────────────
  await check("PaymentSucceededSchema accepts a valid event", async () => {
    const r = PaymentSucceededSchema.safeParse({
      event_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      tenant_id: TENANT_A,
      event_name: "payment_succeeded",
      schema_version: "0.1.0",
      occurred_at: new Date(),
      actor_type: "system" as const,
      actor_id: null,
      payload: VALID_PAYMENT_PAYLOAD,
    });
    return { pass: r.success, reason: r.success ? "" : `parse error` };
  });

  // ── 11. emit inside $transaction → row appears with correct shape ──────
  let emittedEventId = "";
  let emittedOutboxId = "";
  await check("emitAnalyticsEvent inside $transaction → outbox row with correct shape", async () => {
    const out = await prisma.$transaction(async (tx) => {
      return await emitAnalyticsEvent(tx, {
        tenantId: TENANT_A,
        eventName: "booking_completed",
        schemaVersion: "0.1.0",
        occurredAt: new Date(),
        actor: { actor_type: "guest", actor_id: "guest-1" },
        payload: VALID_BOOKING_PAYLOAD,
      });
    });
    emittedEventId = out.event_id;
    emittedOutboxId = out.outbox_id;

    if (!ULID_REGEX.test(out.event_id)) {
      return { pass: false, reason: `bad event_id ULID: ${out.event_id}` };
    }
    const rows = await prisma.$queryRaw<
      { tenant_id: string; event_id: string; event_name: string; schema_version: string; actor_type: string; actor_id: string | null }[]
    >`
      SELECT tenant_id, event_id, event_name, schema_version, actor_type, actor_id
      FROM analytics.outbox WHERE id = ${out.outbox_id}
    `;
    if (rows.length !== 1) {
      return { pass: false, reason: `expected 1 row, found ${rows.length}` };
    }
    const r = rows[0];
    const ok =
      r.tenant_id === TENANT_A &&
      r.event_id === out.event_id &&
      r.event_name === "booking_completed" &&
      r.schema_version === "0.1.0" &&
      r.actor_type === "guest" &&
      r.actor_id === "guest-1";
    return { pass: ok, reason: ok ? "tenant_id, event_id, event_name, schema_version, actor_type, actor_id all correct" : `mismatch: ${JSON.stringify(r)}` };
  });

  // ── 12. idempotencyKey twice → same event_id, single row ────────────────
  await check("emit with same idempotencyKey twice → same event_id, single outbox row", async () => {
    const idemKey = "phase1a-idempotency-test";
    const result1 = await prisma.$transaction(async (tx) =>
      emitAnalyticsEvent(tx, {
        tenantId: TENANT_A,
        eventName: "booking_completed",
        schemaVersion: "0.1.0",
        occurredAt: new Date(),
        actor: { actor_type: "system", actor_id: null },
        payload: { ...VALID_BOOKING_PAYLOAD, booking_id: "booking_idem" },
        idempotencyKey: idemKey,
      }),
    );
    const result2 = await prisma.$transaction(async (tx) =>
      emitAnalyticsEvent(tx, {
        tenantId: TENANT_A,
        eventName: "booking_completed",
        schemaVersion: "0.1.0",
        occurredAt: new Date(),
        actor: { actor_type: "system", actor_id: null },
        payload: { ...VALID_BOOKING_PAYLOAD, booking_id: "booking_idem" },
        idempotencyKey: idemKey,
      }),
    );

    if (result1.event_id !== result2.event_id) {
      return { pass: false, reason: `event_id differs: ${result1.event_id} vs ${result2.event_id}` };
    }
    const count = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c FROM analytics.outbox
      WHERE tenant_id = ${TENANT_A} AND event_id = ${result1.event_id}
    `;
    const rowCount = Number(count[0]?.c ?? 0n);
    return {
      pass: rowCount === 1,
      reason: rowCount === 1 ? "single outbox row, same event_id on both calls" : `expected 1 row, found ${rowCount}`,
    };
  });

  // ── 13. invalid payload → AnalyticsValidationError, no outbox row ───────
  await check("emit with invalid payload throws ValidationError before insert", async () => {
    let thrown: unknown;
    try {
      await prisma.$transaction(async (tx) =>
        emitAnalyticsEvent(tx, {
          tenantId: TENANT_A,
          eventName: "booking_completed",
          schemaVersion: "0.1.0",
          occurredAt: new Date(),
          actor: { actor_type: "system", actor_id: null },
          payload: { ...VALID_BOOKING_PAYLOAD, booking_id: "" }, // empty → invalid
          idempotencyKey: "phase1a-validation-test",
        }),
      );
    } catch (err) {
      thrown = err;
    }
    if (!(thrown instanceof AnalyticsValidationError)) {
      return { pass: false, reason: `wrong error: ${thrown ? (thrown as Error).constructor.name : "(none)"}` };
    }
    // Verify no row landed under the deterministic event_id.
    const expectedEventId = deterministicULIDFromKey(
      `${TENANT_A}:booking_completed:phase1a-validation-test`,
    );
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM analytics.outbox
      WHERE tenant_id = ${TENANT_A} AND event_id = ${expectedEventId}
    `;
    return {
      pass: rows.length === 0,
      reason: rows.length === 0 ? "ValidationError thrown; no row leaked to outbox" : `outbox leaked ${rows.length} row(s) on validation failure`,
    };
  });

  // ── 14. unknown event_name → SchemaNotRegisteredError before payload validation
  await check("emit with unknown event_name throws SchemaNotRegisteredError", async () => {
    let thrown: unknown;
    try {
      await prisma.$transaction(async (tx) =>
        emitAnalyticsEvent(tx, {
          // Cast: we deliberately pass a non-registered event name to
          // verify the registry-not-registered path runs before payload
          // validation.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tenantId: TENANT_A,
          eventName: "made_up_event" as any,
          schemaVersion: "0.1.0",
          occurredAt: new Date(),
          actor: { actor_type: "system", actor_id: null },
          payload: VALID_BOOKING_PAYLOAD,
        }),
      );
    } catch (err) {
      thrown = err;
    }
    const ok = thrown instanceof AnalyticsSchemaNotRegisteredError;
    return { pass: ok, reason: ok ? "registry-not-registered short-circuited before payload validation" : `wrong error: ${thrown ? (thrown as Error).constructor.name : "(none)"}` };
  });

  // ── 15. signalAnalyticsFlush survives Inngest unreachable ───────────────
  await check("signalAnalyticsFlush survives Inngest unreachable (does not throw)", async () => {
    const original = inngest.send;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (inngest as any).send = async () => {
      throw new Error("simulated Inngest unreachable");
    };
    try {
      await signalAnalyticsFlush(TENANT_A, 5);
      return { pass: true, reason: "signalAnalyticsFlush returned silently on send failure" };
    } catch (err) {
      return { pass: false, reason: `threw: ${(err as Error).message}` };
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (inngest as any).send = original;
    }
  });

  // ── 16. tenant isolation: row visible to A, invisible to B ──────────────
  await check("tenant isolation: outbox row visible only to its tenant via withTenant", async () => {
    if (!emittedEventId) {
      return { pass: false, reason: "no emittedEventId from check 11 — earlier check failed" };
    }
    const visibleToA = await withTenant(TENANT_A, async (db) =>
      db.analyticsPipelineOutbox.findMany({
        where: { eventId: emittedEventId },
        select: { id: true },
      }),
    );
    const visibleToB = await withTenant(TENANT_B, async (db) =>
      db.analyticsPipelineOutbox.findMany({
        where: { eventId: emittedEventId },
        select: { id: true },
      }),
    );
    const ok = visibleToA.length === 1 && visibleToB.length === 0;
    return { pass: ok, reason: ok ? `visible_to_A=${visibleToA.length}, visible_to_B=${visibleToB.length}` : `isolation broken: A=${visibleToA.length} B=${visibleToB.length}` };
  });

  // ── 17-22. ULID property assertions ─────────────────────────────────────

  await check("ULID determinism: same seed → same ULID across 10 iterations", async () => {
    const seed = `${TENANT_A}:booking_completed:idem-1`;
    const first = deterministicULIDFromKey(seed);
    for (let i = 0; i < 10; i++) {
      if (deterministicULIDFromKey(seed) !== first) {
        return { pass: false, reason: `iteration ${i} drifted` };
      }
    }
    return { pass: true, reason: `${first}` };
  });

  await check("ULID uniqueness: 1000 distinct idempotency keys → 1000 distinct ULIDs", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      seen.add(deterministicULIDFromKey(`${TENANT_A}:booking_completed:key-${i}`));
    }
    return { pass: seen.size === 1000, reason: seen.size === 1000 ? "no collisions" : `${1000 - seen.size} collisions` };
  });

  await check("ULID cross-tenant isolation: same key, different tenant → different ULID", async () => {
    const a = deterministicULIDFromKey(`${TENANT_A}:booking_completed:idem-x`);
    const b = deterministicULIDFromKey(`${TENANT_B}:booking_completed:idem-x`);
    return { pass: a !== b, reason: a !== b ? "" : "same ULID across tenants" };
  });

  await check("ULID cross-event isolation: same key, different event_name → different ULID", async () => {
    const a = deterministicULIDFromKey(`${TENANT_A}:booking_completed:idem-y`);
    const b = deterministicULIDFromKey(`${TENANT_A}:payment_succeeded:idem-y`);
    return { pass: a !== b, reason: a !== b ? "" : "same ULID across event names" };
  });

  await check("ULID format: deterministic + random both match BaseEventSchema's ULID regex", async () => {
    const det = deterministicULIDFromKey("any-seed");
    const rnd = randomULID();
    const ok = ULID_REGEX.test(det) && ULID_REGEX.test(rnd);
    return { pass: ok, reason: ok ? "" : `det=${det} rnd=${rnd}` };
  });

  await check("ULID randomness: 1000 random ULIDs are unique", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(randomULID());
    return { pass: seen.size === 1000, reason: seen.size === 1000 ? "no collisions" : `${1000 - seen.size} collisions` };
  });

  // ── Cleanup test rows ───────────────────────────────────────────────────
  // Use the un-guarded client so the dev guard doesn't fire on raw
  // SQL... actually $executeRaw is client-level (not model-level) and
  // bypasses the model extension regardless. Either client works; we
  // use the un-guarded one to mirror the convention from verify-phase0.
  await _unguardedAnalyticsPipelineClient.$executeRawUnsafe(
    `DELETE FROM analytics.outbox WHERE tenant_id IN ('${TENANT_A}', '${TENANT_B}')`,
  );
  void emittedOutboxId; // silence unused-warning if check 11 short-circuited

  // ── Summary ─────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.result.pass).length;
  const total = results.length;
  // eslint-disable-next-line no-console
  console.log(
    `\nPhase 1A: ${passed}/${total} passed${passed === total ? "" : " — " + (total - passed) + " FAILED"}`,
  );

  await prisma.$disconnect();
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("verify-phase1a crashed:", err);
  process.exit(1);
});
