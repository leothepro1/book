/**
 * Circuit Breaker — Per-tenant with half-open probing + time reset
 *
 * State machine (derived from TenantIntegration columns — no extra
 * schema required):
 *
 *   CLOSED      — consecutiveFailures < threshold. Adapter calls
 *                 pass through normally.
 *
 *   OPEN        — consecutiveFailures >= threshold AND lastErrorAt
 *                 was recent (within OPEN_DURATION_MS). isCircuitOpen
 *                 returns true; reconcile cron skips the tenant.
 *
 *   HALF_OPEN   — consecutiveFailures >= threshold AND lastErrorAt
 *                 older than OPEN_DURATION_MS. isCircuitOpen returns
 *                 false so ONE probe call can go through. On success
 *                 → transitions to CLOSED (counter reset). On
 *                 failure → increments counter and lastErrorAt,
 *                 moving back to OPEN for another full OPEN_DURATION_MS.
 *
 * This is the canonical three-state circuit breaker. It adds self-
 * healing to the previous binary "5 fails → open forever until
 * something resets you" design: a Mews outage that recovers on its
 * own doesn't require any manual intervention to restore service —
 * after OPEN_DURATION_MS (60 s) the next reconcile sweep or webhook
 * probes and, if successful, the circuit auto-closes.
 *
 * 5 consecutive failures → circuit opens → TenantIntegration.status = "error"
 * 60 s after last failure → circuit probes (half-open)
 * Any successful probe   → consecutiveFailures resets to 0 (closed)
 * Any failing probe      → counter increments; next probe in 60 s
 */

import { prisma } from "@/app/_lib/db/prisma";
import { emitAnalyticsEventStandalone } from "@/app/_lib/analytics/pipeline/emitter";
import { derivePMSAdapterType } from "@/app/_lib/analytics/pipeline/integrations";
import type { PmsProvider } from "../types";
import { logSyncEvent } from "./log";
import { log } from "@/app/_lib/logger";

export const FAILURE_THRESHOLD = 5;
export const OPEN_DURATION_MS = 60_000;

/**
 * Returns true iff the circuit is fully OPEN (neither CLOSED nor
 * HALF_OPEN). Callers use this to skip calls they consider
 * unnecessary; HALF_OPEN intentionally looks like CLOSED so a probe
 * can go through.
 *
 * The half-open transition is implicit — we don't persist an
 * explicit status; we read consecutiveFailures + lastErrorAt and
 * derive the state at call time. That means two parallel probes
 * could both go through (both see half-open), which is acceptable:
 * a burst of concurrent successes still closes the circuit, and a
 * burst of concurrent failures is bounded at 2× threshold.
 */
export async function isCircuitOpen(
  tenantId: string,
  _provider: PmsProvider,
): Promise<boolean> {
  const integration = await prisma.tenantIntegration.findUnique({
    where: { tenantId },
    select: { consecutiveFailures: true, lastErrorAt: true },
  });

  if (!integration) return false;
  if (integration.consecutiveFailures < FAILURE_THRESHOLD) return false;

  // Over threshold — look at time since last failure.
  const lastErrorAt = integration.lastErrorAt;
  if (!lastErrorAt) {
    // Over threshold but no timestamp — treat as closed-for-probe.
    // This is the safer failure mode: let work through rather than
    // locking out indefinitely on inconsistent state.
    return false;
  }

  const sinceLastFailureMs = Date.now() - lastErrorAt.getTime();
  if (sinceLastFailureMs >= OPEN_DURATION_MS) {
    // HALF_OPEN: allow probe through.
    return false;
  }

  // OPEN: still within cooldown window.
  return true;
}

/**
 * Record a sync failure — increments consecutiveFailures and stamps
 * lastErrorAt (used by the half-open timer).
 */
export async function recordFailure(
  tenantId: string,
  _provider: PmsProvider,
  errorMessage: string,
): Promise<void> {
  const updated = await prisma.tenantIntegration.update({
    where: { tenantId },
    data: {
      consecutiveFailures: { increment: 1 },
      lastErrorAt: new Date(),
      lastError: errorMessage,
    },
    select: { consecutiveFailures: true, lastErrorAt: true, provider: true },
  });

  // Analytics pipeline emit (Phase 2) — pms_sync_failed.
  //
  // Q6 idempotency contract: the natural key seems to be
  //     `pms_sync_failed:${tenantId}:${provider}`
  // but that's NOT unique per failure occurrence — the same provider
  // can fail repeatedly. Phase 5 needs OCCURRENCE counts (MTBF, error
  // rate, time-to-recovery), not unique sessions. We append the
  // updated `consecutive_failures` counter so each increment is a
  // distinct analytics event:
  //     `pms_sync_failed:${tenantId}:${provider}:${consecutive_failures}`.
  // Future readers: do NOT collapse this key to just (tenantId,
  // provider) — that would dedupe successive failures and destroy the
  // count-based aggregations.
  try {
    await emitAnalyticsEventStandalone({
      tenantId,
      eventName: "pms_sync_failed",
      schemaVersion: "0.1.0",
      occurredAt: updated.lastErrorAt ?? new Date(),
      actor: { actor_type: "system", actor_id: null },
      payload: {
        pms_provider: derivePMSAdapterType(updated.provider),
        consecutive_failures: updated.consecutiveFailures,
        error_message: errorMessage.slice(0, 500),
        failed_at: updated.lastErrorAt ?? new Date(),
      },
      idempotencyKey: `pms_sync_failed:${tenantId}:${updated.provider}:${updated.consecutiveFailures}`,
    });
  } catch (err) {
    log("error", "analytics.pipeline.pms_sync_failed.failed", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Record a successful sync — resets consecutiveFailures to 0 and
 * clears error state. Also fires a "circuit_closed" audit event
 * when we transition out of OPEN/HALF_OPEN so operators can see
 * the auto-recovery in the timeline.
 */
export async function recordSuccess(
  tenantId: string,
  provider: PmsProvider,
): Promise<void> {
  // Check if we're transitioning out of an open state so we can
  // emit the audit event. Cheap single-row read, well-worth it for
  // operator visibility.
  const prev = await prisma.tenantIntegration.findUnique({
    where: { tenantId },
    select: { consecutiveFailures: true },
  });
  const wasOverThreshold =
    (prev?.consecutiveFailures ?? 0) >= FAILURE_THRESHOLD;

  await prisma.tenantIntegration.update({
    where: { tenantId },
    data: {
      consecutiveFailures: 0,
      lastSyncAt: new Date(),
      lastError: null,
      lastErrorAt: null,
    },
  });

  if (wasOverThreshold) {
    log("info", "pms.circuit.auto_closed", {
      tenantId,
      provider,
      previousFailures: prev?.consecutiveFailures,
    });
    await logSyncEvent(tenantId, provider, "sync.completed", {
      circuitTransition: "closed",
      previousFailures: prev?.consecutiveFailures,
    });

    // Analytics pipeline emit (Phase 2) — pms_sync_recovered.
    // ONLY on the over-threshold → 0 transition. Every successful
    // sync would be high-volume noise. Idempotency key includes the
    // recovery timestamp so successive open→close cycles are distinct
    // events.
    try {
      const recoveredAt = new Date();
      await emitAnalyticsEventStandalone({
        tenantId,
        eventName: "pms_sync_recovered",
        schemaVersion: "0.1.0",
        occurredAt: recoveredAt,
        actor: { actor_type: "system", actor_id: null },
        payload: {
          pms_provider: derivePMSAdapterType(provider),
          previous_failures: prev?.consecutiveFailures ?? FAILURE_THRESHOLD,
          recovered_at: recoveredAt,
        },
        idempotencyKey: `pms_sync_recovered:${tenantId}:${provider}:${recoveredAt.getTime()}`,
      });
    } catch (err) {
      log("error", "analytics.pipeline.pms_sync_recovered.failed", {
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Handle a job when the circuit is open.
 * Marks the job dead and updates TenantIntegration status to "error".
 */
export async function markJobCircuitOpen(
  jobId: string,
  tenantId: string,
  provider: string,
): Promise<void> {
  await prisma.syncJob.update({
    where: { id: jobId },
    data: { status: "dead", lastError: "circuit_open" },
  });

  await prisma.tenantIntegration.update({
    where: { tenantId },
    data: { status: "error", lastError: "Circuit breaker open — too many consecutive failures" },
  });

  await logSyncEvent(tenantId, provider, "sync.failed", {
    jobId,
    error: "circuit_open",
    reason: `${FAILURE_THRESHOLD}+ consecutive failures`,
  });
}
