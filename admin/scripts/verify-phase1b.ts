/**
 * Phase 1B verification — full pipeline (emit → outbox → drainer →
 * analytics.event), retry, DLQ, replay, concurrency, integration.
 *
 *   $ ANALYTICS_PIPELINE_DEV_GUARD=1 INNGEST_DEV=1 \
 *       tsx scripts/verify-phase1b.ts
 *
 * PREREQUISITE: the Inngest dev server must be running on
 * http://localhost:8288. Without it, signalAnalyticsFlush silently no-ops
 * (the SDK has no Cloud key in dev) and the drainer never fires.
 *
 *   $ npx inngest-cli@latest dev      # in another terminal
 *
 * If the dev server isn't running, this script exits 2 with explicit
 * instructions rather than producing a misleading "tests timed out".
 *
 * 9 tests — happy path, cron fallback (via scan event, not the literal
 * 60s wait), idempotency, validation failure, DLQ threshold, DLQ
 * replay, same-tenant serialization smoke, cross-tenant parallelism
 * smoke, operational integration smoke.
 */

process.env.ANALYTICS_PIPELINE_DEV_GUARD =
  process.env.ANALYTICS_PIPELINE_DEV_GUARD ?? "1";
process.env.INNGEST_DEV = process.env.INNGEST_DEV ?? "1";

const TENANT_A = "cphase1b1a000000000000000"; // 25 chars
const TENANT_B = "cphase1b1b000000000000000";
const ALL_TEST_TENANTS = [TENANT_A, TENANT_B];
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

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

async function pollUntil(
  cond: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 250,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await cond()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function ensureInngestDevServerRunning(): Promise<void> {
  const url = "http://localhost:8288";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
    if (!res.ok && res.status !== 404) {
      // 200 or 404 are both fine — server is responding.
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "verify-phase1b: Inngest dev server is not reachable at http://localhost:8288.",
    );
    // eslint-disable-next-line no-console
    console.error(`  reason: ${err instanceof Error ? err.message : String(err)}`);
    // eslint-disable-next-line no-console
    console.error("\nStart it in another terminal:");
    // eslint-disable-next-line no-console
    console.error("  $ npx inngest-cli@latest dev\n");
    process.exit(2);
  }
}

async function main() {
  // eslint-disable-next-line no-console
  console.log("Phase 1B verification — emit → drainer → analytics.event\n");

  await ensureInngestDevServerRunning();

  const { _unguardedAnalyticsPipelineClient } = await import(
    "@/app/_lib/db/prisma"
  );
  const {
    emitAnalyticsEventStandalone,
    signalAnalyticsFlush,
  } = await import("@/app/_lib/analytics/pipeline/emitter");
  const { inngest } = await import("@/inngest/client");

  const db = _unguardedAnalyticsPipelineClient;

  async function cleanup() {
    for (const t of ALL_TEST_TENANTS) {
      await db.$executeRawUnsafe(
        `DELETE FROM analytics.outbox WHERE tenant_id = '${t}'`,
      );
      await db.$executeRawUnsafe(
        `DELETE FROM analytics.event WHERE tenant_id = '${t}'`,
      );
    }
  }

  await cleanup();

  const validBookingPayload = {
    booking_id: "booking_phase1b",
    accommodation_id: "acc_phase1b",
    guest_id: "email_a3f7b2c1d4e5f6a7",
    check_in_date: "2026-06-01",
    check_out_date: "2026-06-04",
    number_of_nights: 3,
    number_of_guests: 2,
    total_amount: { amount: 12900, currency: "SEK" },
    source_channel: "direct" as const,
    pms_reference: null,
  };

  const occurredAt = new Date("2026-04-30T12:00:00.000Z");

  // ── Test 1: happy path ────────────────────────────────────────────────
  await check("happy path: emit → signal → drainer writes analytics.event", async () => {
    const result = await emitAnalyticsEventStandalone({
      tenantId: TENANT_A,
      eventName: "booking_completed",
      schemaVersion: "0.1.0",
      occurredAt,
      actor: { actor_type: "guest", actor_id: "guest-1" },
      payload: { ...validBookingPayload, booking_id: "booking_t1" },
      idempotencyKey: "phase1b-test1",
    });
    if (!ULID_REGEX.test(result.event_id)) {
      return { pass: false, reason: `bad event_id: ${result.event_id}` };
    }
    await signalAnalyticsFlush(TENANT_A, 1);

    const drained = await pollUntil(async () => {
      const rows = await db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM analytics.event
        WHERE event_id = ${result.event_id}
      `;
      return Number(rows[0]?.count ?? 0n) === 1;
    }, 15_000);

    if (!drained) {
      return { pass: false, reason: "analytics.event row not seen within 15s" };
    }
    const outboxRows = await db.$queryRaw<{ published_at: Date | null }[]>`
      SELECT published_at FROM analytics.outbox WHERE event_id = ${result.event_id}
    `;
    const publishedOk = outboxRows[0]?.published_at !== null;
    return {
      pass: publishedOk,
      reason: publishedOk
        ? "analytics.event written and outbox.published_at set"
        : "outbox.published_at still NULL after drain",
    };
  });

  // ── Test 2: cron fallback (via scan event, not real cron wait) ───────
  await check("cron fallback: scan event finds pending outbox without flush", async () => {
    // Insert an outbox row via raw SQL — no emit, no signal.
    const { ulid } = await import("ulidx");
    const eventId = ulid();
    const outboxId = ulid();
    await db.$executeRaw`
      INSERT INTO analytics.outbox (id, tenant_id, event_id, event_name, schema_version, payload, actor_type, actor_id, correlation_id, created_at)
      VALUES (
        ${outboxId}, ${TENANT_A}, ${eventId}, 'booking_completed', '0.1.0',
        ${JSON.stringify({ ...validBookingPayload, booking_id: "booking_t2" })}::jsonb,
        'system', NULL, NULL, NOW()
      )
    `;

    // Trigger scan via the dual-trigger event (mimics what cron does).
    await inngest.send({ name: "analytics.outbox.scan", data: {} });

    const drained = await pollUntil(async () => {
      const rows = await db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM analytics.event
        WHERE event_id = ${eventId}
      `;
      return Number(rows[0]?.count ?? 0n) === 1;
    }, 15_000);

    return {
      pass: drained,
      reason: drained ? "scan event dispatched flush; row drained" : "row not drained within 15s",
    };
  });

  // ── Test 3: idempotency end-to-end ────────────────────────────────────
  await check("idempotency end-to-end: same key emits once outbox + once event", async () => {
    const idemKey = "phase1b-test3-idem";
    const a = await emitAnalyticsEventStandalone({
      tenantId: TENANT_A,
      eventName: "booking_completed",
      schemaVersion: "0.1.0",
      occurredAt,
      actor: { actor_type: "system", actor_id: null },
      payload: { ...validBookingPayload, booking_id: "booking_t3" },
      idempotencyKey: idemKey,
    });
    const b = await emitAnalyticsEventStandalone({
      tenantId: TENANT_A,
      eventName: "booking_completed",
      schemaVersion: "0.1.0",
      occurredAt,
      actor: { actor_type: "system", actor_id: null },
      payload: { ...validBookingPayload, booking_id: "booking_t3" },
      idempotencyKey: idemKey,
    });
    if (a.event_id !== b.event_id) {
      return { pass: false, reason: `event_id differs: ${a.event_id} vs ${b.event_id}` };
    }
    await signalAnalyticsFlush(TENANT_A);
    const drained = await pollUntil(async () => {
      const rows = await db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM analytics.event
        WHERE event_id = ${a.event_id}
      `;
      return Number(rows[0]?.count ?? 0n) === 1;
    }, 15_000);
    if (!drained) return { pass: false, reason: "event not seen within 15s" };

    const outboxCount = await db.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM analytics.outbox
      WHERE tenant_id = ${TENANT_A} AND event_id = ${a.event_id}
    `;
    const eventCount = await db.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM analytics.event
      WHERE event_id = ${a.event_id}
    `;
    const ok =
      Number(outboxCount[0]?.count ?? 0n) === 1 &&
      Number(eventCount[0]?.count ?? 0n) === 1;
    return {
      pass: ok,
      reason: ok
        ? "1 outbox row, 1 event row, same event_id on both emits"
        : `outbox=${outboxCount[0]?.count} event=${eventCount[0]?.count}`,
    };
  });

  // ── Test 4: validation failure → retry (no event row) ────────────────
  await check("validation failure → failed_count++, no event row", async () => {
    const { ulid } = await import("ulidx");
    const eventId = ulid();
    const outboxId = ulid();
    // Malformed payload (missing booking_id).
    await db.$executeRaw`
      INSERT INTO analytics.outbox (id, tenant_id, event_id, event_name, schema_version, payload, actor_type, actor_id, correlation_id, created_at, failed_count)
      VALUES (
        ${outboxId}, ${TENANT_A}, ${eventId}, 'booking_completed', '0.1.0',
        ${JSON.stringify({ accommodation_id: "x" })}::jsonb,
        'system', NULL, NULL, NOW(), 0
      )
    `;
    await signalAnalyticsFlush(TENANT_A);

    const incremented = await pollUntil(async () => {
      const rows = await db.$queryRaw<{ failed_count: number }[]>`
        SELECT failed_count FROM analytics.outbox WHERE id = ${outboxId}
      `;
      return (rows[0]?.failed_count ?? 0) >= 1;
    }, 10_000);
    if (!incremented) {
      return { pass: false, reason: "failed_count did not increment within 10s" };
    }
    const eventRows = await db.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM analytics.event WHERE event_id = ${eventId}
    `;
    const noEvent = Number(eventRows[0]?.count ?? 0n) === 0;
    return {
      pass: noEvent,
      reason: noEvent
        ? "failed_count incremented; analytics.event NOT inserted"
        : "leaked an event row despite validation failure",
    };
  });

  // ── Test 5: DLQ threshold ────────────────────────────────────────────
  let dlqOutboxId = "";
  let dlqEventId = "";
  await check("DLQ threshold: row at failed_count=5 + one more drain → DLQ marker", async () => {
    const { ulid } = await import("ulidx");
    dlqEventId = ulid();
    dlqOutboxId = ulid();
    await db.$executeRaw`
      INSERT INTO analytics.outbox (id, tenant_id, event_id, event_name, schema_version, payload, actor_type, actor_id, correlation_id, created_at, failed_count)
      VALUES (
        ${dlqOutboxId}, ${TENANT_A}, ${dlqEventId}, 'booking_completed', '0.1.0',
        ${JSON.stringify({ accommodation_id: "x" })}::jsonb,
        'system', NULL, NULL, NOW(), 5
      )
    `;
    await signalAnalyticsFlush(TENANT_A);

    const dlq = await pollUntil(async () => {
      const rows = await db.$queryRaw<
        { failed_count: number; last_error: string | null; published_at: Date | null }[]
      >`
        SELECT failed_count, last_error, published_at FROM analytics.outbox WHERE id = ${dlqOutboxId}
      `;
      const r = rows[0];
      return !!(r && r.failed_count >= 6 && r.last_error?.startsWith("[DLQ] ") && r.published_at !== null);
    }, 10_000);
    if (!dlq) {
      return { pass: false, reason: "row did not reach DLQ within 10s" };
    }
    const eventRows = await db.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM analytics.event WHERE event_id = ${dlqEventId}
    `;
    const noEvent = Number(eventRows[0]?.count ?? 0n) === 0;
    return {
      pass: noEvent,
      reason: noEvent
        ? "[DLQ] marker set; published_at filled; no analytics.event row"
        : "DLQ row still produced an analytics.event",
    };
  });

  // ── Test 6: DLQ replay ────────────────────────────────────────────────
  await check("DLQ replay: fix payload + reset row → drainer succeeds", async () => {
    if (!dlqOutboxId) {
      return { pass: false, reason: "Test 5 didn't produce a DLQ row" };
    }
    // Simulate a bug fix: replace the malformed payload with a valid one,
    // then reset the row exactly the way replay-dlq.ts does.
    await db.$executeRaw`
      UPDATE analytics.outbox
      SET payload = ${JSON.stringify({ ...validBookingPayload, booking_id: "booking_t6" })}::jsonb,
          failed_count = 0,
          last_error = NULL,
          published_at = NULL
      WHERE id = ${dlqOutboxId}
    `;
    await signalAnalyticsFlush(TENANT_A);

    const drained = await pollUntil(async () => {
      const rows = await db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM analytics.event WHERE event_id = ${dlqEventId}
      `;
      return Number(rows[0]?.count ?? 0n) === 1;
    }, 15_000);

    return {
      pass: drained,
      reason: drained ? "row drained after fix + reset" : "row still not drained 15s after replay",
    };
  });

  // ── Test 7: same-tenant serialization smoke (5 events drain) ─────────
  await check("same-tenant smoke: 5 simultaneous flush events all drain", async () => {
    const eventIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await emitAnalyticsEventStandalone({
        tenantId: TENANT_A,
        eventName: "booking_completed",
        schemaVersion: "0.1.0",
        occurredAt,
        actor: { actor_type: "system", actor_id: null },
        payload: { ...validBookingPayload, booking_id: `booking_t7_${i}` },
        idempotencyKey: `phase1b-test7-${i}`,
      });
      eventIds.push(r.event_id);
    }
    // Send 5 flush events in quick succession; concurrency cap means
    // they serialize per-tenant, but all 5 must eventually drain.
    await Promise.all(
      Array.from({ length: 5 }, () => signalAnalyticsFlush(TENANT_A)),
    );
    const drained = await pollUntil(async () => {
      const rows = await db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM analytics.event
        WHERE tenant_id = ${TENANT_A} AND event_id = ANY(${eventIds})
      `;
      return Number(rows[0]?.count ?? 0n) === 5;
    }, 30_000);
    return {
      pass: drained,
      reason: drained ? "all 5 events drained" : "not all 5 events drained within 30s",
    };
  });

  // ── Test 8: cross-tenant parallelism smoke (A + B both drain) ───────
  await check("cross-tenant smoke: tenant A + B drain in parallel", async () => {
    const aEvent = await emitAnalyticsEventStandalone({
      tenantId: TENANT_A,
      eventName: "booking_completed",
      schemaVersion: "0.1.0",
      occurredAt,
      actor: { actor_type: "system", actor_id: null },
      payload: { ...validBookingPayload, booking_id: "booking_t8a" },
      idempotencyKey: "phase1b-test8-a",
    });
    const bEvent = await emitAnalyticsEventStandalone({
      tenantId: TENANT_B,
      eventName: "booking_completed",
      schemaVersion: "0.1.0",
      occurredAt,
      actor: { actor_type: "system", actor_id: null },
      payload: { ...validBookingPayload, booking_id: "booking_t8b" },
      idempotencyKey: "phase1b-test8-b",
    });
    await Promise.all([
      signalAnalyticsFlush(TENANT_A),
      signalAnalyticsFlush(TENANT_B),
    ]);
    const both = await pollUntil(async () => {
      const aOk = await db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM analytics.event WHERE event_id = ${aEvent.event_id}
      `;
      const bOk = await db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM analytics.event WHERE event_id = ${bEvent.event_id}
      `;
      return (
        Number(aOk[0]?.count ?? 0n) === 1 && Number(bOk[0]?.count ?? 0n) === 1
      );
    }, 15_000);
    return {
      pass: both,
      reason: both ? "both tenants drained" : "at least one tenant not drained within 15s",
    };
  });

  // ── Test 9: operational integration smoke ────────────────────────────
  await check("operational integration smoke: process-paid-side-effects wires the pipeline emit", async () => {
    // We don't run a full booking creation here (would require seeding a
    // Tenant + Order + Booking with all required FKs). What we DO verify:
    //   1. processOrderPaidSideEffects imports without error.
    //   2. The integration helpers it depends on are reachable.
    //   3. The emitter functions it imports are present.
    // This is a smoke test for the integration wiring; the per-emit
    // semantics are covered by Tests 1-8 against synthetic outbox rows.
    const ppse = await import("@/app/_lib/orders/process-paid-side-effects");
    const integrations = await import(
      "@/app/_lib/analytics/pipeline/integrations"
    );
    const emitter = await import("@/app/_lib/analytics/pipeline/emitter");

    const ok =
      typeof ppse.processOrderPaidSideEffects === "function" &&
      typeof integrations.deriveActor === "function" &&
      typeof integrations.deriveProvider === "function" &&
      typeof integrations.deriveInstrument === "function" &&
      typeof integrations.deriveSourceChannel === "function" &&
      typeof integrations.deriveGuestId === "function" &&
      typeof emitter.emitAnalyticsEventStandalone === "function" &&
      typeof emitter.signalAnalyticsFlush === "function";
    return {
      pass: ok,
      reason: ok
        ? "all helpers + emitter functions reachable from process-paid-side-effects' import set"
        : "missing helper or emitter function",
    };
  });

  // ── Cleanup ──────────────────────────────────────────────────────────
  await cleanup();
  await db.$disconnect();

  const passed = results.filter((r) => r.result.pass).length;
  const total = results.length;
  // eslint-disable-next-line no-console
  console.log(
    `\nPhase 1B: ${passed}/${total} passed${passed === total ? "" : " — " + (total - passed) + " FAILED"}`,
  );
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("verify-phase1b crashed:", err);
  process.exit(1);
});
