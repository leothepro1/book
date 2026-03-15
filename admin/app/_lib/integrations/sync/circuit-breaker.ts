/**
 * Circuit Breaker — Per-tenant consecutive failure counter
 *
 * Uses TenantIntegration.consecutiveFailures instead of time-windowed
 * SyncEvent queries. This correctly trips even with exponential backoff
 * where failures are spread far apart.
 *
 * 5 consecutive failures → circuit opens → TenantIntegration.status = "error"
 * Any successful sync → consecutiveFailures resets to 0
 */

import { prisma } from "@/app/_lib/db/prisma";
import type { PmsProvider } from "../types";
import { logSyncEvent } from "./log";

const FAILURE_THRESHOLD = 5;

/**
 * Check if the circuit breaker is open for a tenant.
 * Reads consecutiveFailures from TenantIntegration.
 */
export async function isCircuitOpen(
  tenantId: string,
  _provider: PmsProvider,
): Promise<boolean> {
  const integration = await prisma.tenantIntegration.findUnique({
    where: { tenantId },
    select: { consecutiveFailures: true },
  });

  if (!integration) return false;
  return integration.consecutiveFailures >= FAILURE_THRESHOLD;
}

/**
 * Record a sync failure — increments consecutiveFailures.
 * Updates TenantIntegration error state.
 */
export async function recordFailure(
  tenantId: string,
  _provider: PmsProvider,
  errorMessage: string,
): Promise<void> {
  await prisma.tenantIntegration.update({
    where: { tenantId },
    data: {
      consecutiveFailures: { increment: 1 },
      lastErrorAt: new Date(),
      lastError: errorMessage,
    },
  });
}

/**
 * Record a successful sync — resets consecutiveFailures to 0.
 * Updates lastSyncAt and clears error state.
 */
export async function recordSuccess(
  tenantId: string,
  _provider: PmsProvider,
): Promise<void> {
  await prisma.tenantIntegration.update({
    where: { tenantId },
    data: {
      consecutiveFailures: 0,
      lastSyncAt: new Date(),
      lastError: null,
      lastErrorAt: null,
    },
  });
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
