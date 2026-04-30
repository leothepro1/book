/**
 * Phase 2 verification — event catalog expansion (19 new events).
 *
 *   $ ANALYTICS_PIPELINE_DEV_GUARD=1 INNGEST_DEV=1 \
 *       tsx scripts/verify-phase2.ts
 *
 * PREREQUISITE: the Inngest dev server must be running on
 * http://localhost:8288 AND the Bedfront Next.js dev server on
 * http://localhost:3000 (so the Inngest dev server can discover the
 * drainer/scanner functions). Without either, the smoke tests fail.
 *
 *   $ npx inngest-cli@latest dev      # terminal A
 *   $ ANALYTICS_PIPELINE_DEV_GUARD=1 INNGEST_DEV=1 npm run dev   # terminal B
 *
 * Checks per Phase 2 plan (Q8 target = ~86):
 *   - Per event (19 events × 4 = 76):
 *       schema registered, rejects bad payload, accepts valid payload,
 *       operational integration present OR in KNOWN_DEFERRED_EVENTS.
 *   - Catalog completeness (4):
 *       every registered event has a catalog entry; no catalog entry
 *       references an unregistered event; deferred events listed
 *       consistently; KNOWN_DEFERRED_EVENTS map has reasons.
 *   - End-to-end smokes (6, one per group):
 *       emit → signal → drain → analytics.event row appears.
 *
 * Total: 76 + 4 + 6 = 86 expected checks.
 */

process.env.ANALYTICS_PIPELINE_DEV_GUARD =
  process.env.ANALYTICS_PIPELINE_DEV_GUARD ?? "1";
process.env.INNGEST_DEV = process.env.INNGEST_DEV ?? "1";

import { readFileSync } from "node:fs";
import { join } from "node:path";

const TENANT_A = "cphase2aaa00000000000000a"; // 25 chars

// ── KNOWN_DEFERRED_EVENTS ────────────────────────────────────────────────
//
// Events that are registered + catalog'd but have NO operational emit
// site in this PR. The verify script's "operational integration exists"
// check passes for any event in this map. Self-documenting via the
// reason string — future readers can find the rationale here without
// git-blame.

const KNOWN_DEFERRED_EVENTS: Record<string, string> = {
  booking_no_show:
    "Phase 2.x — needs Apelviken's product decision on the no-show window before emit can land",
  accommodation_published:
    "Phase 4 — Postgres CDC; multiple admin write-paths make CDC the canonical capture",
  accommodation_archived:
    "Phase 4 — Postgres CDC; same reasoning as accommodation_published",
  accommodation_price_changed:
    "Phase 4 — Postgres CDC; same reasoning",
};

// ── Phase 2 events (the 19 added in this PR) ─────────────────────────────

const PHASE_2_EVENTS = [
  // Group 1 — booking lifecycle
  "booking_imported",
  "booking_modified",
  "booking_cancelled",
  "booking_no_show",
  // Group 2 — payment lifecycle
  "payment_failed",
  "payment_refunded",
  "payment_disputed",
  // Group 3 — guest lifecycle
  "guest_account_created",
  "guest_otp_sent",
  "guest_authenticated",
  "guest_account_linked",
  // Group 4 — accommodation lifecycle (all deferred-CDC)
  "accommodation_published",
  "accommodation_archived",
  "accommodation_price_changed",
  // Group 5 — discount lifecycle
  "discount_created",
  "discount_used",
  "discount_expired",
  // Group 6 — PMS operational
  "pms_sync_failed",
  "pms_sync_recovered",
] as const;

// ── Result tracking ──────────────────────────────────────────────────────

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
    if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "verify-phase2: Inngest dev server is not reachable at http://localhost:8288.",
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

async function ensureBedfrontDevServerRunning(): Promise<void> {
  const url = "http://localhost:3000/api/inngest";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
    if (!res.ok && res.status !== 405) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "verify-phase2: Bedfront dev server is not reachable at http://localhost:3000.",
    );
    // eslint-disable-next-line no-console
    console.error(`  reason: ${err instanceof Error ? err.message : String(err)}`);
    // eslint-disable-next-line no-console
    console.error("\nStart it in another terminal:");
    // eslint-disable-next-line no-console
    console.error("  $ ANALYTICS_PIPELINE_DEV_GUARD=1 INNGEST_DEV=1 npm run dev\n");
    process.exit(2);
  }
}

async function main() {
  // eslint-disable-next-line no-console
  console.log("Phase 2 verification — event catalog expansion (19 new events)\n");

  await ensureInngestDevServerRunning();
  await ensureBedfrontDevServerRunning();

  const { _unguardedAnalyticsPipelineClient } = await import(
    "@/app/_lib/db/prisma"
  );
  const {
    emitAnalyticsEventStandalone,
    signalAnalyticsFlush,
  } = await import("@/app/_lib/analytics/pipeline/emitter");
  const { ANALYTICS_EVENT_REGISTRY } = await import(
    "@/app/_lib/analytics/pipeline/schemas/registry"
  );

  const db = _unguardedAnalyticsPipelineClient;

  // Cleanup before run.
  await db.$executeRawUnsafe(
    `DELETE FROM analytics.outbox WHERE tenant_id = '${TENANT_A}'`,
  );
  await db.$executeRawUnsafe(
    `DELETE FROM analytics.event WHERE tenant_id = '${TENANT_A}'`,
  );

  // ── 1. Per-event checks (19 × 4 = 76) ─────────────────────────────────

  // Source files we grep for "operational integration exists".
  // Catalog files are excluded — only application source counts.
  const APPLICATION_SOURCE_GLOBS = [
    "app/_lib/integrations/reliability/ingest.ts",
    "app/_lib/integrations/sync/circuit-breaker.ts",
    "app/_lib/discounts/apply.ts",
    "app/_lib/discounts/status.ts",
    "app/_lib/guest-auth/account.ts",
    "app/_lib/magic-link/request.ts",
    "app/_lib/magic-link/validate.ts",
    "app/_lib/orders/process-paid-side-effects.ts",
    "app/api/admin/discounts/route.ts",
    "app/api/webhooks/stripe/route.ts",
  ];

  function eventHasOperationalEmit(eventName: string): boolean {
    for (const rel of APPLICATION_SOURCE_GLOBS) {
      try {
        const src = readFileSync(join(process.cwd(), rel), "utf8");
        if (src.includes(`eventName: "${eventName}"`)) return true;
      } catch {
        // file missing — skip
      }
    }
    return false;
  }

  // Minimal valid payloads keyed by event name. Used both for the
  // accept check and the smoke test.
  const validPayloads: Record<string, unknown> = {
    booking_imported: {
      booking_id: "bk_imp",
      pms_provider: "mews",
      pms_reference: "ext-1",
      check_in_date: "2026-06-01",
      check_out_date: "2026-06-04",
      number_of_nights: 3,
      number_of_guests: 2,
      accommodation_id: null,
      guest_email_hash: "email_a3f7b2c1d4e5f6a7",
    },
    booking_modified: {
      booking_id: "bk_mod",
      pms_provider: "mews",
      pms_reference: "ext-2",
      check_in_date: "2026-06-01",
      check_out_date: "2026-06-04",
      number_of_nights: 3,
      number_of_guests: 2,
      accommodation_id: "acc_1",
      source_channel: "pms_import",
      provider_updated_at: new Date(),
    },
    booking_cancelled: {
      booking_id: "bk_can",
      pms_provider: "mews",
      pms_reference: "ext-3",
      check_in_date: "2026-06-01",
      check_out_date: "2026-06-04",
      number_of_nights: 3,
      number_of_guests: 2,
      accommodation_id: "acc_1",
      source_channel: "pms_import",
      cancelled_at: new Date(),
    },
    booking_no_show: {
      booking_id: "bk_ns",
      pms_provider: "mews",
      pms_reference: "ext-4",
      expected_check_in_date: "2026-06-01",
      accommodation_id: "acc_1",
      number_of_guests: 2,
      detection_source: "internal",
      detected_at: new Date(),
    },
    payment_failed: {
      order_id: "co_pf",
      payment_intent_id: "pi_pf",
      amount: { amount: 12900, currency: "SEK" },
      decline_code: null,
      error_code: null,
      error_message: null,
      attempted_at: new Date(),
      provider: "stripe",
    },
    payment_refunded: {
      order_id: "co_pr",
      charge_id: "ch_pr",
      refund_amount: { amount: 5000, currency: "SEK" },
      refund_reason: "requested_by_customer",
      refunded_at: new Date(),
      provider: "stripe",
    },
    payment_disputed: {
      order_id: "co_pd",
      charge_id: "ch_pd",
      dispute_id: "dp_pd",
      disputed_amount: { amount: 12900, currency: "SEK" },
      dispute_reason: "fraudulent",
      dispute_status: "needs_response",
      created_at: new Date(),
      provider: "stripe",
    },
    guest_account_created: {
      guest_id: "cguest1",
      email_hash: "email_a3f7b2c1d4e5f6a7",
      source: "checkout",
      created_at: new Date(),
    },
    guest_otp_sent: {
      email_hash: "email_a3f7b2c1d4e5f6a7",
      token_id: "abcdef0123456789",
      expires_at: new Date(),
      sent_at: new Date(),
    },
    guest_authenticated: {
      guest_id: "cguest1",
      email_hash: "email_a3f7b2c1d4e5f6a7",
      token_id: "abcdef0123456789",
      authenticated_at: new Date(),
    },
    guest_account_linked: {
      guest_id: "cguest1",
      email_hash: "email_a3f7b2c1d4e5f6a7",
      linked_resource_type: "order",
      linked_resource_id: "co_l",
      link_method: "auto_via_email_match",
      linked_at: new Date(),
    },
    accommodation_published: {
      accommodation_id: "acc_p",
      accommodation_type: "cabin",
      display_name: "Test Cabin",
      base_price: { amount: 90000, currency: "SEK" },
      status_transition: { from: "inactive", to: "active" },
      published_at: new Date(),
    },
    accommodation_archived: {
      accommodation_id: "acc_a",
      accommodation_type: "cabin",
      display_name: "Test Cabin",
      archived_at: new Date(),
      archived_by_actor_id: null,
    },
    accommodation_price_changed: {
      accommodation_id: "acc_pc",
      accommodation_type: "cabin",
      previous_price: { amount: 90000, currency: "SEK" },
      new_price: { amount: 95000, currency: "SEK" },
      change_pct: 5.56,
      changed_at: new Date(),
      changed_by_actor_id: null,
    },
    discount_created: {
      discount_id: "cdisc1",
      title: "Test",
      method: "code",
      value_type: "percentage",
      value: 1500,
      currency: null,
      starts_at: new Date(),
      ends_at: null,
      usage_limit: null,
      created_at: new Date(),
      created_by_actor_id: null,
    },
    discount_used: {
      discount_id: "cdisc1",
      discount_code: "CODE",
      order_id: "co_du",
      discount_amount: { amount: 5000, currency: "SEK" },
      order_total: { amount: 25000, currency: "SEK" },
      used_at: new Date(),
    },
    discount_expired: {
      discount_id: "cdisc1",
      title: "Test",
      ends_at: new Date(),
      expired_at: new Date(),
      total_uses: 0,
    },
    pms_sync_failed: {
      pms_provider: "mews",
      consecutive_failures: 1,
      error_message: "x",
      failed_at: new Date(),
    },
    pms_sync_recovered: {
      pms_provider: "mews",
      previous_failures: 5,
      recovered_at: new Date(),
    },
  };

  for (const eventName of PHASE_2_EVENTS) {
    const schema = (
      ANALYTICS_EVENT_REGISTRY as Record<string, Record<string, unknown>>
    )[eventName]?.["0.1.0"];

    // Check 1: registered
    await check(`[${eventName}] schema registered at v0.1.0`, async () => ({
      pass: schema !== undefined,
      reason: schema !== undefined ? "" : "not in ANALYTICS_EVENT_REGISTRY",
    }));

    if (!schema) continue;

    const safeParse = (
      schema as { safeParse: (input: unknown) => { success: boolean } }
    ).safeParse;

    // Check 2: rejects bad payload (empty payload — missing all required fields)
    await check(
      `[${eventName}] schema rejects empty payload`,
      async () => {
        const bad = {
          event_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          tenant_id: TENANT_A,
          event_name: eventName,
          schema_version: "0.1.0",
          occurred_at: new Date(),
          actor_type: "system" as const,
          actor_id: null,
          payload: {},
        };
        return {
          pass: !safeParse(bad).success,
          reason: safeParse(bad).success ? "accepted empty payload" : "",
        };
      },
    );

    // Check 3: accepts valid payload
    await check(
      `[${eventName}] schema accepts a valid payload`,
      async () => {
        const valid = {
          event_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          tenant_id: TENANT_A,
          event_name: eventName,
          schema_version: "0.1.0",
          occurred_at: new Date(),
          actor_type: "system" as const,
          actor_id: null,
          payload: validPayloads[eventName],
        };
        const r = safeParse(valid);
        return { pass: r.success, reason: r.success ? "" : "valid payload rejected" };
      },
    );

    // Check 4: operational integration OR known-deferred
    await check(
      `[${eventName}] operational integration present OR known-deferred`,
      async () => {
        if (KNOWN_DEFERRED_EVENTS[eventName]) {
          return {
            pass: true,
            reason: `deferred: ${KNOWN_DEFERRED_EVENTS[eventName]}`,
          };
        }
        const ok = eventHasOperationalEmit(eventName);
        return {
          pass: ok,
          reason: ok ? "emit found in application source" : "no emit site found in scanned application files",
        };
      },
    );
  }

  // ── 2. Catalog completeness (4 checks) ────────────────────────────────

  const catalog = readFileSync(
    join(process.cwd(), "docs/analytics/event-catalog.md"),
    "utf8",
  );

  await check(
    "catalog: every Phase 2 registered event has an entry",
    async () => {
      const missing = PHASE_2_EVENTS.filter(
        (n) => !catalog.includes(`\`${n}\``),
      );
      return {
        pass: missing.length === 0,
        reason: missing.length === 0 ? "" : `missing: ${missing.join(", ")}`,
      };
    },
  );

  await check(
    "catalog: no entry references an unregistered event name",
    async () => {
      const allRegistered = new Set(Object.keys(ANALYTICS_EVENT_REGISTRY));
      const referenced = Array.from(
        catalog.matchAll(/^### `([a-z_]+)` v\d/gm),
        (m) => m[1],
      );
      const orphans = referenced.filter((n) => !allRegistered.has(n));
      return {
        pass: orphans.length === 0,
        reason: orphans.length === 0 ? "" : `orphan entries: ${orphans.join(", ")}`,
      };
    },
  );

  await check(
    "catalog: every KNOWN_DEFERRED_EVENT is marked 'deferred' in the catalog",
    async () => {
      const missing: string[] = [];
      for (const name of Object.keys(KNOWN_DEFERRED_EVENTS)) {
        // Match the entry's heading and look for "deferred" within ~600 chars
        // after — heuristic that covers the catalog's "Status: ... deferred ..."
        // and "Registered, emit deferred" phrasings.
        const idx = catalog.indexOf(`\`${name}\``);
        if (idx === -1) {
          missing.push(name);
          continue;
        }
        const snippet = catalog.slice(idx, idx + 600);
        if (!/deferred/i.test(snippet)) missing.push(name);
      }
      return {
        pass: missing.length === 0,
        reason: missing.length === 0 ? "" : `not flagged as deferred: ${missing.join(", ")}`,
      };
    },
  );

  await check(
    "verify script: KNOWN_DEFERRED_EVENTS map non-empty + every value has a reason",
    async () => {
      const entries = Object.entries(KNOWN_DEFERRED_EVENTS);
      const missingReason = entries.filter(([, v]) => !v || v.length < 10);
      return {
        pass: entries.length > 0 && missingReason.length === 0,
        reason:
          missingReason.length === 0
            ? `${entries.length} deferred events with reasons`
            : `${missingReason.length} entries missing reason`,
      };
    },
  );

  // ── 3. End-to-end smokes (6, one per group) ───────────────────────────

  async function smokeEmit(eventName: string, label: string): Promise<CheckResult> {
    const idemKey = `verify-phase2-smoke:${eventName}:${Date.now()}`;
    const out = await emitAnalyticsEventStandalone({
      tenantId: TENANT_A,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventName: eventName as any,
      schemaVersion: "0.1.0",
      occurredAt: new Date(),
      actor: { actor_type: "system", actor_id: null },
      payload: validPayloads[eventName],
      idempotencyKey: idemKey,
    });
    await signalAnalyticsFlush(TENANT_A);
    const drained = await pollUntil(async () => {
      const rows = await db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM analytics.event
        WHERE event_id = ${out.event_id}
      `;
      return Number(rows[0]?.count ?? 0n) === 1;
    }, 15_000);
    return {
      pass: drained,
      reason: drained ? `${label} drained` : `${label} did not drain within 15s`,
    };
  }

  await check("Group 1 smoke: booking_imported emit → drain", () =>
    smokeEmit("booking_imported", "booking_imported"),
  );
  await check("Group 2 smoke: payment_failed emit → drain", () =>
    smokeEmit("payment_failed", "payment_failed"),
  );
  await check("Group 3 smoke: guest_authenticated emit → drain", () =>
    smokeEmit("guest_authenticated", "guest_authenticated"),
  );
  await check("Group 4 smoke: accommodation_published emit → drain", () =>
    smokeEmit("accommodation_published", "accommodation_published"),
  );
  await check("Group 5 smoke: discount_used emit → drain", () =>
    smokeEmit("discount_used", "discount_used"),
  );
  await check("Group 6 smoke: pms_sync_failed emit → drain", () =>
    smokeEmit("pms_sync_failed", "pms_sync_failed"),
  );

  // Cleanup.
  await db.$executeRawUnsafe(
    `DELETE FROM analytics.outbox WHERE tenant_id = '${TENANT_A}'`,
  );
  await db.$executeRawUnsafe(
    `DELETE FROM analytics.event WHERE tenant_id = '${TENANT_A}'`,
  );
  await db.$disconnect();

  // ── Summary ──────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.result.pass).length;
  const total = results.length;
  // eslint-disable-next-line no-console
  console.log(
    `\nPhase 2: ${passed}/${total} passed${passed === total ? "" : " — " + (total - passed) + " FAILED"}`,
  );
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("verify-phase2 crashed:", err);
  process.exit(1);
});
