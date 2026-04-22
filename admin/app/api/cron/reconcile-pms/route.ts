export const dynamic = "force-dynamic";

/**
 * Cron: PMS Reliability Reconciliation
 * ══════════════════════════════════════
 *
 * Sweeps recently-modified bookings from every active tenant's PMS
 * and feeds them through the ingest chokepoint. This is the safety
 * net for missed webhooks — any PMS change that didn't reach us via
 * the fast webhook path is caught and backfilled here.
 *
 * Tiering:
 *
 *   hot  — every 2 min, 30-min window      → fast recovery
 *   warm — every hour,  24-hour window     → outage recovery
 *   cold — nightly,     7-day window       → drift + cancel sweep
 *
 * The same route handles all three tiers; `?tier=hot|warm|cold`
 * selects which. Each tier has its own cron entry in vercel.json.
 *
 * Auth: Bearer CRON_SECRET — same convention as every other cron.
 * Vercel sets this header automatically when invoking scheduled crons.
 *
 * The route is orchestration-only. All the actual reconciliation
 * logic lives in app/_lib/integrations/reliability/reconcile.ts so it
 * can be unit-tested and invoked from other contexts (debug tools,
 * admin "re-sync now" buttons) without touching HTTP.
 */

import { env } from "@/app/_lib/env";
import { log } from "@/app/_lib/logger";
import { reconcileTenantTier } from "@/app/_lib/integrations/reliability/reconcile";
import {
  TIER_CONFIG,
  selectActiveTenants,
  type ReconciliationTier,
} from "@/app/_lib/integrations/reliability/tiers";
import type { PmsProvider } from "@/app/_lib/integrations/types";
import { runWithPool } from "@/app/_lib/concurrency/pool";

// Per-tenant concurrency within a single cron run. Each tenant holds
// its own Redis lock inside reconcileTenantTier, so no tenant-on-
// tenant interference. 8 parallel tenants × 8s per-tenant budget
// saturates the 55s route budget at ~55 × 8 = ~440 tenants/run.
const POOL_CONCURRENCY = 8;

// Vercel Hobby allows up to 60s; Pro up to 300s. Keep under the
// lower bound so a single slow tenant doesn't run us into a 504.
// Per-tenant budgets sum under this ceiling.
const ROUTE_WALL_BUDGET_MS = 55_000;

function parseTier(url: URL): ReconciliationTier | null {
  const raw = url.searchParams.get("tier");
  if (raw === "hot" || raw === "warm" || raw === "cold") return raw;
  return null;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const tier = parseTier(url);
  if (!tier) {
    return Response.json(
      { error: "Missing or invalid ?tier= (expected hot|warm|cold)" },
      { status: 400 },
    );
  }

  const runStartedAt = Date.now();
  const cfg = TIER_CONFIG[tier];

  // Select the subset of tenants this run will touch. Active-tenant
  // filtering + ordering-by-lastRunAt (oldest first) is in tiers.ts.
  const tenants = await selectActiveTenants(tier, cfg.maxTenantsPerRun);

  log("info", "pms.reconcile.run_started", {
    tier,
    tenantCount: tenants.length,
    windowLookbackMs: cfg.lookbackMs,
  });

  // Aggregate counters
  const agg = {
    tenantsProcessed: 0,
    tenantsSkipped: 0,
    totalBookingsScanned: 0,
    totalBackfill: 0,
    totalUpdated: 0,
    totalStale: 0,
    totalIdentical: 0,
    totalErrors: 0,
    tenantsWithFatalError: 0,
  };

  const skipReasonCounts: Record<string, number> = {};

  // Concurrency pool — each tenant holds its own Redis lock inside
  // reconcileTenantTier, so parallelism is safe. reconcileTenantTier
  // has an outer try/catch so it can never throw; the pool will only
  // observe ok=true results.
  const outcomes = await runWithPool(
    tenants,
    async (t) =>
      reconcileTenantTier(t.tenantId, t.provider as PmsProvider, tier),
    {
      concurrency: POOL_CONCURRENCY,
      deadline: runStartedAt + ROUTE_WALL_BUDGET_MS,
    },
  );

  let skippedOnBudget = 0;
  for (const o of outcomes) {
    if (o.skippedDueToBudget) {
      skippedOnBudget++;
      continue;
    }
    if (!o.ok || !o.value) {
      // Should not happen — reconcileTenantTier has its own outer
      // safety wrapper. Log defensively.
      agg.tenantsWithFatalError++;
      continue;
    }
    const result = o.value;
    if (result.skipped) {
      agg.tenantsSkipped++;
      skipReasonCounts[result.skipped] =
        (skipReasonCounts[result.skipped] ?? 0) + 1;
    } else {
      agg.tenantsProcessed++;
      agg.totalBookingsScanned += result.bookingsScanned;
      agg.totalBackfill += result.backfillCount;
      agg.totalUpdated += result.updatedCount;
      agg.totalStale += result.staleCount;
      agg.totalIdentical += result.identicalCount;
      agg.totalErrors += result.errorCount;
      if (result.fatalError) agg.tenantsWithFatalError++;
    }
  }

  if (skippedOnBudget > 0) {
    log("warn", "pms.reconcile.run_wall_budget_exceeded", {
      tier,
      tenantsProcessed: agg.tenantsProcessed,
      tenantsSkippedOnBudget: skippedOnBudget,
    });
  }

  const durationMs = Date.now() - runStartedAt;

  // The CRITICAL reliability signal. A sustained non-zero
  // totalBackfill means webhooks are missing bookings somewhere in
  // the fleet. Alerting should tail this log event and page on
  // deviation from baseline.
  log("info", "pms.reconcile.run_completed", {
    tier,
    durationMs,
    tenantsProcessed: agg.tenantsProcessed,
    tenantsSkipped: agg.tenantsSkipped,
    ...skipReasonCounts,
    totalBookingsScanned: agg.totalBookingsScanned,
    totalBackfill: agg.totalBackfill,
    totalUpdated: agg.totalUpdated,
    totalStale: agg.totalStale,
    totalIdentical: agg.totalIdentical,
    totalErrors: agg.totalErrors,
    tenantsWithFatalError: agg.tenantsWithFatalError,
  });

  return Response.json({
    ok: true,
    tier,
    durationMs,
    ...agg,
    skippedBreakdown: skipReasonCounts,
  });
}
