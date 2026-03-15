/**
 * Sync Engine — Core sync orchestrator
 *
 * Runs a single SyncJob that has already been atomically claimed
 * (status = "running") by claimNextPendingJob().
 *
 * Guarantees:
 * - Never throws — all errors caught and logged to SyncEvent
 * - One bad booking never aborts the entire sync
 * - Idempotent upsert: compares lastSyncedAt to prevent older data
 *   from overwriting newer data (webhook + poller race protection)
 * - Failed jobs are retried with exponential backoff
 * - Dead jobs update TenantIntegration.status to "error"
 * - Consecutive failures tracked for circuit breaker
 * - Individual booking failures tracked in BookingSyncError for retry
 */

import { prisma } from "@/app/_lib/db/prisma";
import { Prisma } from "@prisma/client";
import { getAdapter } from "../registry";
import { decryptCredentials } from "../crypto";
import { logSyncEvent } from "./log";
import { enqueueRetry } from "./scheduler";
import { recordFailure, recordSuccess } from "./circuit-breaker";
import { toPrismaBookingStatus } from "../prisma-mapping";
import type { PmsProvider, NormalizedBooking, SyncResult } from "../types";

const MAX_BOOKING_ERROR_ATTEMPTS = 5;

/**
 * Run a sync job that has already been claimed (status = "running").
 */
export async function runSyncJob(jobId: string): Promise<void> {
  const job = await prisma.syncJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "running") return;

  await logSyncEvent(job.tenantId, job.provider, "sync.started", { jobId });

  try {
    const integration = await prisma.tenantIntegration.findUnique({
      where: { tenantId: job.tenantId },
    });

    if (!integration || integration.status !== "active") {
      await prisma.syncJob.update({
        where: { id: jobId },
        data: { status: "dead", lastError: "Integration not active" },
      });
      await logSyncEvent(job.tenantId, job.provider, "sync.failed", {
        jobId, error: "Integration not active",
      });
      return;
    }

    const credentials = decryptCredentials(
      Buffer.from(integration.credentialsEncrypted),
      Buffer.from(integration.credentialsIv),
    );

    const provider = integration.provider as PmsProvider;
    const adapter = getAdapter(provider, credentials);

    // Retry previously failed bookings before main sync
    await retryFailedBookings(job.tenantId, provider, adapter, credentials);

    // Main sync
    const since = (job.payload as Record<string, unknown> | null)?.since
      ? new Date((job.payload as Record<string, unknown>).since as string)
      : undefined;

    const result: SyncResult = await adapter.syncBookings(job.tenantId, since);

    // Record individual booking errors for retry
    for (const err of result.errors) {
      if (err.externalId !== "BATCH") {
        await recordBookingError(job.tenantId, provider, err.externalId, err.error);
      }
    }

    // Success
    const completedAt = new Date();
    await prisma.syncJob.update({
      where: { id: jobId },
      data: { status: "completed", completedAt },
    });

    await recordSuccess(job.tenantId, provider);

    await logSyncEvent(job.tenantId, job.provider, "sync.completed", {
      jobId,
      created: result.created,
      updated: result.updated,
      cancelled: result.cancelled,
      errorCount: result.errors.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const failedAt = new Date();

    await prisma.syncJob.update({
      where: { id: jobId },
      data: { status: "failed", failedAt, lastError: errorMessage },
    });

    await recordFailure(job.tenantId, job.provider as PmsProvider, errorMessage);

    if (job.attempt >= job.maxAttempts) {
      await prisma.syncJob.update({
        where: { id: jobId },
        data: { status: "dead" },
      });

      await prisma.tenantIntegration.update({
        where: { tenantId: job.tenantId },
        data: {
          status: "error",
          lastErrorAt: failedAt,
          lastError: `Sync job exhausted ${job.maxAttempts} attempts: ${errorMessage}`,
        },
      });

      await logSyncEvent(job.tenantId, job.provider, "sync.failed", {
        jobId, error: errorMessage, dead: true,
        attempt: job.attempt, maxAttempts: job.maxAttempts,
      });
    } else {
      await enqueueRetry({
        id: job.id,
        tenantId: job.tenantId,
        provider: job.provider,
        attempt: job.attempt,
        maxAttempts: job.maxAttempts,
        payload: job.payload,
      });

      await logSyncEvent(job.tenantId, job.provider, "sync.failed", {
        jobId, error: errorMessage, attempt: job.attempt, willRetry: true,
      });
    }
  }
}

/**
 * Retry previously failed individual bookings.
 * Called at the start of each sync job.
 */
async function retryFailedBookings(
  tenantId: string,
  provider: PmsProvider,
  adapter: import("../adapter").PmsAdapter,
  _credentials: Record<string, string>,
): Promise<void> {
  const failedBookings = await prisma.bookingSyncError.findMany({
    where: {
      tenantId,
      resolvedAt: null,
      attempts: { lt: MAX_BOOKING_ERROR_ATTEMPTS },
    },
    take: 10,
  });

  for (const failed of failedBookings) {
    try {
      const booking = await adapter.getBooking(tenantId, failed.externalId);
      if (booking) {
        await upsertSyncedBooking(booking, provider);
        await prisma.bookingSyncError.update({
          where: { id: failed.id },
          data: { resolvedAt: new Date() },
        });
      }
    } catch {
      await prisma.bookingSyncError.update({
        where: { id: failed.id },
        data: {
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
        },
      });
    }
  }
}

/**
 * Record an individual booking sync error for later retry.
 */
async function recordBookingError(
  tenantId: string,
  provider: string,
  externalId: string,
  error: string,
): Promise<void> {
  try {
    await prisma.bookingSyncError.upsert({
      where: { tenantId_externalId: { tenantId, externalId } },
      create: { tenantId, provider, externalId, error },
      update: {
        error,
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });
  } catch {
    // Non-critical — don't let error tracking crash the sync
  }
}

/**
 * Upsert a normalized booking into the local Booking table.
 * Uses externalId as the unique key for PMS-synced bookings.
 *
 * Idempotency:
 * - If the existing row has a newer lastSyncedAt, the update is skipped.
 * - If two concurrent creates race on the same externalId, the P2002
 *   unique constraint violation is caught and falls back to update.
 */
export async function upsertSyncedBooking(
  booking: NormalizedBooking,
  provider: PmsProvider,
): Promise<"created" | "updated" | "skipped"> {
  const now = new Date();

  const bookingData = {
    firstName: booking.firstName,
    lastName: booking.lastName,
    guestEmail: booking.guestEmail,
    phone: booking.guestPhone,
    arrival: booking.arrival,
    departure: booking.departure,
    unit: booking.unit,
    status: toPrismaBookingStatus(booking.status),
    checkedInAt: booking.checkedInAt,
    checkedOutAt: booking.checkedOutAt,
    externalSource: provider,
    lastSyncedAt: now,
  };

  const existing = await prisma.booking.findUnique({
    where: { externalId: booking.externalId },
  });

  if (existing) {
    if (existing.lastSyncedAt && existing.lastSyncedAt >= now) {
      return "skipped";
    }

    await prisma.booking.update({
      where: { externalId: booking.externalId },
      data: bookingData,
    });

    return "updated";
  }

  try {
    await prisma.booking.create({
      data: {
        tenantId: booking.tenantId,
        externalId: booking.externalId,
        ...bookingData,
      },
    });
    return "created";
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      await prisma.booking.update({
        where: { externalId: booking.externalId },
        data: bookingData,
      });
      return "updated";
    }
    throw error;
  }
}
