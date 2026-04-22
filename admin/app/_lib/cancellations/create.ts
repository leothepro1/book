/**
 * createCancellationRequest — entry point for guest/admin/PMS/system
 * initiated cancellations.
 *
 * Guarantees:
 *   • At most ONE non-terminal request per booking (enforced by partial
 *     unique index; we catch the collision and translate to INVALID_STATE).
 *   • Fee + refund amounts are computed from the booking's frozen
 *     policy snapshot and STORED on the new row. The saga never recomputes
 *     them — what the guest saw in the preview is what they get.
 *   • expiresAt is set to requestedAt + policy.autoExpireHours so the
 *     auto-expire cron can clean up abandoned reviews.
 *
 * Auto-approve: when policy.requireApproval is false, the saga runs
 * inline immediately — the caller awaits the full outcome. This matches
 * Shopify's behaviour for returnRequest on stores with auto-approval.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { setSentryTenantContext } from "@/app/_lib/observability/sentry";
import { calculateCancellation } from "./calculate";
import { emitCancellationEvent } from "./events";
import { approveCancellationRequest } from "./approve";
import { CancellationError } from "./errors";
import { GUEST_NOTE_MAX_LENGTH } from "./types";
import type { CancellationInitiator } from "./types";

/** Booking statuses from which a cancellation may be initiated in Phase 1. */
const CANCELLABLE_BOOKING_STATUSES = ["PRE_CHECKIN"] as const;

export async function createCancellationRequest(params: {
  tenantId: string;
  bookingId: string;
  initiator: CancellationInitiator;
  initiatorUserId?: string | null;
  reasonHandle?: string | null;
  guestNote?: string;
  now?: Date;
}): Promise<{ id: string; status: string; autoApproved: boolean }> {
  setSentryTenantContext(params.tenantId);
  const now = params.now ?? new Date();

  if (params.guestNote && params.guestNote.length > GUEST_NOTE_MAX_LENGTH) {
    throw new CancellationError(
      "PRECONDITION_FAILED",
      `guestNote exceeds ${GUEST_NOTE_MAX_LENGTH} chars`,
    );
  }

  // ─── Load booking + order ────────────────────────────────────
  const booking = await prisma.booking.findFirst({
    where: { id: params.bookingId, tenantId: params.tenantId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      checkIn: true,
      arrival: true,
      orderId: true,
      cancellationPolicySnapshot: true,
    },
  });

  if (!booking) {
    throw new CancellationError(
      "NOT_FOUND",
      `Booking ${params.bookingId} not found for tenant ${params.tenantId}`,
    );
  }

  if (!CANCELLABLE_BOOKING_STATUSES.includes(
    booking.status as (typeof CANCELLABLE_BOOKING_STATUSES)[number],
  )) {
    throw new CancellationError(
      "BOOKING_NOT_CANCELLABLE",
      `Booking status ${booking.status} is not cancellable (only PRE_CHECKIN supported in Phase 1)`,
    );
  }

  // Order is optional — Manual-adapter tenants may have unpaid bookings
  // that were created directly without an Order. In that case the saga
  // has nothing to refund and the request's refundAmount is 0.
  const order = booking.orderId
    ? await prisma.order.findFirst({
        where: { id: booking.orderId, tenantId: params.tenantId },
        select: {
          id: true,
          status: true,
          totalAmount: true,
          currency: true,
          stripePaymentIntentId: true,
        },
      })
    : null;

  const orderTotalOre = order?.totalAmount ?? 0;
  const currency = order?.currency ?? "SEK";

  // ─── Compute fee + refund ────────────────────────────────────
  const calc = calculateCancellation({
    booking: {
      cancellationPolicySnapshot: booking.cancellationPolicySnapshot,
      checkIn: booking.checkIn,
      arrival: booking.arrival,
    },
    orderTotalAmountOre: orderTotalOre,
    currency,
    now,
  });

  const expiresAt = new Date(
    now.getTime() + calc.requestSnapshot.autoExpireHours * 3_600_000,
  );

  // ─── Resolve tenant PMS provider (denormalized snapshot) ─────
  const integration = await prisma.tenantIntegration.findUnique({
    where: { tenantId: params.tenantId },
    select: { provider: true, status: true },
  });
  const pmsProvider =
    integration && integration.status === "active"
      ? integration.provider
      : null;

  // ─── Create the row (partial unique index catches concurrent dupes) ──
  let requestId: string;
  try {
    const created = await prisma.cancellationRequest.create({
      data: {
        tenantId: params.tenantId,
        bookingId: booking.id,
        orderId: order?.id ?? null,
        status: "REQUESTED",
        initiator: params.initiator,
        initiatorUserId: params.initiatorUserId ?? null,
        reasonHandle: params.reasonHandle ?? null,
        guestNote: params.guestNote ?? null,
        originalAmount: orderTotalOre,
        cancellationFeeAmount: calc.feeAmountOre,
        refundAmount: calc.refundAmountOre,
        currency: calc.currency,
        policySnapshot: calc.requestSnapshot as unknown as Prisma.InputJsonValue,
        pmsProvider,
        requestedAt: now,
        expiresAt,
      },
      select: { id: true },
    });
    requestId = created.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new CancellationError(
        "INVALID_STATE",
        `Booking ${booking.id} already has an active cancellation request`,
        err,
      );
    }
    throw err;
  }

  await emitCancellationEvent(prisma, {
    cancellationRequestId: requestId,
    tenantId: params.tenantId,
    type: "REQUESTED",
    actor: params.initiator,
    actorUserId: params.initiatorUserId ?? null,
    message: params.reasonHandle ?? null,
    metadata: {
      feeAmountOre: calc.feeAmountOre,
      refundAmountOre: calc.refundAmountOre,
      currency: calc.currency,
      appliedTier: calc.requestSnapshot.appliedTier,
      hoursBeforeCheckInAtRequest: calc.requestSnapshot.hoursBeforeCheckInAtRequest,
    },
  });

  log("info", "cancellation.created", {
    tenantId: params.tenantId,
    cancellationRequestId: requestId,
    bookingId: booking.id,
    orderId: order?.id ?? null,
    feeAmountOre: calc.feeAmountOre,
    refundAmountOre: calc.refundAmountOre,
    requireApproval: calc.requestSnapshot.requireApproval,
    initiator: params.initiator,
  });

  // ─── Auto-approve when policy permits ───────────────────────
  if (!calc.requestSnapshot.requireApproval) {
    const final = await approveCancellationRequest({
      tenantId: params.tenantId,
      cancellationRequestId: requestId,
      actor: params.initiator,
      actorUserId: params.initiatorUserId ?? null,
      now,
    });
    return { id: requestId, status: final.status, autoApproved: true };
  }

  return { id: requestId, status: "REQUESTED", autoApproved: false };
}
