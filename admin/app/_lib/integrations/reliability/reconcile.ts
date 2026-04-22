/**
 * PMS Reliability Engine — Per-tenant Reconciliation Orchestrator
 * ══════════════════════════════════════════════════════════════════
 *
 * Drives one tenant-tier sweep: fetch the window's bookings from the
 * PMS via adapter.listBookings(), feed each booking through
 * upsertBookingFromPms() (the ingest chokepoint), persist the cursor,
 * and return a summary.
 *
 * Design principles:
 *
 *   1. One responsibility. This file only reconciles. Cron scheduling,
 *      tier selection, and HTTP auth live elsewhere — cron route
 *      (/api/cron/reconcile-pms) calls reconcileTenantTier() in a loop.
 *
 *   2. Cursor-driven resumability. The window is persisted before the
 *      first page fetch. Each successful page advances the cursor.
 *      If a run is killed mid-window (timeout, crash, deploy), the
 *      next run resumes from the stored cursor — no duplicate work,
 *      no gaps. When a window completes, a fresh one starts next run.
 *
 *   3. Fail-open on transients, fail-closed on circuits. A PMS hiccup
 *      (timeout, 5xx) records a BookingSyncError and continues with
 *      the next booking; the circuit breaker accumulates failures
 *      and trips after threshold. The orchestrator itself never
 *      throws — it returns a result summary every time.
 *
 *   4. Budget-aware. Each tenant has a wall-clock budget (from tier
 *      config). When exceeded, the orchestrator yields, saves
 *      cursor, and returns. The next cron run picks up the cursor.
 *
 *   5. Mutual exclusion. A Redis lock prevents two cron invocations
 *      from processing the same (tenantId, provider, tier) at once.
 *      Without this, concurrent runs would race on the same cursor
 *      and double-fetch the same window.
 *
 *   6. Observability first. Every outcome emits a structured log and
 *      a SyncEvent row. The `backfillCount` metric (how many ingest
 *      actions returned "created") is the key reliability SLO.
 */

import { log } from "@/app/_lib/logger";
import { setSentryTenantContext } from "@/app/_lib/observability/sentry";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveAdapter } from "../resolve";
import type { PmsProvider } from "../types";
import {
  isCircuitOpen,
  recordFailure,
  recordSuccess,
} from "../sync/circuit-breaker";
import { logSyncEvent } from "../sync/log";
import { withLock } from "@/app/_lib/redis/lock";
import {
  TIER_CONFIG,
  computeWindow,
  loadCursor,
  saveCursor,
  type ReconciliationTier,
} from "./tiers";
import { upsertBookingFromPms } from "./ingest";
import type { BookingUpsertInput, IngestStatus } from "./types";

// ── Result shape ────────────────────────────────────────────

export type SkipReason =
  | "circuit_open"
  | "feature_flag_disabled"
  | "lock_contended"
  | "integration_missing"
  | "provider_not_supported";

export interface ReconcileResult {
  tenantId: string;
  provider: string;
  tier: ReconciliationTier;
  skipped: SkipReason | null;
  /** Wall-clock milliseconds the orchestrator spent on this tenant. */
  durationMs: number;
  /** Pages fetched from the adapter. */
  pagesFetched: number;
  /** Total bookings returned across pages (before ingest). */
  bookingsScanned: number;
  /** Bookings that landed as new rows — the key reliability signal. */
  backfillCount: number;
  /** Bookings updated because version + content differed. */
  updatedCount: number;
  /** Bookings rejected as stale (incoming version <= stored). */
  staleCount: number;
  /** Bookings whose content was identical — version bump only. */
  identicalCount: number;
  /** Bookings that failed ingest — recorded as BookingSyncError rows. */
  errorCount: number;
  /** True when the full window was swept; false if we yielded on budget. */
  windowCompleted: boolean;
  /** Reason for terminal failure of the whole run (not per-booking). */
  fatalError: string | null;
}

// ── Lock key convention ─────────────────────────────────────

function lockKey(
  tenantId: string,
  provider: string,
  tier: ReconciliationTier,
): string {
  return `recon:${tenantId}:${provider}:${tier}`;
}

// ── Per-booking failure handling ────────────────────────────

async function recordBookingSyncError(
  tenantId: string,
  provider: string,
  externalId: string,
  error: unknown,
): Promise<void> {
  const msg = error instanceof Error ? error.message : String(error);
  try {
    await prisma.bookingSyncError.upsert({
      where: {
        tenantId_externalId: { tenantId, externalId },
      },
      create: {
        tenantId,
        provider,
        externalId,
        error: msg.slice(0, 1000),
      },
      update: {
        error: msg.slice(0, 1000),
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        resolvedAt: null,
      },
    });
  } catch (e) {
    // Dead-letter table failure is rare but must not abort the sweep.
    log("error", "pms.reconcile.dead_letter_write_failed", {
      tenantId,
      externalId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

// ── Core sweep (assumes lock held, circuit open-check passed) ──

async function executeSweep(
  tenantId: string,
  provider: PmsProvider,
  tier: ReconciliationTier,
  startedAt: number,
): Promise<Omit<ReconcileResult, "tenantId" | "provider" | "tier" | "skipped" | "durationMs">> {
  const cfg = TIER_CONFIG[tier];

  // Initialize counters up front so every return path fills them.
  let pagesFetched = 0;
  let bookingsScanned = 0;
  let backfillCount = 0;
  let updatedCount = 0;
  let staleCount = 0;
  let identicalCount = 0;
  let errorCount = 0;

  // Resolve window + resume cursor.
  //
  // Three cases force a fresh window:
  //   a) No cursor stored yet (first ever run)
  //   b) Previous window was fully swept (completedAt set)
  //   c) The stored window is STALE — its windowEnd is older than
  //      lookback × STALE_FACTOR. Without this guard, a tenant
  //      whose adapter has been failing for hours keeps resuming
  //      the same old window and never looks at CURRENT-TIME
  //      changes, silently missing every booking in the meantime.
  const STALE_WINDOW_FACTOR = 3;
  const staleCutoff = Date.now() - cfg.lookbackMs * STALE_WINDOW_FACTOR;
  const existing = await loadCursor(prisma, tenantId, provider, tier);
  const isWindowStale =
    existing !== null && existing.windowEnd.getTime() < staleCutoff;

  if (isWindowStale) {
    log("warn", "pms.reconcile.stale_window_abandoned", {
      tenantId,
      provider,
      tier,
      oldWindowStart: existing!.windowStart.toISOString(),
      oldWindowEnd: existing!.windowEnd.toISOString(),
      ageMs: Date.now() - existing!.windowEnd.getTime(),
    });
  }

  const shouldStartNewWindow =
    !existing || existing.completedAt !== null || isWindowStale;

  const { from, to } = shouldStartNewWindow
    ? computeWindow(tier)
    : { from: existing!.windowStart, to: existing!.windowEnd };
  let cursor: string | null = shouldStartNewWindow ? null : existing?.cursor ?? null;

  // Persist the starting state BEFORE the first network call. If the
  // function crashes on the first fetch, the next run still knows
  // which window we were in the middle of.
  await saveCursor(tenantId, provider, tier, {
    windowStart: from,
    windowEnd: to,
    cursor,
    completedAt: null,
    lastError: null,
  });

  const adapter = await resolveAdapter(tenantId);

  // Loop: fetch page, ingest each booking, advance cursor. Exit on
  // nextCursor=null (window done), budget exceeded, or fatal error.
  while (true) {
    if (Date.now() - startedAt > cfg.perTenantBudgetMs) {
      log("info", "pms.reconcile.budget_exceeded", {
        tenantId,
        provider,
        tier,
        pagesFetched,
        bookingsScanned,
      });
      await saveCursor(tenantId, provider, tier, {
        windowStart: from,
        windowEnd: to,
        cursor,
        completedAt: null,
        lastError: null,
      });
      return {
        pagesFetched,
        bookingsScanned,
        backfillCount,
        updatedCount,
        staleCount,
        identicalCount,
        errorCount,
        windowCompleted: false,
        fatalError: null,
      };
    }

    let page;
    try {
      page = await adapter.listBookings(tenantId, {
        from,
        to,
        cursor: cursor ?? undefined,
        limit: cfg.pageLimit,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("error", "pms.reconcile.list_bookings_failed", {
        tenantId,
        provider,
        tier,
        pagesFetched,
        error: msg,
      });
      await recordFailure(tenantId, provider, msg).catch(() => {});
      await saveCursor(tenantId, provider, tier, {
        windowStart: from,
        windowEnd: to,
        cursor,
        completedAt: null,
        lastError: msg.slice(0, 1000),
      });
      return {
        pagesFetched,
        bookingsScanned,
        backfillCount,
        updatedCount,
        staleCount,
        identicalCount,
        errorCount,
        windowCompleted: false,
        fatalError: msg,
      };
    }

    pagesFetched++;
    bookingsScanned += page.bookings.length;

    for (const b of page.bookings) {
      // Same single-token tolerance as the webhook path — single
      // names go entirely into firstName, lastName="". The ingest
      // contract accepts empty lastName (see IngestGuestSchema).
      const tokens = b.guestName.trim().split(/\s+/).filter(Boolean);
      const firstName = tokens[0] ?? "";
      const lastName = tokens.length > 1 ? tokens.slice(1).join(" ") : "";

      const input: BookingUpsertInput = {
        tenantId,
        provider,
        externalId: b.externalId,
        providerUpdatedAt: b.providerUpdatedAt,
        providerCreatedAt: b.createdAt,
        source: "reconciliation",
        guest: {
          firstName,
          lastName,
          email: b.guestEmail,
          phone: b.guestPhone,
        },
        stay: {
          checkIn: b.checkIn,
          checkOut: b.checkOut,
          unit: b.categoryName || b.externalId,
          guestCount: b.guests,
        },
        status: b.status as IngestStatus,
      };

      try {
        const result = await upsertBookingFromPms(input);
        switch (result.action) {
          case "created":
            backfillCount++;
            break;
          case "updated":
            updatedCount++;
            break;
          case "unchanged_stale":
            staleCount++;
            break;
          case "unchanged_identical":
            identicalCount++;
            break;
        }
      } catch (err) {
        errorCount++;
        await recordBookingSyncError(tenantId, provider, b.externalId, err);
        // Continue with the next booking — one bad row must not stop
        // the sweep. The dead-letter row guarantees it gets retried.
      }
    }

    cursor = page.nextCursor;

    // Advance the persisted cursor so a crash after this point
    // resumes from the right place, not re-fetches this page.
    await saveCursor(tenantId, provider, tier, {
      windowStart: from,
      windowEnd: to,
      cursor,
      completedAt: null,
      lastError: null,
    });

    if (cursor === null) {
      // Window swept to completion.
      await saveCursor(tenantId, provider, tier, {
        windowStart: from,
        windowEnd: to,
        cursor: null,
        completedAt: new Date(),
        lastError: null,
      });
      return {
        pagesFetched,
        bookingsScanned,
        backfillCount,
        updatedCount,
        staleCount,
        identicalCount,
        errorCount,
        windowCompleted: true,
        fatalError: null,
      };
    }
  }
}

// ── Public orchestrator entry ───────────────────────────────

/**
 * Reconcile one (tenantId, provider, tier) combination.
 *
 * Never throws. Skip reasons and fatal errors surface in the result.
 * The cron route calls this in a loop over active tenants and aggregates
 * results into run-level metrics.
 */
export async function reconcileTenantTier(
  tenantId: string,
  provider: PmsProvider,
  tier: ReconciliationTier,
): Promise<ReconcileResult> {
  try {
    return await reconcileTenantTierInner(tenantId, provider, tier);
  } catch (err) {
    // Defense in depth: a single tenant's unexpected failure must
    // NEVER propagate out of this function and into the cron
    // route's for-loop, which would 500 the whole run and starve
    // every other tenant in the tier. Failures here can originate
    // in loadCursor/saveCursor (DB), resolveAdapter (decrypt /
    // registry), or anything unexpected in executeSweep that
    // escaped its own try/catch. We surface them as a fatalError
    // result so aggregation + alerting see the tenant but the run
    // continues.
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "pms.reconcile.tenant_uncaught", {
      tenantId,
      provider,
      tier,
      error: msg,
    });
    return {
      tenantId,
      provider,
      tier,
      skipped: null,
      durationMs: 0,
      pagesFetched: 0,
      bookingsScanned: 0,
      backfillCount: 0,
      updatedCount: 0,
      staleCount: 0,
      identicalCount: 0,
      errorCount: 0,
      windowCompleted: false,
      fatalError: msg,
    };
  }
}

async function reconcileTenantTierInner(
  tenantId: string,
  provider: PmsProvider,
  tier: ReconciliationTier,
): Promise<ReconcileResult> {
  const startedAt = Date.now();
  setSentryTenantContext(tenantId);

  const base = {
    tenantId,
    provider,
    tier,
    pagesFetched: 0,
    bookingsScanned: 0,
    backfillCount: 0,
    updatedCount: 0,
    staleCount: 0,
    identicalCount: 0,
    errorCount: 0,
    windowCompleted: false,
    fatalError: null as string | null,
  };

  // ── Precondition: integration exists + feature flag on + provider valid ──

  const integration = await prisma.tenantIntegration.findUnique({
    where: { tenantId },
    select: {
      provider: true,
      reconciliationEnabled: true,
      status: true,
    },
  });

  if (!integration) {
    log("warn", "pms.reconcile.skipped", {
      tenantId,
      tier,
      reason: "integration_missing",
    });
    return {
      ...base,
      skipped: "integration_missing",
      durationMs: Date.now() - startedAt,
    };
  }

  if (!integration.reconciliationEnabled) {
    return {
      ...base,
      skipped: "feature_flag_disabled",
      durationMs: Date.now() - startedAt,
    };
  }

  if (integration.provider === "manual") {
    return {
      ...base,
      skipped: "provider_not_supported",
      durationMs: Date.now() - startedAt,
    };
  }

  // ── Circuit breaker ──

  if (await isCircuitOpen(tenantId, provider)) {
    log("info", "pms.reconcile.skipped", {
      tenantId,
      tier,
      reason: "circuit_open",
    });
    return {
      ...base,
      skipped: "circuit_open",
      durationMs: Date.now() - startedAt,
    };
  }

  // ── Acquire per-tenant lock, run sweep under it ──

  const lockTtlSeconds =
    Math.ceil(TIER_CONFIG[tier].perTenantBudgetMs / 1000) + 30;

  const swept = await withLock(
    lockKey(tenantId, provider, tier),
    lockTtlSeconds,
    async () => executeSweep(tenantId, provider, tier, startedAt),
    // onSkip: another worker holds the lock
    () => null,
  );

  if (swept === null) {
    return {
      ...base,
      skipped: "lock_contended",
      durationMs: Date.now() - startedAt,
    };
  }

  const durationMs = Date.now() - startedAt;

  // Circuit breaker + run-level audit
  if (swept.fatalError === null) {
    await recordSuccess(tenantId, provider).catch(() => {});
  }

  const result: ReconcileResult = {
    tenantId,
    provider,
    tier,
    skipped: null,
    durationMs,
    ...swept,
  };

  await logSyncEvent(
    tenantId,
    provider,
    swept.fatalError ? "sync.failed" : "sync.completed",
    {
      tier,
      durationMs,
      pagesFetched: swept.pagesFetched,
      bookingsScanned: swept.bookingsScanned,
      backfillCount: swept.backfillCount,
      updatedCount: swept.updatedCount,
      staleCount: swept.staleCount,
      identicalCount: swept.identicalCount,
      errorCount: swept.errorCount,
      windowCompleted: swept.windowCompleted,
      ...(swept.fatalError ? { error: swept.fatalError } : {}),
    },
  );

  log("info", "pms.reconcile.completed", {
    tenantId,
    provider,
    tier,
    durationMs,
    bookingsScanned: swept.bookingsScanned,
    backfillCount: swept.backfillCount,
    errorCount: swept.errorCount,
    windowCompleted: swept.windowCompleted,
  });

  return result;
}
