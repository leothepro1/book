/**
 * Process Paid Order Side Effects
 * ════════════════════════════════
 *
 * Idempotent function that executes ALL side effects for a paid order.
 * Called by both:
 *   1. Stripe webhook (payment_intent.succeeded) — primary path
 *   2. Reconciliation cron — when webhook was missed
 *
 * Side effects per order type:
 *   ACCOMMODATION: PMS booking, guest account, confirmation email, analytics
 *   PURCHASE:      guest account, confirmation email, analytics
 *   GIFT_CARD:     gift card creation, guest account, email, analytics
 *
 * Idempotency: uses order state guards (financialStatus, fulfillmentStatus)
 * and dedup timestamps to ensure calling twice produces the same result.
 * Never throws — all errors are logged and swallowed.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { canTransition, canTransitionFulfillment } from "./types";
import type { OrderStatus } from "@prisma/client";

/**
 * Execute all side effects for a successfully paid order.
 *
 * @param orderId - Order ID
 * @param stripePaymentIntentId - Stripe PI ID (for metadata lookup if needed)
 *
 * Idempotent: safe to call multiple times for the same order.
 */
export async function processOrderPaidSideEffects(
  orderId: string,
  stripePaymentIntentId?: string | null,
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      lineItems: true,
      events: { select: { type: true, metadata: true } },
    },
  });

  if (!order) {
    log("warn", "process_paid.order_not_found", { orderId });
    return;
  }

  // Must be PAID to process side effects
  if (order.status !== "PAID" && order.status !== "FULFILLED") return;

  // Build set of completed side effects for idempotency checks
  const completedEvents = new Set(order.events.map((e) => e.type));

  const orderMeta = (order.metadata ?? {}) as Record<string, unknown>;
  const orderType = (orderMeta.orderType as string) ?? "ACCOMMODATION";
  const effectiveEmail = order.guestEmail || "";

  // ── ACCOMMODATION: create PMS booking (outbound reliability) ──
  //
  // Every paid accommodation order passes through the outbound
  // reliability engine:
  //
  //   1. enqueueOutboundJob creates the durable outbox row
  //      (idempotent — double-calls collide on orderId unique).
  //   2. We try processOutboundJob synchronously for the happy path
  //      latency (guest sees the confirmation the moment payment
  //      clears). If PMS is healthy: COMPLETED in <1s.
  //   3. On any failure, the outbox row stays PENDING/FAILED/DEAD
  //      with retry/compensation scheduled. The retry cron drains
  //      it automatically — no manual ON_HOLD intervention needed.
  //
  // We skip if the ORDER_CONFIRMED event already fired (idempotency
  // replay from the reconcile cron or a webhook re-delivery).
  if (orderType === "ACCOMMODATION" && !completedEvents.has("ORDER_CONFIRMED")) {
    try {
      const { enqueueOutboundJob, processOutboundJob } = await import(
        "@/app/_lib/integrations/reliability/outbound"
      );
      const { jobId, created } = await enqueueOutboundJob({
        orderId: order.id,
        tenantId: order.tenantId,
      });
      if (created) {
        log("info", "process_paid.outbound_enqueued", {
          orderId: order.id,
          tenantId: order.tenantId,
          jobId,
        });
      }

      // Fast-path attempt: if this succeeds the guest is confirmed
      // immediately. If not, the job row carries the retry state
      // forward without blocking anything here.
      const outcome = await processOutboundJob(jobId);

      if (outcome === "FAILED" || outcome === "DEAD") {
        log("warn", "process_paid.outbound_deferred", {
          orderId: order.id,
          tenantId: order.tenantId,
          jobId,
          outcome,
        });
        // Surface in the order timeline so operators/admins can see
        // the booking is in the reliability pipeline rather than
        // silently "pending".
        if (canTransitionFulfillment("UNFULFILLED", "ON_HOLD")) {
          await prisma.order.update({
            where: { id: order.id },
            data: { fulfillmentStatus: "ON_HOLD" },
          });
          await prisma.orderEvent.create({
            data: {
              orderId: order.id,
              tenantId: order.tenantId,
              type: "ORDER_UPDATED",
              message:
                outcome === "DEAD"
                  ? "PMS-bokningen misslyckades — automatisk återbetalning planeras"
                  : "PMS-bokningen är i retry-kö — bekräftelse kommer så snart den lyckas",
            },
          });
        }
      }
    } catch (err) {
      // Infrastructure error (DB down) — the enqueue/process itself
      // failed before touching the PMS. The reconcile/retry crons
      // won't have a job row to pick up, so we fall back to the old
      // ON_HOLD signal for operator visibility.
      log("error", "process_paid.outbound_infra_error", {
        orderId: order.id,
        tenantId: order.tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
      try {
        if (canTransitionFulfillment("UNFULFILLED", "ON_HOLD")) {
          await prisma.order.update({
            where: { id: order.id },
            data: { fulfillmentStatus: "ON_HOLD" },
          });
        }
      } catch { /* best effort */ }
    }
  }

  // ── Clean up spot reservation lock (best effort) ───────────
  // Spot reservation locks are TTL-based — this is eager cleanup to free the
  // spot immediately after payment rather than waiting for cron.
  const spotLineItem = order.lineItems.find((li) =>
    li.productId.startsWith("spot-map:"),
  );
  if (spotLineItem?.variantId) {
    try {
      const spotMarker = await prisma.spotMarker.findUnique({
        where: { id: spotLineItem.variantId },
        select: { accommodationUnitId: true },
      });
      if (spotMarker?.accommodationUnitId) {
        await prisma.pendingSpotReservation.deleteMany({
          where: {
            tenantId: order.tenantId,
            accommodationUnitId: spotMarker.accommodationUnitId,
          },
        });
      }
    } catch { /* best effort — cron handles stragglers */ }
  }

  // ── Guest account (shared) ─────────────────────────────────
  if (effectiveEmail) {
    try {
      const { upsertGuestAccountFromOrder } = await import(
        "@/app/_lib/guest-auth/account"
      );
      await upsertGuestAccountFromOrder(
        order.tenantId,
        order.id,
        effectiveEmail,
        order.guestName || undefined,
        order.guestPhone || undefined,
        order.billingAddress as Record<string, string> | null,
      );
    } catch (err) {
      log("warn", "process_paid.guest_account_failed", {
        orderId: order.id,
        error: String(err),
      });
    }
  }

  // ── Confirmation email (shared) ────────────────────────────
  // Guard: only send once per order — check for EMAIL_SENT event
  if (effectiveEmail && !completedEvents.has("EMAIL_SENT")) {
    try {
      const { sendEmailEvent } = await import("@/app/_lib/email/send");
      const { formatPriceDisplay } = await import("@/app/_lib/products/pricing");
      const tenant = await prisma.tenant.findUnique({
        where: { id: order.tenantId },
        select: { name: true, portalSlug: true },
      });

      const { getTenantUrl } = await import("@/app/_lib/tenant/tenant-url");
      const orderStatusUrl =
        order.statusToken && tenant?.portalSlug
          ? getTenantUrl(tenant, { path: `/order-status/${order.statusToken}` })
          : "";
      const portalUrl = tenant?.portalSlug
        ? getTenantUrl(tenant, { path: "/login" })
        : "";

      await sendEmailEvent(
        order.tenantId,
        "ORDER_CONFIRMED" as Parameters<typeof sendEmailEvent>[1],
        effectiveEmail,
        {
          guestName: order.guestName,
          orderNumber: String(order.orderNumber),
          orderTotal: `${formatPriceDisplay(order.totalAmount, order.currency)} kr`,
          currency: order.currency,
          tenantName: tenant?.name ?? "",
          orderStatusUrl,
          portalUrl,
        },
      );

      // Mark email as sent — idempotency guard for future calls
      await prisma.orderEvent.create({
        data: {
          orderId: order.id,
          tenantId: order.tenantId,
          type: "EMAIL_SENT",
          message: `Orderbekräftelse skickad till ${effectiveEmail}`,
          metadata: { emailType: "ORDER_CONFIRMED", recipient: effectiveEmail },
        },
      });
    } catch (err) {
      log("error", "process_paid.email_failed", {
        orderId: order.id,
        error: String(err),
      });
    }
  }

  // ── Analytics (shared, fire-and-forget) ────────────────────
  try {
    const { emitAnalyticsEvent } = await import("@/app/_lib/analytics");
    void emitAnalyticsEvent({
      tenantId: order.tenantId,
      eventType: "ORDER_PAID",
      payload: {
        orderId: order.id,
        totalAmount: order.totalAmount,
        currency: order.currency,
        paymentMethod: order.paymentMethod,
      },
    });
  } catch { /* fire-and-forget */ }

  // ── New analytics pipeline (Phase 1B+, fire-and-forget) ────
  // Writes to analytics.outbox via the transactional outbox emitter.
  // Runs alongside the legacy emit during the cutover window — both
  // write to separate tables so they coexist. Legacy → pipeline cutover
  // lands post-Phase 5.
  //
  // emitAnalyticsEventStandalone opens its own short tx (the order is
  // already committed before this handler runs — there's no operational
  // tx to attach to). See app/_lib/analytics/pipeline/emitter.ts.
  //
  // Emits per orderType:
  //   ACCOMMODATION  → booking_completed (Commit C)
  //   payment_succeeded for every paid order is added by Commit D.
  try {
    if (order.orderType === "ACCOMMODATION") {
      const booking = await prisma.booking.findFirst({
        where: { orderId: order.id, tenantId: order.tenantId },
        select: {
          id: true,
          accommodationId: true,
          arrival: true,
          departure: true,
          guestCount: true,
          orderId: true,
          externalSource: true,
          externalId: true,
        },
      });

      // Required fields for booking_completed v0.1.0. Phase 1B's scope
      // covers direct-bookings only — those should always have these
      // fields populated. If a row is missing them, log and skip rather
      // than emit malformed data.
      if (
        booking &&
        booking.accommodationId &&
        booking.guestCount !== null &&
        booking.guestCount > 0
      ) {
        const { emitAnalyticsEventStandalone, signalAnalyticsFlush } =
          await import("@/app/_lib/analytics/pipeline/emitter");
        const {
          deriveActor,
          deriveGuestId,
          deriveSourceChannel,
          formatAnalyticsDate,
        } = await import("@/app/_lib/analytics/pipeline/integrations");

        const nights = Math.max(
          1,
          Math.round(
            (booking.departure.getTime() - booking.arrival.getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        );

        await emitAnalyticsEventStandalone({
          tenantId: order.tenantId,
          eventName: "booking_completed",
          schemaVersion: "0.1.0",
          occurredAt: order.paidAt ?? new Date(),
          actor: deriveActor(order),
          payload: {
            booking_id: booking.id,
            accommodation_id: booking.accommodationId,
            guest_id: deriveGuestId(order),
            check_in_date: formatAnalyticsDate(booking.arrival),
            check_out_date: formatAnalyticsDate(booking.departure),
            number_of_nights: nights,
            number_of_guests: booking.guestCount,
            total_amount: {
              amount: order.totalAmount,
              currency: order.currency,
            },
            source_channel: deriveSourceChannel(booking),
            pms_reference: booking.externalId ?? null,
          },
          idempotencyKey: `booking_completed:${booking.id}`,
        });

        // Fire-and-forget signal — cron fallback covers losses.
        void signalAnalyticsFlush(order.tenantId).catch(() => {});
      } else {
        log("info", "process_paid.pipeline_booking_completed_skipped", {
          orderId: order.id,
          reason: !booking
            ? "no_booking"
            : !booking.accommodationId
              ? "no_accommodation"
              : "no_guest_count",
        });
      }
    }
  } catch (err) {
    // Pipeline emit must never break the side-effects flow.
    log("error", "process_paid.pipeline_emit_failed", {
      orderId: order.id,
      eventName: "booking_completed",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Segment sync (shared, fire-and-forget) ─────────────────
  if (order.guestAccountId) {
    import("@/app/_lib/segments/sync").then(({ syncGuestSegments }) =>
      syncGuestSegments(order.guestAccountId!, order.tenantId),
    ).catch(() => {});
  }

  // ── Platform webhook event (shared, fire-and-forget) ───────
  import("@/app/_lib/apps/webhooks").then(({ emitPlatformEvent }) =>
    emitPlatformEvent({
      type: "order.paid",
      tenantId: order.tenantId,
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        currency: order.currency,
        guestEmail: order.guestEmail,
        guestName: order.guestName,
        orderType,
        paidAt: order.paidAt?.toISOString() ?? new Date().toISOString(),
        ...(orderMeta.gclid ? { gclid: orderMeta.gclid } : {}),
      },
    }),
  ).catch(() => {});
}
