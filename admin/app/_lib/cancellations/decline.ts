/**
 * declineCancellationRequest — staff rejects a pending request.
 *
 * Transition: REQUESTED → DECLINED.
 * Effect:     Booking stays unchanged; no PMS call; no refund; no email
 *             in Phase 1 (Phase 4 wires the decline-notification template).
 * Restart:    DECLINED is terminal-but-restartable — the guest may submit
 *             a fresh request.
 *
 * Concurrency: the UPDATE carries WHERE status = 'REQUESTED' AND version = X
 * so a simultaneous approve/decline/withdraw lands on zero rows; the loser
 * sees `INVALID_STATE` and must re-read.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { setSentryTenantContext } from "@/app/_lib/observability/sentry";
import { canTransitionCancellation } from "./state-machine";
import { emitCancellationEvent } from "./events";
import { CancellationError } from "./errors";
import type {
  CancellationDeclineReason,
  CancellationInitiator,
} from "./types";
import { DECLINE_NOTE_MAX_LENGTH } from "./types";

export async function declineCancellationRequest(params: {
  tenantId: string;
  cancellationRequestId: string;
  actor: CancellationInitiator;
  actorUserId?: string | null;
  declineReason: CancellationDeclineReason;
  declineNote?: string;
  now?: Date;
}): Promise<void> {
  setSentryTenantContext(params.tenantId);
  const now = params.now ?? new Date();

  if (params.declineNote && params.declineNote.length > DECLINE_NOTE_MAX_LENGTH) {
    throw new CancellationError(
      "PRECONDITION_FAILED",
      `declineNote exceeds ${DECLINE_NOTE_MAX_LENGTH} chars`,
    );
  }

  const request = await prisma.cancellationRequest.findFirst({
    where: { id: params.cancellationRequestId, tenantId: params.tenantId },
    select: { id: true, status: true, version: true },
  });

  if (!request) {
    throw new CancellationError(
      "NOT_FOUND",
      `CancellationRequest ${params.cancellationRequestId} not found for tenant ${params.tenantId}`,
    );
  }

  if (!canTransitionCancellation(request.status, "DECLINED")) {
    throw new CancellationError(
      "INVALID_STATE",
      `Cannot decline cancellation request in status ${request.status}`,
    );
  }

  const updated = await prisma.cancellationRequest.updateMany({
    where: {
      id: request.id,
      tenantId: params.tenantId,
      status: "REQUESTED",
      version: request.version,
    },
    data: {
      status: "DECLINED",
      declineReason: params.declineReason,
      declineNote: params.declineNote ?? null,
      declinedAt: now,
      expiresAt: null,
      version: { increment: 1 },
    },
  });

  if (updated.count === 0) {
    throw new CancellationError(
      "INVALID_STATE",
      "CancellationRequest was modified concurrently — please re-read and retry",
    );
  }

  await emitCancellationEvent(prisma, {
    cancellationRequestId: request.id,
    tenantId: params.tenantId,
    type: "DECLINED",
    actor: params.actor,
    actorUserId: params.actorUserId ?? null,
    message: params.declineNote ?? null,
    metadata: { declineReason: params.declineReason },
  });

  log("info", "cancellation.declined", {
    tenantId: params.tenantId,
    cancellationRequestId: request.id,
    declineReason: params.declineReason,
    actor: params.actor,
    actorUserId: params.actorUserId ?? null,
  });
}
