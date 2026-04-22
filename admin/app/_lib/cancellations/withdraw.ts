/**
 * withdrawCancellationRequest — guest or staff retracts a pending request.
 *
 * Transition: REQUESTED → CANCELED.
 * Effect:     No PMS call. No refund. No email. Booking unchanged.
 *             Terminal: a withdrawn request is absolutely final (the guest
 *             can submit a brand-new request if they change their mind).
 *
 * Only valid from REQUESTED. An OPEN request cannot be withdrawn — the
 * saga is in flight, and mid-saga withdrawal would mean reversing either
 * the PMS cancel or the Stripe refund, both of which our spec forbids.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { setSentryTenantContext } from "@/app/_lib/observability/sentry";
import { canTransitionCancellation } from "./state-machine";
import { emitCancellationEvent } from "./events";
import { CancellationError } from "./errors";
import type { CancellationInitiator } from "./types";

export async function withdrawCancellationRequest(params: {
  tenantId: string;
  cancellationRequestId: string;
  actor: CancellationInitiator;
  actorUserId?: string | null;
  now?: Date;
}): Promise<void> {
  setSentryTenantContext(params.tenantId);
  const now = params.now ?? new Date();

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

  if (!canTransitionCancellation(request.status, "CANCELED")) {
    throw new CancellationError(
      "INVALID_STATE",
      `Cannot withdraw cancellation request in status ${request.status} (only REQUESTED can be withdrawn)`,
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
      status: "CANCELED",
      canceledAt: now,
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
    type: "WITHDRAWN",
    actor: params.actor,
    actorUserId: params.actorUserId ?? null,
  });

  log("info", "cancellation.withdrawn", {
    tenantId: params.tenantId,
    cancellationRequestId: request.id,
    actor: params.actor,
  });
}
