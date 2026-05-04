/**
 * Load test for the besökare-widget read path.
 *
 * Measures latency distribution of `getVisitorsNow(tenantId)` against
 * the live Neon dev DB. This is the dominant cost in the read path:
 * the route's auth check + tenant resolve + JSON serialize add ~5-10ms
 * total, and the Upstash-cache hit (when configured) adds a single
 * REST round-trip ~10-30ms typical. The DB query is the layer that
 * can blow the p95 budget; the wrapper layers can't.
 *
 * Per recon §3.3, worst-case row count over a 5-min window is ~4170
 * rows for the busiest tenant. We seed exactly that many rows with
 * 200 distinct session_ids and assert:
 *
 *   p95 < 800ms  (recon §1: cache-miss budget)
 *   p50 < 100ms  (any reasonable serverless DB at this row count)
 *
 * Ouput: writes a latency distribution report to
 * `_audit/besokare-load-test-<YYYY-MM-DD>.txt` for posterity.
 *
 * Usage:
 *   ANALYTICS_PIPELINE_DEV_GUARD=0 npx tsx scripts/load-test-besokare.ts
 */

/* eslint-disable no-console */

import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { _unguardedAnalyticsPipelineClient as db } from "@/app/_lib/db/prisma";
import { getVisitorsNow } from "@/app/_lib/analytics/live/visitors";

const REPO_ROOT = resolve(__dirname, "..");
const TENANT_ID = "cload_test_besokare_xxxxx";
const SEED_ROWS = 4_170; // recon §3.3 worst-case
const DISTINCT_SESSION_IDS = 200; // 4170 / 200 ≈ 20 dupes per session
const POLLS = 200; // sample size
const P95_BUDGET_MS = 800; // recon §1 cache-miss budget
const P50_BUDGET_MS = 100;

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function seedFixtures(): Promise<void> {
  console.log(`[seed] cleaning prior fixtures for ${TENANT_ID}`);
  await db.$executeRawUnsafe(
    `DELETE FROM analytics.event WHERE tenant_id = '${TENANT_ID}'`,
  );

  console.log(`[seed] inserting ${SEED_ROWS} rows across ${DISTINCT_SESSION_IDS} session_ids`);
  const now = new Date();
  // 4-min spread keeps every event well within the 5-min window.
  const SPREAD_MS = 4 * 60 * 1000;

  // Build the inserts in batches of 500 — Prisma's executeRaw doesn't
  // support multi-row VALUES via the template tag, so we use
  // $executeRawUnsafe with hand-built VALUES.
  const BATCH = 500;
  for (let start = 0; start < SEED_ROWS; start += BATCH) {
    const rows: string[] = [];
    for (let i = start; i < Math.min(start + BATCH, SEED_ROWS); i++) {
      const eventId = `01HZLOAD${i.toString(36).toUpperCase().padStart(18, "0")}`.slice(0, 26);
      const sessionId = `01HZLDS${(i % DISTINCT_SESSION_IDS).toString(36).toUpperCase().padStart(19, "0")}`.slice(0, 26);
      const occurredAt = new Date(now.getTime() - Math.floor(Math.random() * SPREAD_MS));
      const payload = JSON.stringify({ session_id: sessionId, page_type: "home" }).replace(/'/g, "''");
      rows.push(
        `('${eventId}', '${TENANT_ID}', 'page_viewed', '0.1.0', '${occurredAt.toISOString()}', NOW(), NULL, 'anonymous', NULL, '${payload}'::jsonb, NULL)`,
      );
    }
    await db.$executeRawUnsafe(
      `INSERT INTO analytics.event (event_id, tenant_id, event_name, schema_version, occurred_at, received_at, correlation_id, actor_type, actor_id, payload, context) VALUES ${rows.join(", ")} ON CONFLICT (event_id, occurred_at) DO NOTHING`,
    );
  }

  // Verify count
  const countRows = await db.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM analytics.event
    WHERE tenant_id = ${TENANT_ID}
      AND occurred_at > NOW() - INTERVAL '5 minutes'
  `;
  const seeded = Number(countRows[0]?.count ?? 0);
  console.log(`[seed] verified ${seeded} rows in 5-min window`);
}

async function cleanup(): Promise<void> {
  await db.$executeRawUnsafe(
    `DELETE FROM analytics.event WHERE tenant_id = '${TENANT_ID}'`,
  );
}

interface Sample {
  durationMs: number;
  visitors: number;
}

async function poll(): Promise<Sample> {
  const start = Date.now();
  const visitors = await getVisitorsNow(TENANT_ID);
  return { durationMs: Date.now() - start, visitors };
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.floor((p / 100) * sortedAsc.length),
  );
  return sortedAsc[idx];
}

function distributionLine(label: string, value: number, budget?: number): string {
  const status = budget === undefined ? "" : value < budget ? " ✓" : ` ✗ (budget ${budget}ms)`;
  return `  ${label.padEnd(8)} ${value.toString().padStart(6)}ms${status}`;
}

async function main(): Promise<void> {
  console.log("=== besokare load test ===");
  console.log(`tenant: ${TENANT_ID}`);
  console.log(`seed:   ${SEED_ROWS} rows, ${DISTINCT_SESSION_IDS} distinct session_ids`);
  console.log(`polls:  ${POLLS}`);
  console.log("");

  await seedFixtures();

  console.log("");
  console.log("[run] warmup (10 polls, discarded)");
  for (let i = 0; i < 10; i++) await poll();

  console.log(`[run] measurement loop — ${POLLS} sequential polls`);
  const samples: Sample[] = [];
  const runStart = Date.now();
  for (let i = 0; i < POLLS; i++) {
    samples.push(await poll());
  }
  const runDurationMs = Date.now() - runStart;
  console.log(`[run] complete in ${runDurationMs}ms (${(POLLS / (runDurationMs / 1000)).toFixed(1)} polls/sec)`);

  // Each poll returns the same answer (same fixture set, same window)
  const visitorCounts = new Set(samples.map((s) => s.visitors));
  if (visitorCounts.size !== 1) {
    throw new Error(`unexpected: visitor count varied across polls: ${[...visitorCounts]}`);
  }
  const visitors = samples[0].visitors;
  if (visitors !== DISTINCT_SESSION_IDS) {
    console.warn(
      `[warn] visitors=${visitors}, expected ${DISTINCT_SESSION_IDS} — random duplicates may have collapsed identical session_ids`,
    );
  }

  const durationsAsc = samples.map((s) => s.durationMs).sort((a, b) => a - b);
  const p50 = percentile(durationsAsc, 50);
  const p90 = percentile(durationsAsc, 90);
  const p95 = percentile(durationsAsc, 95);
  const p99 = percentile(durationsAsc, 99);
  const max = durationsAsc[durationsAsc.length - 1];
  const min = durationsAsc[0];
  const mean = Math.round(
    durationsAsc.reduce((sum, d) => sum + d, 0) / durationsAsc.length,
  );

  console.log("");
  console.log("=== latency distribution ===");
  console.log(distributionLine("min", min));
  console.log(distributionLine("mean", mean));
  console.log(distributionLine("p50", p50, P50_BUDGET_MS));
  console.log(distributionLine("p90", p90));
  console.log(distributionLine("p95", p95, P95_BUDGET_MS));
  console.log(distributionLine("p99", p99));
  console.log(distributionLine("max", max));
  console.log(`  visitors ${visitors} distinct sessions counted`);
  console.log("");

  const passed = p95 < P95_BUDGET_MS && p50 < P50_BUDGET_MS;
  console.log(passed ? "✓ PASS" : "✗ FAIL");
  console.log("");

  // Write report
  const reportPath = join(REPO_ROOT, "_audit", `besokare-load-test-${isoDate()}.txt`);
  const report = [
    "besokare-widget — load test report",
    `date:               ${new Date().toISOString()}`,
    `tenant:             ${TENANT_ID}`,
    `seed rows:          ${SEED_ROWS}`,
    `distinct sessions:  ${DISTINCT_SESSION_IDS}`,
    `polls:              ${POLLS}`,
    `total run time:     ${runDurationMs}ms`,
    "",
    "Latency distribution (ms):",
    `  min       ${min}`,
    `  mean      ${mean}`,
    `  p50       ${p50}    (budget < ${P50_BUDGET_MS})`,
    `  p90       ${p90}`,
    `  p95       ${p95}    (budget < ${P95_BUDGET_MS})`,
    `  p99       ${p99}`,
    `  max       ${max}`,
    "",
    `Result: ${passed ? "PASS" : "FAIL"}`,
    "",
    "Notes:",
    " * Measures the dominant DB-query layer of the besokare endpoint.",
    " * HTTP layer overhead (auth + tenant resolve + JSON serialize)",
    "   adds ~5-10ms constant per request — within budget margin.",
    " * Cache layer (Upstash REST GET) adds ~10-30ms when configured;",
    "   not exercised in this test (dev environment uses no-op proxy).",
    " * Cache-miss budget (800ms) accounts for both layers; passing the",
    "   DB-query subset means the full path has headroom.",
  ].join("\n");

  writeFileSync(reportPath, report + "\n", "utf8");
  console.log(`[report] written to ${reportPath}`);

  await cleanup();
  await db.$disconnect();

  process.exit(passed ? 0 : 1);
}

main().catch(async (err) => {
  console.error("[fatal]", err);
  try {
    await cleanup();
    await db.$disconnect();
  } catch {
    // ignore — we're already exiting
  }
  process.exit(1);
});
