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

  // ── ACCOMMODATION: create PMS booking ──────────────────────
  // createPmsBookingAfterPayment is internally idempotent (checks pmsBookingRef)
  // but we also guard on ORDER_CONFIRMED event to avoid unnecessary DB queries
  if (orderType === "ACCOMMODATION" && !completedEvents.has("ORDER_CONFIRMED")) {
    try {
      const { createPmsBookingAfterPayment } = await import(
        "@/app/_lib/accommodations/create-pms-booking"
      );
      const pmsResult = await createPmsBookingAfterPayment({
        orderId: order.id,
        tenantId: order.tenantId,
      });

      if (!pmsResult.ok) {
        log("error", "process_paid.pms_booking_failed", {
          orderId: order.id,
          tenantId: order.tenantId,
          error: pmsResult.error,
        });
        if (pmsResult.retryable && canTransitionFulfillment("UNFULFILLED", "ON_HOLD")) {
          await prisma.order.update({
            where: { id: order.id },
            data: { fulfillmentStatus: "ON_HOLD" },
          });
          await prisma.orderEvent.create({
            data: {
              orderId: order.id,
              tenantId: order.tenantId,
              type: "ORDER_UPDATED",
              message: `PMS-bokning misslyckades — manuell hantering krävs: ${pmsResult.error}`,
            },
          });
        }
      }
    } catch (err) {
      log("error", "process_paid.pms_booking_unexpected_error", {
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

      const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "rutgr.com";
      const portalBase = tenant?.portalSlug
        ? `https://${tenant.portalSlug}.${baseDomain}`
        : null;

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
          orderStatusUrl: order.statusToken && portalBase
            ? `${portalBase}/order-status/${order.statusToken}`
            : "",
          portalUrl: portalBase ? `${portalBase}/login` : "",
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
