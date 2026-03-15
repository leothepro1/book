/**
 * Sync Job Scheduler
 *
 * Creates, retries, and claims SyncJob records.
 * Jobs are processed by the run-jobs API route (one at a time).
 */

import { prisma } from "@/app/_lib/db/prisma";
import { Prisma } from "@prisma/client";
import type { PmsProvider } from "../types";
import type { SyncJob } from "@prisma/client";

const MAX_BACKOFF_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Enqueue a new sync job for a tenant.
 * Returns null if a pending or running job already exists for this tenant
 * (dedup — prevents rapid-fire webhooks from creating duplicate jobs).
 */
export async function enqueueSyncJob(
  tenantId: string,
  provider: PmsProvider,
  options?: { since?: Date; delayMs?: number },
): Promise<SyncJob | null> {
  // Dedup: skip if a pending or running job already exists for this tenant
  const existing = await prisma.syncJob.findFirst({
    where: {
      tenantId,
      status: { in: ["pending", "running"] },
    },
  });

  if (existing) return null;

  const scheduledAt = new Date(Date.now() + (options?.delayMs ?? 0));

  const payload: Record<string, unknown> = {};
  if (options?.since) {
    payload.since = options.since.toISOString();
  }

  return prisma.syncJob.create({
    data: {
      tenantId,
      provider,
      scheduledAt,
      payload: Object.keys(payload).length > 0
        ? (payload as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
}

/**
 * Enqueue a retry for a failed job.
 * Uses exponential backoff: 2^attempt * 60s + random jitter (0-30s).
 */
export async function enqueueRetry(failedJob: {
  id: string;
  tenantId: string;
  provider: string;
  attempt: number;
  maxAttempts: number;
  payload: unknown;
}): Promise<SyncJob> {
  const backoffMs = Math.min(
    Math.pow(2, failedJob.attempt) * 60_000,
    MAX_BACKOFF_MS,
  );
  const jitterMs = Math.floor(Math.random() * 30_000);
  const scheduledAt = new Date(Date.now() + backoffMs + jitterMs);

  return prisma.syncJob.create({
    data: {
      tenantId: failedJob.tenantId,
      provider: failedJob.provider,
      scheduledAt,
      attempt: failedJob.attempt,
      maxAttempts: failedJob.maxAttempts,
      payload: failedJob.payload
        ? (failedJob.payload as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
}

/**
 * Atomically claim the next pending job for execution.
 *
 * Uses a transaction with an optimistic lock: the UPDATE includes
 * a WHERE status = "pending" clause so if another instance claimed
 * the same job between the SELECT and UPDATE, the update affects
 * zero rows and we return null.
 *
 * This prevents the TOCTOU race where two run-jobs instances
 * pick up the same job.
 */
export async function claimNextPendingJob(): Promise<SyncJob | null> {
  return prisma.$transaction(async (tx) => {
    const job = await tx.syncJob.findFirst({
      where: {
        status: "pending",
        scheduledAt: { lte: new Date() },
      },
      orderBy: { scheduledAt: "asc" },
    });

    if (!job) return null;

    // Atomic claim — WHERE status = "pending" is the optimistic lock.
    // If another instance already claimed this job (changed status to
    // "running"), updateMany returns count: 0 and we return null.
    const claimed = await tx.syncJob.updateMany({
      where: {
        id: job.id,
        status: "pending",
      },
      data: {
        status: "running",
        startedAt: new Date(),
        attempt: job.attempt + 1,
      },
    });

    if (claimed.count === 0) return null;

    // Re-fetch the updated job to return the full record
    return tx.syncJob.findUnique({ where: { id: job.id } });
  });
}
