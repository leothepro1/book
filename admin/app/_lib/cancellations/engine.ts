/**
 * Cancellation saga orchestrator.
 *
 * Called by:
 *   • approveCancellationRequest() — inline, right after REQUESTED → OPEN.
 *   • The retry-cancellation-saga cron — for OPEN rows whose nextAttemptAt
 *     has passed (transient-retry path).
 *
 * Steps (strictly sequenced):
 *   1. PMS cancel     — adapter.cancelBooking(). Transient → retry later.
 *                       Permanent → DECLINE with reason=OTHER. Idempotent
 *                       via the adapter's alreadyCanceled recognition.
 *   2. Stripe refund  — only when refundAmount > 0 AND order has a
 *                       PaymentIntent. Idempotency key = `cancellation:{id}:refund`.
 *                       Transient → retry later (PMS is already done; re-entry
 *                       is safe). Permanent → refundStatus=FAILED, keep OPEN,
 *                       alert admin. NEVER reverse the PMS cancel.
 *   3. DB commit      — single $transaction updates Order (+OrderEvent),
 *                       Booking, CancellationRequest → CLOSED.
 *   4. Email          — sendEmailEvent('BOOKING_CANCELLED'). Best-effort;
 *                       failure logged, request stays CLOSED.
 *   5. SyncEvent      — audit trail for PMS-side observability.
 *
 * Never throws to the caller. Every failure mode is persisted as either
 * a state transition or a retry marker, then the function returns.
 */

import { Prisma } from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { setSentryTenantContext } from "@/app/_lib/observability/sentry";
import { getStripe } from "@/app/_lib/stripe/client";
import { env } from "@/app/_lib/env";
import { canTransition as canTransitionOrder } from "@/app/_lib/orders/types";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { logSyncEvent } from "@/app/_lib/integrations/sync/log";

import { computeNextAttemptAt } from "./backoff";
import { emitCancellationEvent } from "./events";
import {
  acquireCancellationLock,
  releaseCancellationLock,
  type CancellationLock,
} from "./idempotency";
import {
  TransientPmsError,
  PermanentPmsError,
  TransientStripeError,
  PermanentStripeError,
} from "./errors";
import { sendBookingCancelledEmail } from "./email";
import { MAX_SAGA_ATTEMPTS } from "./types";

type SagaContext = {
  request: {
    id: string;
    tenantId: string;
    bookingId: string;
    orderId: string | null;
    attempts: number;
    version: number;
    refundAmount: number;
    cancellationFeeAmount: number;
    currency: string;
    reasonHandle: string | null;
    guestNote: string | null;
    pmsProvider: string | null;
  };
  booking: {
    id: string;
    externalId: string | null;
    status: string;
    firstName: string;
    lastName: string;
    guestEmail: string;
    checkIn: Date | null;
    arrival: Date;
    checkOut: Date | null;
    departure: Date;
  };
  order: {
    id: string;
    status: string;
    stripePaymentIntentId: string | null;
    version?: number;
  } | null;
  tenant: {
    id: string;
    name: string;
    stripeAccountId: string | null;
    stripeOnboardingComplete: boolean;
    /** Locale used for money/date formatting in the BOOKING_CANCELLED email.
     *  Hardcoded to "sv" (platform convention: Swedish is always primary). */
    defaultLocale: string;
  };
};

// ─── Entry point ─────────────────────────────────────────────────

export async function runCancellationSaga(params: {
  tenantId: string;
  cancellationRequestId: string;
  now?: Date;
}): Promise<void> {
  setSentryTenantContext(params.tenantId);
  const now = params.now ?? new Date();

  const ctx = await loadSagaContext(params);
  if (!ctx) return; // already terminal or not found — no-op
  const { request, booking } = ctx;

  // ─── Acquire lock ────────────────────────────────────────────
  const lock = await acquireCancellationLock({
    tenantId: request.tenantId,
    bookingId: booking.id,
    now,
  });
  if (!lock) {
    // Another run is in flight. Give it 5 minutes to complete; the
    // cron will re-enter after that if we're still OPEN.
    await prisma.cancellationRequest.updateMany({
      where: { id: request.id, status: "OPEN", version: request.version },
      data: { nextAttemptAt: new Date(now.getTime() + 5 * 60_000) },
    });
    log("info", "cancellation.saga.lock_held", {
      tenantId: request.tenantId,
      cancellationRequestId: request.id,
    });
    return;
  }

  try {
    await runSagaSteps(ctx, now);
  } finally {
    await releaseLockSafely(lock);
  }
}

// ─── Loading ─────────────────────────────────────────────────────

async function loadSagaContext(params: {
  tenantId: string;
  cancellationRequestId: string;
}): Promise<SagaContext | null> {
  const request = await prisma.cancellationRequest.findFirst({
    where: { id: params.cancellationRequestId, tenantId: params.tenantId },
    select: {
      id: true,
      tenantId: true,
      bookingId: true,
      orderId: true,
      status: true,
      attempts: true,
      version: true,
      refundAmount: true,
      cancellationFeeAmount: true,
      currency: true,
      reasonHandle: true,
      guestNote: true,
      pmsProvider: true,
    },
  });

  if (!request) {
    log("warn", "cancellation.saga.request_not_found", {
      tenantId: params.tenantId,
      cancellationRequestId: params.cancellationRequestId,
    });
    return null;
  }

  if (request.status !== "OPEN") {
    // Already terminal (CLOSED/DECLINED/CANCELED/EXPIRED) — saga is a no-op.
    // Happens legitimately when the cron picks up a row that was resolved
    // inline since the last sweep.
    log("info", "cancellation.saga.skipped_not_open", {
      tenantId: params.tenantId,
      cancellationRequestId: request.id,
      currentStatus: request.status,
    });
    return null;
  }

  const [booking, order, tenant] = await Promise.all([
    prisma.booking.findFirst({
      where: { id: request.bookingId, tenantId: request.tenantId },
      select: {
        id: true,
        externalId: true,
        status: true,
        firstName: true,
        lastName: true,
        guestEmail: true,
        checkIn: true,
        arrival: true,
        checkOut: true,
        departure: true,
      },
    }),
    request.orderId
      ? prisma.order.findFirst({
          where: { id: request.orderId, tenantId: request.tenantId },
          select: {
            id: true,
            status: true,
            stripePaymentIntentId: true,
          },
        })
      : Promise.resolve(null),
    prisma.tenant.findUnique({
      where: { id: request.tenantId },
      select: {
        id: true,
        name: true,
        stripeAccountId: true,
        stripeOnboardingComplete: true,
      },
    }),
  ]);

  if (!booking || !tenant) {
    log("error", "cancellation.saga.missing_fixtures", {
      tenantId: request.tenantId,
      cancellationRequestId: request.id,
      hasBooking: Boolean(booking),
      hasTenant: Boolean(tenant),
    });
    return null;
  }

  return {
    request: {
      id: request.id,
      tenantId: request.tenantId,
      bookingId: request.bookingId,
      orderId: request.orderId,
      attempts: request.attempts,
      version: request.version,
      refundAmount: request.refundAmount,
      cancellationFeeAmount: request.cancellationFeeAmount,
      currency: request.currency,
      reasonHandle: request.reasonHandle,
      guestNote: request.guestNote,
      pmsProvider: request.pmsProvider,
    },
    booking,
    order,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      stripeAccountId: tenant.stripeAccountId,
      stripeOnboardingComplete: tenant.stripeOnboardingComplete,
      // Swedish is platform primary (CLAUDE.md Translation invariant #9).
      defaultLocale: "sv",
    },
  };
}

// ─── Step runner ─────────────────────────────────────────────────

async function runSagaSteps(ctx: SagaContext, now: Date): Promise<void> {
  const attemptNumber = ctx.request.attempts + 1;

  // Count this attempt before the work starts so transient-retry
  // bookkeeping is consistent even on unexpected crashes.
  await prisma.cancellationRequest.update({
    where: { id: ctx.request.id },
    data: {
      attempts: { increment: 1 },
      lastAttemptAt: now,
    },
  });

  // ─── STEP 1: PMS cancel ──────────────────────────────────────
  const pmsResult = await runPmsCancelStep(ctx, attemptNumber, now);
  if (pmsResult === "retry") return;
  if (pmsResult === "declined") return;

  // ─── STEP 2: Stripe refund (conditional) ─────────────────────
  let stripeRefund: Stripe.Refund | null = null;
  if (ctx.request.refundAmount > 0 && ctx.order?.stripePaymentIntentId) {
    const stripeResult = await runStripeRefundStep(ctx, attemptNumber, now);
    if (stripeResult.outcome === "retry") return;
    if (stripeResult.outcome === "permanent_failed") return;
    stripeRefund = stripeResult.refund;
  }

  // ─── STEP 3: DB commit ───────────────────────────────────────
  await commitFinalState(ctx, stripeRefund, now);

  // ─── STEP 4: Email (best-effort) ─────────────────────────────
  await sendClosingEmail(ctx);

  // ─── STEP 5: SyncEvent audit ─────────────────────────────────
  if (ctx.request.pmsProvider) {
    await logSyncEvent(
      ctx.request.tenantId,
      ctx.request.pmsProvider,
      "booking.cancelled",
      {
        cancellationRequestId: ctx.request.id,
        bookingExternalId: ctx.booking.externalId,
      },
      ctx.booking.externalId ?? undefined,
    );
  }

  log("info", "cancellation.saga.completed", {
    tenantId: ctx.request.tenantId,
    cancellationRequestId: ctx.request.id,
    bookingId: ctx.booking.id,
    orderId: ctx.order?.id ?? null,
    refunded: stripeRefund !== null,
  });
}

// ─── Step 1: PMS cancel ──────────────────────────────────────────

type PmsStepOutcome = "success" | "retry" | "declined";

async function runPmsCancelStep(
  ctx: SagaContext,
  attemptNumber: number,
  now: Date,
): Promise<PmsStepOutcome> {
  await emitCancellationEvent(prisma, {
    cancellationRequestId: ctx.request.id,
    tenantId: ctx.request.tenantId,
    type: "PMS_CANCEL_ATTEMPTED",
    actor: "SYSTEM",
    metadata: { attempt: attemptNumber },
  });

  if (!ctx.booking.externalId) {
    // Manual-adapter tenants may have no PMS externalId at all. Skip
    // the PMS call entirely — there's nothing to cancel upstream.
    await emitCancellationEvent(prisma, {
      cancellationRequestId: ctx.request.id,
      tenantId: ctx.request.tenantId,
      type: "PMS_CANCEL_SUCCEEDED",
      actor: "SYSTEM",
      message: "No externalId — PMS step skipped (Manual or pre-sync booking)",
    });
    await prisma.cancellationRequest.update({
      where: { id: ctx.request.id },
      data: { pmsCanceledAt: now },
    });
    return "success";
  }

  const note = [
    ctx.request.reasonHandle ? `reason=${ctx.request.reasonHandle}` : null,
    ctx.request.guestNote ? `note=${ctx.request.guestNote}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const adapter = await resolveAdapter(ctx.request.tenantId);
    const pmsResult = await adapter.cancelBooking(ctx.request.tenantId, {
      bookingExternalId: ctx.booking.externalId,
      idempotencyKey: `cancellation:${ctx.request.id}:attempt:${attemptNumber}`,
      chargeFee: false,
      sendGuestEmail: false,
      note: note || undefined,
    });

    await prisma.cancellationRequest.update({
      where: { id: ctx.request.id },
      data: {
        pmsCanceledAt: pmsResult.canceledAtPms,
        pmsExternalFeeItemId: pmsResult.pmsFeeItemId ?? null,
      },
    });

    await emitCancellationEvent(prisma, {
      cancellationRequestId: ctx.request.id,
      tenantId: ctx.request.tenantId,
      type: "PMS_CANCEL_SUCCEEDED",
      actor: "SYSTEM",
      metadata: {
        alreadyCanceled: pmsResult.alreadyCanceled,
        attempt: attemptNumber,
      },
    });
    return "success";
  } catch (err) {
    const isTransient = err instanceof TransientPmsError;
    const isPermanent = err instanceof PermanentPmsError;
    const errMessage = err instanceof Error ? err.message : String(err);

    await emitCancellationEvent(prisma, {
      cancellationRequestId: ctx.request.id,
      tenantId: ctx.request.tenantId,
      type: "PMS_CANCEL_FAILED",
      actor: "SYSTEM",
      message: errMessage,
      metadata: {
        attempt: attemptNumber,
        transient: isTransient,
        permanent: isPermanent,
      },
    });

    // Permanent or max-attempts exhausted: DECLINE the request.
    if (isPermanent || attemptNumber >= MAX_SAGA_ATTEMPTS) {
      await declineDueToPmsFailure(ctx, errMessage, now, isPermanent);
      return "declined";
    }

    // Transient: schedule retry.
    const nextAttemptAt = computeNextAttemptAt(attemptNumber, now);
    await prisma.cancellationRequest.update({
      where: { id: ctx.request.id },
      data: { nextAttemptAt },
    });

    log("warn", "cancellation.saga.pms_transient", {
      tenantId: ctx.request.tenantId,
      cancellationRequestId: ctx.request.id,
      attempt: attemptNumber,
      nextAttemptAt: nextAttemptAt?.toISOString() ?? null,
      error: errMessage,
    });
    return "retry";
  }
}

async function declineDueToPmsFailure(
  ctx: SagaContext,
  errorMessage: string,
  now: Date,
  isPermanent: boolean,
): Promise<void> {
  const declineNote = isPermanent
    ? `PMS refused the cancellation: ${errorMessage}`.slice(0, 500)
    : `PMS cancellation failed after ${MAX_SAGA_ATTEMPTS} attempts. Last error: ${errorMessage}`.slice(0, 500);

  await prisma.cancellationRequest.updateMany({
    where: { id: ctx.request.id, status: "OPEN" },
    data: {
      status: "DECLINED",
      declineReason: "OTHER",
      declineNote,
      declinedAt: now,
      nextAttemptAt: null,
      version: { increment: 1 },
    },
  });

  await emitCancellationEvent(prisma, {
    cancellationRequestId: ctx.request.id,
    tenantId: ctx.request.tenantId,
    type: "DECLINED",
    actor: "SYSTEM",
    message: declineNote,
    metadata: { reason: "saga_pms_escalation" },
  });

  log("error", "cancellation.saga.declined_pms_failure", {
    tenantId: ctx.request.tenantId,
    cancellationRequestId: ctx.request.id,
    permanent: isPermanent,
    error: errorMessage,
  });
}

// ─── Step 2: Stripe refund ───────────────────────────────────────

type StripeStepResult =
  | { outcome: "success"; refund: Stripe.Refund }
  | { outcome: "retry" }
  | { outcome: "permanent_failed" };

async function runStripeRefundStep(
  ctx: SagaContext,
  attemptNumber: number,
  now: Date,
): Promise<StripeStepResult> {
  const paymentIntentId = ctx.order?.stripePaymentIntentId;
  if (!paymentIntentId) {
    // Caller should have filtered this out — defensive branch.
    return { outcome: "success" } as unknown as StripeStepResult;
  }

  await emitCancellationEvent(prisma, {
    cancellationRequestId: ctx.request.id,
    tenantId: ctx.request.tenantId,
    type: "REFUND_INITIATED",
    actor: "SYSTEM",
    metadata: {
      refundAmountOre: ctx.request.refundAmount,
      currency: ctx.request.currency,
    },
  });

  await prisma.cancellationRequest.update({
    where: { id: ctx.request.id },
    data: { refundStatus: "PROCESSING" },
  });

  // Connect params: only in production with an onboarded tenant.
  const stripe = getStripe();
  const useConnect =
    !env.STRIPE_SECRET_KEY.startsWith("sk_test_") &&
    ctx.tenant.stripeAccountId !== null &&
    ctx.tenant.stripeOnboardingComplete;
  const connectParams = useConnect
    ? { stripeAccount: ctx.tenant.stripeAccountId as string }
    : undefined;

  try {
    // Retrieve the PaymentIntent to get the latest_charge ID. Refunds
    // against a charge are more deterministic than against the PI.
    const pi = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      connectParams,
    );
    const chargeId = pi.latest_charge as string | null;
    if (!chargeId) {
      // PI has no charge — nothing to refund. Treat as success with
      // zero-refund: rare edge case (e.g. payment never captured).
      await emitCancellationEvent(prisma, {
        cancellationRequestId: ctx.request.id,
        tenantId: ctx.request.tenantId,
        type: "REFUND_FAILED",
        actor: "SYSTEM",
        message: "PaymentIntent has no latest_charge — cannot refund",
      });
      await prisma.cancellationRequest.update({
        where: { id: ctx.request.id },
        data: { refundStatus: "NOT_APPLICABLE" },
      });
      return { outcome: "success" } as StripeStepResult;
    }

    // Idempotency key WITHOUT attempt suffix: Stripe returns the same
    // refund on a replay, which is what we want after a crash between
    // refund creation and DB commit.
    const refund = await stripe.refunds.create(
      {
        charge: chargeId,
        amount: ctx.request.refundAmount,
        reason: "requested_by_customer",
      },
      {
        ...connectParams,
        idempotencyKey: `cancellation:${ctx.request.id}:refund`,
      },
    );

    await emitCancellationEvent(prisma, {
      cancellationRequestId: ctx.request.id,
      tenantId: ctx.request.tenantId,
      type: "REFUND_SUCCEEDED",
      actor: "SYSTEM",
      metadata: {
        stripeRefundId: refund.id,
        refundedAmountOre: refund.amount,
      },
    });

    return { outcome: "success", refund };
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    const classified = classifyStripeError(err);

    await emitCancellationEvent(prisma, {
      cancellationRequestId: ctx.request.id,
      tenantId: ctx.request.tenantId,
      type: "REFUND_FAILED",
      actor: "SYSTEM",
      message: errMessage,
      metadata: {
        attempt: attemptNumber,
        classification: classified,
      },
    });

    if (classified === "transient" && attemptNumber < MAX_SAGA_ATTEMPTS) {
      const nextAttemptAt = computeNextAttemptAt(attemptNumber, now);
      await prisma.cancellationRequest.update({
        where: { id: ctx.request.id },
        data: {
          refundStatus: "PENDING",
          nextAttemptAt,
        },
      });
      log("warn", "cancellation.saga.stripe_transient", {
        tenantId: ctx.request.tenantId,
        cancellationRequestId: ctx.request.id,
        attempt: attemptNumber,
        error: errMessage,
      });
      return { outcome: "retry" };
    }

    // Permanent or exhausted retries: keep OPEN, mark refundStatus=FAILED,
    // alert admin. NEVER reverse the PMS cancel.
    await prisma.cancellationRequest.update({
      where: { id: ctx.request.id },
      data: {
        refundStatus: "FAILED",
        nextAttemptAt: null,
      },
    });
    log("error", "cancellation.saga.refund_failed_manual_action_required", {
      tenantId: ctx.request.tenantId,
      cancellationRequestId: ctx.request.id,
      paymentIntentId,
      refundAmountOre: ctx.request.refundAmount,
      error: errMessage,
      classification: classified,
    });
    return { outcome: "permanent_failed" };
  }
}

function classifyStripeError(err: unknown): "transient" | "permanent" {
  if (err instanceof TransientStripeError) return "transient";
  if (err instanceof PermanentStripeError) return "permanent";

  // Stripe SDK errors expose .type on the raw error. We only classify
  // the ones where the right action is obvious; everything else is
  // treated as transient so the saga retries — we'd rather pay a few
  // extra retry attempts than silently lose a refund.
  const type = (err as { type?: string })?.type;
  switch (type) {
    case "StripeConnectionError":
    case "StripeAPIError":
    case "StripeRateLimitError":
      return "transient";
    case "StripeInvalidRequestError":
    case "StripeAuthenticationError":
    case "StripePermissionError":
      return "permanent";
    default:
      return "transient";
  }
}

// ─── Step 3: DB commit ───────────────────────────────────────────

async function commitFinalState(
  ctx: SagaContext,
  refund: Stripe.Refund | null,
  now: Date,
): Promise<void> {
  const refundSucceeded = refund !== null;
  const targetOrderStatus: "REFUNDED" | "CANCELLED" = refundSucceeded
    ? "REFUNDED"
    : "CANCELLED";

  await prisma.$transaction(async (tx) => {
    // ── Order + OrderEvent ────────────────────────────────────
    if (ctx.order) {
      const freshOrder = await tx.order.findUnique({
        where: { id: ctx.order.id },
        select: { id: true, status: true },
      });

      if (
        freshOrder &&
        canTransitionOrder(
          freshOrder.status,
          refundSucceeded ? "REFUNDED" : "CANCELLED",
        )
      ) {
        await tx.order.update({
          where: { id: ctx.order.id },
          data: {
            status: targetOrderStatus,
            cancelledAt: now,
            refundedAt: refundSucceeded ? now : null,
            ...(refundSucceeded && {
              financialStatus: "REFUNDED",
            }),
          },
        });

        await tx.orderEvent.create({
          data: {
            orderId: ctx.order.id,
            tenantId: ctx.request.tenantId,
            type: "ORDER_CANCELLED",
            message: "Cancelled via cancellation engine",
            metadata: {
              cancellationRequestId: ctx.request.id,
            } as Prisma.InputJsonValue,
          },
        });

        if (refundSucceeded && refund) {
          await tx.orderEvent.create({
            data: {
              orderId: ctx.order.id,
              tenantId: ctx.request.tenantId,
              type: "REFUND_SUCCEEDED",
              message: `Refunded ${refund.amount} ${ctx.request.currency}`,
              metadata: {
                stripeRefundId: refund.id,
                refundAmountOre: refund.amount,
                cancellationRequestId: ctx.request.id,
              } as Prisma.InputJsonValue,
            },
          });
        }
      }
    }

    // ── Booking status → CANCELLED ────────────────────────────
    // Status-based guard prevents double-write if another path
    // already cancelled this booking (e.g. PMS webhook).
    await tx.booking.updateMany({
      where: {
        id: ctx.booking.id,
        tenantId: ctx.request.tenantId,
        status: { notIn: ["CANCELLED", "COMPLETED"] },
      },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
      },
    });

    // ── CancellationRequest → CLOSED ──────────────────────────
    await tx.cancellationRequest.update({
      where: { id: ctx.request.id },
      data: {
        status: "CLOSED",
        closedAt: now,
        nextAttemptAt: null,
        stripeRefundId: refund?.id ?? null,
        refundedAt: refund ? now : null,
        refundStatus: refund
          ? "SUCCEEDED"
          : ctx.request.refundAmount === 0
            ? "NOT_APPLICABLE"
            : "NOT_APPLICABLE",
        version: { increment: 1 },
      },
    });

    await emitCancellationEvent(tx, {
      cancellationRequestId: ctx.request.id,
      tenantId: ctx.request.tenantId,
      type: "CLOSED",
      actor: "SYSTEM",
      metadata: {
        refunded: refundSucceeded,
        stripeRefundId: refund?.id ?? null,
      },
    });
  });
}

// ─── Step 4: Email ───────────────────────────────────────────────

async function sendClosingEmail(ctx: SagaContext): Promise<void> {
  const outcome = await sendBookingCancelledEmail({
    tenantId: ctx.request.tenantId,
    to: ctx.booking.guestEmail,
    variables: {
      guestName: ctx.booking.firstName,
      hotelName: ctx.tenant.name,
      bookingRef: ctx.booking.externalId ?? ctx.booking.id,
      cancellationReason: ctx.request.reasonHandle ?? "",
      refundAmount: formatMoney(
        ctx.request.refundAmount,
        ctx.request.currency,
        ctx.tenant.defaultLocale,
      ),
      feeAmount: formatMoney(
        ctx.request.cancellationFeeAmount,
        ctx.request.currency,
        ctx.tenant.defaultLocale,
      ),
      currency: ctx.request.currency,
      checkIn: formatDate(
        ctx.booking.checkIn ?? ctx.booking.arrival,
        ctx.tenant.defaultLocale,
      ),
      checkOut: formatDate(
        ctx.booking.checkOut ?? ctx.booking.departure,
        ctx.tenant.defaultLocale,
      ),
    },
  });

  await emitCancellationEvent(prisma, {
    cancellationRequestId: ctx.request.id,
    tenantId: ctx.request.tenantId,
    type: outcome.ok ? "EMAIL_SENT" : "EMAIL_FAILED",
    actor: "SYSTEM",
    message: outcome.ok
      ? "BOOKING_CANCELLED email sent"
      : outcome.skipped
        ? "Email skipped (unsubscribed / rate-limited / event disabled)"
        : outcome.error,
  });
}

// ─── Small formatting helpers (no DB, no IO) ─────────────────────

function formatMoney(ore: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(ore / 100);
  } catch {
    return `${(ore / 100).toFixed(2)} ${currency}`;
  }
}

function formatDate(date: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

// ─── Lock-release safety ─────────────────────────────────────────

async function releaseLockSafely(lock: CancellationLock): Promise<void> {
  try {
    await releaseCancellationLock(lock);
  } catch (err) {
    // Lock release failure is non-fatal: TTL will clean up within 120s.
    log("warn", "cancellation.saga.lock_release_failed", {
      tenantId: lock.tenantId,
      lockId: lock.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
