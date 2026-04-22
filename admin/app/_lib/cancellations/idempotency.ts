/**
 * Cancellation saga idempotency lock.
 *
 * Guards against concurrent saga runs on the same booking. Examples:
 *   • Retry-cron kicks in while an inline approve-saga is still running.
 *   • An admin double-clicks "approve" before the first saga completes.
 *   • Two webhook deliveries from the PMS land at the same time.
 *
 * Implementation: a row in PendingCancellationLock with a 120s TTL and
 * a UNIQUE (tenantId, dedupKey) constraint. Acquire inserts; if it
 * collides with an unexpired row, the caller yields. The cleanup-
 * idempotency-keys cron deletes rows whose expiresAt is in the past.
 *
 * Parallels the existing PendingBookingLock pattern used for booking
 * creation, so operators already understand the mental model.
 */

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { CANCELLATION_LOCK_TTL_MS } from "./types";

export type CancellationLock = {
  id: string;
  tenantId: string;
  bookingId: string;
  dedupKey: string;
  expiresAt: Date;
};

function computeDedupKey(tenantId: string, bookingId: string): string {
  return createHash("sha256")
    .update(`${tenantId}:${bookingId}`)
    .digest("hex");
}

/**
 * Try to acquire the lock. Returns the lock row on success, or null if
 * another saga holds it. A lock stuck from a crashed previous run is
 * reclaimed automatically once its expiresAt passes (by the cleanup cron)
 * OR on-demand here when we detect an expired collision.
 */
export async function acquireCancellationLock(params: {
  tenantId: string;
  bookingId: string;
  now?: Date;
}): Promise<CancellationLock | null> {
  const now = params.now ?? new Date();
  const dedupKey = computeDedupKey(params.tenantId, params.bookingId);
  const expiresAt = new Date(now.getTime() + CANCELLATION_LOCK_TTL_MS);

  try {
    const row = await prisma.pendingCancellationLock.create({
      data: {
        tenantId: params.tenantId,
        bookingId: params.bookingId,
        dedupKey,
        expiresAt,
      },
    });
    return row;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Collision — check whether the holder's lock is expired, and if
      // so, replace it atomically. This lets us recover from a crashed
      // saga that died before releasing its lock.
      const existing = await prisma.pendingCancellationLock.findUnique({
        where: {
          tenantId_dedupKey: { tenantId: params.tenantId, dedupKey },
        },
      });
      if (!existing) {
        // Race — someone released between the collision and our lookup.
        // Next cron tick will retry; log once and bail.
        log("warn", "cancellation.lock.race_no_existing", {
          tenantId: params.tenantId,
          bookingId: params.bookingId,
        });
        return null;
      }
      if (existing.expiresAt.getTime() > now.getTime()) {
        // Valid live lock held by someone else.
        return null;
      }
      // Expired lock — steal it. Atomic swap via deleteMany + create.
      const deletedCount = await prisma.pendingCancellationLock.deleteMany({
        where: { id: existing.id, expiresAt: { lte: now } },
      });
      if (deletedCount.count === 0) {
        // Someone refreshed or released between our findUnique and now.
        return null;
      }
      try {
        return await prisma.pendingCancellationLock.create({
          data: {
            tenantId: params.tenantId,
            bookingId: params.bookingId,
            dedupKey,
            expiresAt,
          },
        });
      } catch (createErr) {
        if (
          createErr instanceof Prisma.PrismaClientKnownRequestError &&
          createErr.code === "P2002"
        ) {
          // Another contender stole it before us — yield.
          return null;
        }
        throw createErr;
      }
    }
    throw err;
  }
}

export async function releaseCancellationLock(
  lock: CancellationLock,
): Promise<void> {
  await prisma.pendingCancellationLock.deleteMany({
    where: { id: lock.id },
  });
}
