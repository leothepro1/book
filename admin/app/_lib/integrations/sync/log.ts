/**
 * Sync Event Logger
 *
 * Append-only audit log for all PMS sync activity.
 * Never throws — logging failures are silently caught
 * to prevent cascading failures in the sync engine.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { Prisma } from "@prisma/client";
import type { SyncEventType } from "../types";

export async function logSyncEvent(
  tenantId: string,
  provider: string,
  eventType: SyncEventType,
  payload?: Record<string, unknown>,
  bookingExternalId?: string,
  error?: string,
): Promise<void> {
  try {
    await prisma.syncEvent.create({
      data: {
        tenantId,
        provider,
        eventType,
        bookingExternalId: bookingExternalId ?? null,
        payload: payload
          ? (payload as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        error: error ?? null,
      },
    });
  } catch (e) {
    // Never throw from the logger — log to console as last resort
    console.error("[SyncEvent] Failed to write audit log:", e);
  }
}
