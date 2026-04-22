/**
 * Reconciliation Tiers — cadence + window definitions
 * ═══════════════════════════════════════════════════════
 *
 * Three tiers cover three failure modes. Each tier has an independent
 * cursor, an independent cadence, and a different lookback window.
 * Together they give us the SLO:
 *
 *     p99 miss recovery  < 5 min  (hot)
 *     p99.9 miss recovery < 1 hour (warm)
 *     Zero lost bookings per week  (cold)
 *
 * Tier cadence is configured on Vercel via cron schedules pointing at
 * /api/cron/reconcile-pms?tier=hot|warm|cold. This file owns the
 * WINDOW math — how far back each tier looks relative to "now".
 *
 * Why three tiers instead of one "always look back 7 days":
 *
 *   • Hot runs often but reads little data — cheap, fast, catches the
 *     common case (a webhook dropped in the last few minutes).
 *   • Warm covers moderate webhook outages (1-hour gap) without the
 *     cost of a full day sweep every 2 minutes.
 *   • Cold is the paranoid safety net that every 24h will detect any
 *     lingering drift, even for weekend cancellations that span tiers.
 *
 * Each tier run acquires its own lock key and maintains its own
 * cursor, so hot/warm/cold never stall each other even when a slow
 * tenant occupies one tier's budget.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";

export type ReconciliationTier = "hot" | "warm" | "cold";

export interface TierConfig {
  tier: ReconciliationTier;
  /** Window lookback duration in milliseconds. */
  lookbackMs: number;
  /**
   * Per-tenant time budget for a single run. When exceeded, the run
   * yields — cursor is persisted, next run resumes where this one
   * stopped. Hot has the shortest budget because it fires often.
   */
  perTenantBudgetMs: number;
  /**
   * Maximum rows fetched per listBookings page. Upper bound shared
   * with adapters; adapters may clamp lower.
   */
  pageLimit: number;
  /**
   * Number of active tenants processed per run. Beyond this, further
   * tenants roll to the next run. Keeps a single cron invocation
   * bounded in wall time for Vercel's execution limit.
   */
  maxTenantsPerRun: number;
}

// ── Tier table ──────────────────────────────────────────────

export const TIER_CONFIG: Record<ReconciliationTier, TierConfig> = {
  hot: {
    tier: "hot",
    lookbackMs: 30 * 60 * 1000, // 30 minutes
    perTenantBudgetMs: 8_000,
    pageLimit: 200,
    maxTenantsPerRun: 500,
  },
  warm: {
    tier: "warm",
    lookbackMs: 24 * 60 * 60 * 1000, // 24 hours
    perTenantBudgetMs: 20_000,
    pageLimit: 500,
    maxTenantsPerRun: 200,
  },
  cold: {
    tier: "cold",
    lookbackMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    perTenantBudgetMs: 60_000,
    pageLimit: 1000,
    maxTenantsPerRun: 100,
  },
};

// ── Hard safety bound ───────────────────────────────────────
//
// The absolute maximum lookback we ever allow, even if a tier config
// or caller passes something larger. Prevents a misconfiguration from
// waking up zombie cancellations from 6 months ago.

export const MAX_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function computeWindow(
  tier: ReconciliationTier,
  now: Date = new Date(),
): { from: Date; to: Date } {
  const cfg = TIER_CONFIG[tier];
  const lookback = Math.min(cfg.lookbackMs, MAX_LOOKBACK_MS);
  return {
    from: new Date(now.getTime() - lookback),
    to: now,
  };
}

// ── Active-tenant selection ─────────────────────────────────
//
// At 10k tenants, polling every tenant every 2 minutes would be
// ~300k PMS calls per hour — expensive and unnecessary. Most
// tenants are idle at any given moment. We only sweep tenants that
// are plausibly active:
//
//   • TenantIntegration exists (has a PMS connected)
//   • status != "error" (circuit not hard-open)
//   • reconciliationEnabled (kill-switch off)
//   • provider != "manual" (manual tenants have nothing to reconcile)
//   • Recent sync activity: lastSyncAt within the last 7 days OR
//     never synced yet (new integration)
//
// This typically reduces the fleet by 70-90% while keeping any tenant
// that booked in the last week fully covered.

export interface ActiveTenant {
  tenantId: string;
  provider: string;
  lastSyncAt: Date | null;
}

export async function selectActiveTenants(
  tier: ReconciliationTier,
  limit: number,
): Promise<ActiveTenant[]> {
  const cfg = TIER_CONFIG[tier];
  const effectiveLimit = Math.min(limit, cfg.maxTenantsPerRun);

  const activityCutoff = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  );

  // Order by cursor's lastRunAt ASC so the least-recently-swept
  // tenants get priority. This keeps recon latency bounded across
  // the fleet even when work piles up.
  const rows = await prisma.$queryRaw<
    Array<{
      tenantId: string;
      provider: string;
      lastSyncAt: Date | null;
    }>
  >`
    SELECT
      ti."tenantId",
      ti."provider",
      ti."lastSyncAt"
    FROM "TenantIntegration" ti
    LEFT JOIN "ReconciliationCursor" rc
      ON rc."tenantId" = ti."tenantId"
     AND rc."provider" = ti."provider"
     AND rc."tier" = ${tier}
    WHERE ti."reconciliationEnabled" = true
      AND ti."status" <> 'error'
      AND ti."provider" <> 'manual'
      AND (
        ti."lastSyncAt" IS NULL
        OR ti."lastSyncAt" >= ${activityCutoff}
      )
    ORDER BY
      COALESCE(rc."lastRunAt", to_timestamp(0)) ASC,
      ti."tenantId" ASC
    LIMIT ${effectiveLimit}
  `;

  return rows;
}

// ── Cursor upsert helpers ───────────────────────────────────

export async function loadCursor(
  tx: Prisma.TransactionClient | typeof prisma,
  tenantId: string,
  provider: string,
  tier: ReconciliationTier,
) {
  return tx.reconciliationCursor.findUnique({
    where: {
      tenantId_provider_tier: { tenantId, provider, tier },
    },
  });
}

export async function saveCursor(
  tenantId: string,
  provider: string,
  tier: ReconciliationTier,
  data: {
    windowStart: Date;
    windowEnd: Date;
    cursor: string | null;
    completedAt: Date | null;
    lastError: string | null;
  },
) {
  await prisma.reconciliationCursor.upsert({
    where: {
      tenantId_provider_tier: { tenantId, provider, tier },
    },
    create: {
      tenantId,
      provider,
      tier,
      windowStart: data.windowStart,
      windowEnd: data.windowEnd,
      cursor: data.cursor,
      completedAt: data.completedAt,
      lastError: data.lastError,
      lastRunAt: new Date(),
    },
    update: {
      windowStart: data.windowStart,
      windowEnd: data.windowEnd,
      cursor: data.cursor,
      completedAt: data.completedAt,
      lastError: data.lastError,
      lastRunAt: new Date(),
    },
  });
}
