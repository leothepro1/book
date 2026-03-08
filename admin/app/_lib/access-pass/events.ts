/**
 * Audit event helpers for AccessPass.
 *
 * All events are append-only — never updated or deleted.
 * Every state change, validation attempt, and render operation is logged.
 */

import { prisma } from "@/app/_lib/db/prisma";
import type { AccessPassEventType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { EventContext } from "./types";

interface LogEventInput {
  tenantId: string;
  passId: string;
  type: AccessPassEventType;
  context?: EventContext;
  metadata?: Record<string, unknown>;
}

/**
 * Append an immutable audit event for an access pass.
 *
 * This function never throws — audit failures are logged but
 * must not block core operations.
 */
export async function logPassEvent({
  tenantId,
  passId,
  type,
  context,
  metadata,
}: LogEventInput): Promise<void> {
  try {
    await prisma.accessPassEvent.create({
      data: {
        tenantId,
        passId,
        type,
        actorUserId: context?.actorUserId ?? null,
        ip: context?.ip ?? null,
        userAgent: context?.userAgent ?? null,
        metadata: metadata
          ? (metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  } catch (err) {
    // Audit must never crash the caller. Log and continue.
    console.error("[AccessPass:Audit] Failed to log event", {
      tenantId,
      passId,
      type,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
