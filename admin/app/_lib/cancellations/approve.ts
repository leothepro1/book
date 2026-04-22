/**
 * approveCancellationRequest — transitions REQUESTED → OPEN and runs
 * the saga inline. Returns the final state seen by the caller.
 *
 * Caller sees one of:
 *   • status: "CLOSED"   — saga completed: PMS cancelled + (optional) refund
 *                           issued + booking flipped + email sent.
 *   • status: "DECLINED" — saga hit a permanent PMS failure and we auto-
 *                           declined with decline reason=OTHER.
 *   • status: "OPEN"     — saga hit a transient error; nextAttemptAt is
 *                           set and the retry cron will take it forward.
 *                           Caller can optionally reload later.
 *
 * The inline-await design matches Shopify's returnApproveRequest flow:
 * the mutation response reflects the outcome, not a "queued" ack.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { setSentryTenantContext } from "@/app/_lib/observability/sentry";
import { canTransitionCancellation } from "./state-machine";
import { emitCancellationEvent } from "./events";
import { CancellationError } from "./errors";
import type { CancellationInitiator, CancellationStatus } from "./types";
import { runCancellationSaga } from "./engine";

export async function approveCancellationRequest(params: {
  tenantId: string;
  cancellationRequestId: string;
  actor: CancellationInitiator;
  actorUserId?: string | null;
  now?: Date;
}): Promise<{ id: string; status: CancellationStatus }> {
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

  if (!canTransitionCancellation(request.status, "OPEN")) {
    throw new CancellationError(
      "INVALID_STATE",
      `Cannot approve cancellation request in status ${request.status}`,
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
      status: "OPEN",
      approvedAt: now,
      expiresAt: null,
      nextAttemptAt: now,
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
    type: "APPROVED",
    actor: params.actor,
    actorUserId: params.actorUserId ?? null,
  });

  log("info", "cancellation.approved", {
    tenantId: params.tenantId,
    cancellationRequestId: request.id,
    actor: params.actor,
    actorUserId: params.actorUserId ?? null,
  });

  // Run the saga inline. Saga handles its own error surface: transient
  // failures leave status=OPEN with nextAttemptAt set; permanent ones
  // transition to DECLINED. runCancellationSaga never throws to the
  // caller — it returns after persisting whatever terminal or interim
  // state was reached.
  await runCancellationSaga({
    tenantId: params.tenantId,
    cancellationRequestId: request.id,
    now,
  });

  const after = await prisma.cancellationRequest.findUnique({
    where: { id: request.id },
    select: { id: true, status: true },
  });

  return after ?? { id: request.id, status: "OPEN" };
}
