export const dynamic = "force-dynamic";

/**
 * Stripe Webhook Handler (Legacy)
 * ════════════════════════════════
 *
 * NOTE: This handler exists for backwards compatibility with orders
 * created before the PaymentAdapter layer was introduced.
 * New providers use /api/webhooks/payments/[provider] instead.
 * This handler will be migrated to use handlePaymentWebhook()
 * once all Stripe-specific side effects are ported to webhook.ts.
 *
 * Original description:
 *
 * Handles payment lifecycle events from Stripe.
 * Patterns:
 * - Signature verification (Stripe-native)
 * - Event-level dedup via StripeWebhookEvent table (atomic INSERT as gate)
 * - Order-level idempotency (check status before transition)
 * - Inventory changes through append-only ledger (adjustInventoryInTx)
 * - Always return 200 for processed/unknown events
 */

import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";
import { getStripe } from "@/app/_lib/stripe/client";
import { adjustInventoryInTx } from "@/app/_lib/products/inventory";
import { canTransition, canTransitionFinancial, canTransitionFulfillment } from "@/app/_lib/orders/types";
import { log } from "@/app/_lib/logger";
import { createPmsBookingAfterPayment } from "@/app/_lib/accommodations/create-pms-booking";
import type Stripe from "stripe";
import { upsertGuestAccountFromOrder } from "@/app/_lib/guest-auth/account";
import { createGiftCard } from "@/app/_lib/gift-cards/create";
import { releaseDiscountUsageInTx } from "@/app/_lib/discounts/release";

export async function POST(req: Request) {
  const stripe = getStripe();
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new NextResponse("Missing stripe-signature header", { status: 400 });
  }

  // Verify webhook signature
  let _event: Stripe.Event;
  try {
    _event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    log("error", "webhook.signature_failed", { error: String(err) });
    return new NextResponse("Invalid signature", { status: 400 });
  }
  const event: Stripe.Event = _event;

  // ── Resolve tenant — verify Connect account matches ──────────
  const obj = event.data.object as { metadata?: Record<string, string> };
  let tenantId: string;

  if (event.account) {
    // Connect webhook — verify the connected account is ours
    const connectTenant = await prisma.tenant.findFirst({
      where: { stripeAccountId: event.account },
      select: { id: true },
    });
    if (!connectTenant) {
      log("warn", "webhook.unknown_connect_account", { stripeAccount: event.account });
      return new NextResponse("Unknown account", { status: 400 });
    }
    tenantId = connectTenant.id;
  } else {
    // Platform webhook — trust metadata
    tenantId = obj.metadata?.tenantId ?? "unknown";
  }

  // ── Event-level dedup with self-healing ──────────────────────
  // UPSERT ensures we record receipt. processedAt=null means "received
  // but not yet successfully processed" — retries after a failed
  // transaction are allowed through. processedAt set = fully processed.

  const existingEvent = await prisma.stripeWebhookEvent.findUnique({
    where: { stripeEventId: event.id },
    select: { processedAt: true },
  });

  if (existingEvent) {
    if (existingEvent.processedAt) {
      // Already fully processed — skip (idempotent)
      return NextResponse.json({ ok: true, skipped: true });
    }
    // processedAt is null → previous attempt failed mid-processing, allow retry
    log("info", "webhook.retry_after_failure", { eventId: event.id, eventType: event.type });
  } else {
    // First time seeing this event — record receipt with processedAt=null
    await prisma.stripeWebhookEvent.create({
      data: {
        stripeEventId: event.id,
        tenantId,
        eventType: event.type,
        processedAt: null,
      },
    });
  }

  // ── Dispatch event ────────────────────────────────────────────
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "checkout.session.expired":
        await handleCheckoutExpired(event.data.object as Stripe.Checkout.Session);
        break;

      case "charge.refunded":
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;

      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      default:
        break;
    }

    // Mark event as fully processed — enables dedup on future deliveries
    await prisma.stripeWebhookEvent.update({
      where: { stripeEventId: event.id },
      data: { processedAt: new Date() },
    });
  } catch (err) {
    log("error", "webhook.processing_failed", { eventType: event.type, eventId: event.id, error: String(err) });
    // processedAt stays null — next Stripe retry will re-process (self-healing)
    return NextResponse.json({ ok: false, error: "Processing error (acknowledged)" });
  }

  return NextResponse.json({ ok: true });
}

// ── checkout.session.completed ─────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const order = await prisma.order.findUnique({
    where: { stripeCheckoutSessionId: session.id },
    include: { lineItems: true },
  });

  if (!order) {
    log("warn", "webhook.order_not_found", { sessionId: session.id });
    return;
  }

  // Order-level idempotency — canTransition guards invalid/duplicate transitions
  if (!canTransition(order.status, "PAID")) return;

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  // Step A — Mark order PAID (small, fast transaction)
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        financialStatus: "PAID",
        fulfillmentStatus: "UNFULFILLED",
        paidAt: new Date(),
        stripePaymentIntentId: paymentIntentId,
        guestEmail: session.customer_email ?? order.guestEmail,
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        tenantId: order.tenantId,
        type: "PAYMENT_CAPTURED",
        message: `Betalning mottagen — ${session.amount_total ? session.amount_total / 100 : "?"} ${session.currency?.toUpperCase() ?? "SEK"}`,
        metadata: { sessionId: session.id, paymentIntentId, amount: session.amount_total, currency: session.currency },
      },
    });

    await tx.paymentSession.updateMany({
      where: { orderId: order.id },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });

    // ORDER_PAID guest event — atomic with payment update, idempotent
    if (order.guestAccountId) {
      const { createGuestAccountEventInTx } = await import("@/app/_lib/guests/events");
      await createGuestAccountEventInTx(tx, {
        guestAccountId: order.guestAccountId,
        tenantId: order.tenantId,
        type: "ORDER_PAID",
        message: `Bokning #${order.orderNumber} betald — ${session.amount_total ? session.amount_total / 100 : "?"} ${session.currency?.toUpperCase() ?? "SEK"}`,
        metadata: { orderId: order.id, orderNumber: order.orderNumber, amount: session.amount_total, currency: session.currency },
        orderId: order.id,
      });
    }
  });

  // Step B — Consume inventory (separate operation, after Step A commits)
  // If this fails, order is already PAID — inventory is a separate concern.
  try {
    const reservations = await prisma.inventoryReservation.findMany({
      where: { sessionId: order.id, consumed: false },
    });

    if (reservations.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.inventoryReservation.updateMany({
          where: { sessionId: order.id, consumed: false },
          data: { consumed: true },
        });

        for (const res of reservations) {
          await tx.inventoryChange.create({
            data: {
              tenantId: res.tenantId,
              productId: res.productId,
              variantId: res.variantId,
              quantityDelta: 0,
              quantityAfter: res.variantId
                ? (await tx.productVariant.findUnique({ where: { id: res.variantId }, select: { inventoryQuantity: true } }))?.inventoryQuantity ?? 0
                : (await tx.product.findUnique({ where: { id: res.productId }, select: { inventoryQuantity: true } }))?.inventoryQuantity ?? 0,
              reason: "PURCHASE",
              note: `Order #${order.orderNumber} — reservation consumed`,
              referenceId: order.id,
            },
          });
        }

        // Inventory consumption tracked in inventoryChange ledger — no separate timeline event
      });
    }
  } catch (err) {
    log("error", "checkout.inventory_consume_failed", {
      orderId: order.id,
      tenantId: order.tenantId,
      error: String(err),
    });
  }

  // Emit platform event for app webhooks (non-blocking, fire-and-forget)
  const orderMeta = (order.metadata ?? {}) as Record<string, unknown>;
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
        orderType: order.orderType,
        paidAt: new Date().toISOString(),
        ...(orderMeta.gclid ? { gclid: orderMeta.gclid } : {}),
      },
    }),
  ).catch((err) => log("error", "webhook.app_event_emit_failed", { orderId: order.id, error: String(err) }));

  // Auto-create guest account from order (non-blocking)
  if (order.guestEmail) {
    try {
      await upsertGuestAccountFromOrder(
        order.tenantId,
        order.id,
        order.guestEmail,
        order.guestName || undefined,
        order.guestPhone || undefined,
      );
    } catch (err) {
      log("warn", "webhook.guest_account_failed", { orderId: order.id, error: String(err) });
    }
  }

  // Segment sync — re-evaluate after payment (non-blocking)
  if (order.guestAccountId) {
    import("@/app/_lib/segments/sync").then(({ syncGuestSegments }) =>
      syncGuestSegments(order.guestAccountId!, order.tenantId),
    ).catch((err) => log("warn", "webhook.segment_sync_failed", { orderId: order.id, error: String(err) }));
  }

  // Send order confirmation email (non-blocking)
  try {
    const { sendEmailEvent } = await import("@/app/_lib/email/send");
    const { formatPriceDisplay } = await import("@/app/_lib/products/pricing");
    const tenant = await prisma.tenant.findUnique({
      where: { id: order.tenantId },
      select: { name: true, portalSlug: true },
    });

    const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "bedfront.com";
    const portalBase = tenant?.portalSlug
      ? `https://${tenant.portalSlug}.${baseDomain}`
      : null;

    await sendEmailEvent(
      order.tenantId,
      "ORDER_CONFIRMED" as Parameters<typeof sendEmailEvent>[1],
      order.guestEmail,
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

    // Emit guest email event (non-blocking)
    if (order.guestAccountId) {
      import("@/app/_lib/guests/email-event").then(({ emitGuestEmailEvent }) =>
        emitGuestEmailEvent({
          tenantId: order.tenantId,
          guestAccountId: order.guestAccountId!,
          emailType: "Orderbekräftelse",
          recipientEmail: order.guestEmail,
          orderId: order.id,
          orderNumber: order.orderNumber,
        }),
      ).catch(() => {});
    }
  } catch (err) {
    log("error", "webhook.email_failed", { orderId: order.id, orderNumber: order.orderNumber, error: String(err) });
  }
}

// ── checkout.session.expired ───────────────────────────────────

async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const order = await prisma.order.findUnique({
    where: { stripeCheckoutSessionId: session.id },
  });

  if (!order) return;
  if (!canTransition(order.status, "CANCELLED")) return;

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED",
        financialStatus: "VOIDED",
        fulfillmentStatus: "CANCELLED",
        cancelledAt: new Date(),
      },
    });

    // Release inventory reservations through the ledger
    const reservations = await tx.inventoryReservation.findMany({
      where: { sessionId: order.id, consumed: false },
    });

    if (reservations.length > 0) {
      await tx.inventoryReservation.updateMany({
        where: { sessionId: order.id, consumed: false },
        data: { consumed: true },
      });

      // Restore stock through adjustInventoryInTx — proper ledger entries
      for (const res of reservations) {
        await adjustInventoryInTx(tx, {
          tenantId: res.tenantId,
          productId: res.productId,
          variantId: res.variantId,
          quantityDelta: res.quantity, // Positive = restore stock
          reason: "RESERVATION_RELEASED",
          note: `Checkout session expired — order #${order.orderNumber}`,
          referenceId: order.id,
        });
      }
    }

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        tenantId: order.tenantId,
        type: "ORDER_CANCELLED",
        message: "Kassasession utgången — order avbokad automatiskt",
        metadata: { sessionId: session.id },
      },
    });

    if (reservations.length > 0) {
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          tenantId: order.tenantId,
          type: "INVENTORY_RELEASED",
          message: `${reservations.length} lagerreservation(er) frigivna`,
        },
      });
    }

    // Release discount usage (idempotent — no-op if no discount applied)
    await releaseDiscountUsageInTx(tx, {
      orderId: order.id,
      tenantId: order.tenantId,
      reason: "CANCELLED",
    });

    // Update PaymentSession status — updateMany to silently skip if no session exists
    await tx.paymentSession.updateMany({
      where: { orderId: order.id },
      data: { status: "REJECTED", resolvedAt: new Date() },
    });
  });
}

// ── charge.refunded ────────────────────────────────────────────

async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id ?? null;

  if (!paymentIntentId) return;

  const order = await prisma.order.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
    include: { lineItems: true },
  });

  if (!order) return;
  if (!canTransition(order.status, "REFUNDED")) return;

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "REFUNDED",
        financialStatus: "REFUNDED",
        refundedAt: new Date(),
      },
    });

    // Restore inventory for refunded items through the ledger
    for (const li of order.lineItems) {
      await adjustInventoryInTx(tx, {
        tenantId: order.tenantId,
        productId: li.productId,
        variantId: li.variantId,
        quantityDelta: li.quantity, // Positive = restore stock
        reason: "RETURN",
        note: `Refund — order #${order.orderNumber}`,
        referenceId: order.id,
      });
    }

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        tenantId: order.tenantId,
        type: "REFUND_SUCCEEDED",
        message: `Återbetalning genomförd — ${charge.amount_refunded / 100} ${charge.currency.toUpperCase()}`,
        metadata: { chargeId: charge.id, amount: charge.amount_refunded, currency: charge.currency },
      },
    });

    // Release discount usage (idempotent — no-op if no discount applied)
    await releaseDiscountUsageInTx(tx, {
      orderId: order.id,
      tenantId: order.tenantId,
      reason: "REFUNDED",
    });
  });

  // Emit platform event for app webhooks (non-blocking)
  import("@/app/_lib/apps/webhooks").then(({ emitPlatformEvent }) =>
    emitPlatformEvent({
      type: "order.refunded",
      tenantId: order.tenantId,
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        refundedAmount: charge.amount_refunded,
        currency: charge.currency.toUpperCase(),
        guestEmail: order.guestEmail,
      },
    }),
  ).catch((err) => log("error", "webhook.app_event_emit_failed", { orderId: order.id, error: String(err) }));
}

// ── payment_intent.succeeded ───────────────────────────────────
// Handles both ACCOMMODATION (Elements checkout) and PURCHASE (gift cards).
// Branches on pi.metadata.orderType to determine fulfillment logic.

async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent) {
  const orderId = pi.metadata?.orderId;
  if (!orderId) {
    // PaymentIntent without orderId — not from our system or legacy flow
    return;
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { lineItems: true },
  });

  if (!order) {
    log("warn", "webhook.order_not_found", { orderId });
    return;
  }

  if (!canTransition(order.status, "PAID")) return;

  const orderType = pi.metadata?.orderType ?? "ACCOMMODATION";

  // ── Shared: mark as PAID ────────────────────────────────────
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        financialStatus: "PAID",
        fulfillmentStatus: "UNFULFILLED",
        paidAt: new Date(),
        stripePaymentIntentId: pi.id,
        guestEmail: order.guestEmail || (pi.receipt_email ?? ""),
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        tenantId: order.tenantId,
        type: "PAYMENT_CAPTURED",
        message: `Betalning mottagen — ${pi.amount / 100} ${pi.currency.toUpperCase()}`,
        metadata: { paymentIntentId: pi.id, amount: pi.amount, currency: pi.currency },
      },
    });

    // Update PaymentSession status — updateMany to silently skip if no session exists
    await tx.paymentSession.updateMany({
      where: { orderId: order.id },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });

    // ORDER_PAID guest event — atomic with payment update, idempotent
    if (order.guestAccountId) {
      const { createGuestAccountEventInTx } = await import("@/app/_lib/guests/events");
      await createGuestAccountEventInTx(tx, {
        guestAccountId: order.guestAccountId,
        tenantId: order.tenantId,
        type: "ORDER_PAID",
        message: `Bokning #${order.orderNumber} betald — ${pi.amount / 100} ${pi.currency.toUpperCase()}`,
        metadata: { orderId: order.id, orderNumber: order.orderNumber, amount: pi.amount, currency: pi.currency },
        orderId: order.id,
      });
    }
  });

  // Segment sync — re-evaluate after payment (non-blocking)
  if (order.guestAccountId) {
    import("@/app/_lib/segments/sync").then(({ syncGuestSegments }) =>
      syncGuestSegments(order.guestAccountId!, order.tenantId),
    ).catch((err) => log("warn", "webhook.segment_sync_failed", { orderId: order.id, error: String(err) }));
  }

  // Emit platform event for app webhooks (non-blocking, fire-and-forget)
  const piOrderMeta = (order.metadata ?? {}) as Record<string, unknown>;
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
        paidAt: new Date().toISOString(),
        ...(piOrderMeta.gclid ? { gclid: piOrderMeta.gclid } : {}),
      },
    }),
  ).catch((err) => log("error", "webhook.app_event_emit_failed", { orderId: order.id, error: String(err) }));

  // ── ACCOMMODATION: create PMS booking after payment ──────────
  if (orderType === "ACCOMMODATION") {
    try {
      const pmsResult = await createPmsBookingAfterPayment({
        orderId: order.id,
        tenantId: order.tenantId,
      });

      if (!pmsResult.ok) {
        log("error", "webhook.pms_booking_failed_after_payment", {
          orderId: order.id,
          tenantId: order.tenantId,
          error: pmsResult.error,
          retryable: pmsResult.retryable,
        });

        if (pmsResult.retryable) {
          // Set fulfillment to ON_HOLD so staff can see it needs attention
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
                message: `PMS-bokning misslyckades — manuell hantering krävs: ${pmsResult.error}`,
              },
            });
          }
        }
      }
    } catch (err) {
      // Unexpected error — log but never crash the webhook
      log("error", "webhook.pms_booking_unexpected_error", {
        orderId: order.id,
        tenantId: order.tenantId,
        error: err instanceof Error ? err.message : String(err),
      });

      // Set fulfillment to ON_HOLD
      try {
        if (canTransitionFulfillment("UNFULFILLED", "ON_HOLD")) {
          await prisma.order.update({
            where: { id: order.id },
            data: { fulfillmentStatus: "ON_HOLD" },
          });
        }
      } catch {
        // Best effort — don't throw from error handler
      }
    }
  }

  // ── PURCHASE: create gift card + mark fulfilled ─────────────
  if (orderType === "PURCHASE") {
    try {
      const giftCard = await createGiftCard({
        orderId: order.id,
        tenantId: order.tenantId,
        designId: pi.metadata?.designId || null,
        amount: parseInt(pi.metadata?.amount ?? "0", 10),
        recipientEmail: pi.metadata?.recipientEmail ?? order.guestEmail,
        recipientName: pi.metadata?.recipientName ?? "",
        senderName: pi.metadata?.senderName ?? order.guestName,
        message: pi.metadata?.message ?? "",
        scheduledAt: pi.metadata?.scheduledAt
          ? new Date(pi.metadata.scheduledAt)
          : new Date(),
      });

      // Mark order as FULFILLED — gift card is the deliverable
      if (canTransition("PAID", "FULFILLED")) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "FULFILLED",
            fulfillmentStatus: "FULFILLED",
            fulfilledAt: new Date(),
          },
        });
        await prisma.orderEvent.create({
          data: {
            orderId: order.id,
            type: "ORDER_FULFILLED",
            tenantId: order.tenantId,
            message: `Presentkort ${giftCard.code} aktiverat — ${giftCard.initialAmount / 100} kr`,
            metadata: { giftCardId: giftCard.id, code: giftCard.code },
          },
        });
      }

      log("info", "webhook.gift_card_fulfilled", {
        orderId: order.id,
        giftCardId: giftCard.id,
        code: giftCard.code,
        amount: giftCard.initialAmount,
        tenantId: order.tenantId,
      });
    } catch (err) {
      // Gift card creation failed — order stays PAID, manual intervention needed
      log("error", "webhook.gift_card_creation_failed", {
        orderId: order.id,
        tenantId: order.tenantId,
        error: String(err),
      });
    }
  }

  // ── Shared: auto-create guest account (non-blocking) ────────
  const effectiveEmail = order.guestEmail || (pi.receipt_email ?? "");
  if (effectiveEmail) {
    try {
      await upsertGuestAccountFromOrder(
        order.tenantId,
        order.id,
        effectiveEmail,
        order.guestName || undefined,
        order.guestPhone || undefined,
      );
    } catch (err) {
      log("warn", "webhook.guest_account_failed", { orderId: order.id, error: String(err) });
    }
  }

  // ── Shared: send confirmation email (non-blocking) ──────────
  try {
    if (effectiveEmail) {
      const { sendEmailEvent } = await import("@/app/_lib/email/send");
      const { formatPriceDisplay } = await import("@/app/_lib/products/pricing");
      const tenant = await prisma.tenant.findUnique({
        where: { id: order.tenantId },
        select: { name: true, portalSlug: true },
      });

      const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "bedfront.com";
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

      // Emit guest email event (non-blocking)
      if (order.guestAccountId) {
        import("@/app/_lib/guests/email-event").then(({ emitGuestEmailEvent }) =>
          emitGuestEmailEvent({
            tenantId: order.tenantId,
            guestAccountId: order.guestAccountId!,
            emailType: "Orderbekräftelse",
            recipientEmail: effectiveEmail,
            orderId: order.id,
            orderNumber: order.orderNumber,
          }),
        ).catch(() => {});
      }
    }
  } catch (err) {
    log("error", "webhook.email_failed", { orderId: order.id, orderNumber: order.orderNumber, error: String(err) });
  }
}

// ── payment_intent.payment_failed ──────────────────────────────
// Log the failure but do NOT cancel — guest may retry.

function mapDeclineCodeToSwedish(code?: string | null): string {
  switch (code) {
    case "insufficient_funds": return "Otillräckligt saldo på kortet";
    case "card_declined": case "do_not_honor": case "generic_decline": return "Kortet nekades av din bank";
    case "lost_card": case "stolen_card": return "Kortet nekades av din bank";
    case "expired_card": return "Kortet har gått ut";
    case "incorrect_cvc": return "Fel CVC-kod";
    case "processing_error": return "Tekniskt fel vid betalning";
    default: return "Betalningen kunde inte genomföras";
  }
}

async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent) {
  const orderId = pi.metadata?.orderId;
  if (!orderId) return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, tenantId: true, status: true, orderNumber: true, guestEmail: true, guestName: true },
  });

  if (!order || order.status !== "PENDING") return;

  await prisma.$transaction(async (tx) => {
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        tenantId: order.tenantId,
        type: "PAYMENT_FAILED",
        message: `Betalningsförsök misslyckades — ${pi.last_payment_error?.message ?? "okänt fel"}`,
        metadata: {
          paymentIntentId: pi.id,
          declineCode: pi.last_payment_error?.decline_code ?? null,
          stripeErrorCode: pi.last_payment_error?.code ?? null,
        },
      },
    });

    // Update PaymentSession status — updateMany to silently skip if no session exists
    await tx.paymentSession.updateMany({
      where: { orderId: order.id },
      data: { status: "REJECTED", resolvedAt: new Date() },
    });
  });

  // Send PAYMENT_FAILED email (non-blocking)
  if (order.guestEmail) {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: order.tenantId },
        select: { name: true, portalSlug: true },
      });
      const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "bedfront.com";
      const portalBase = tenant?.portalSlug ? `https://${tenant.portalSlug}.${baseDomain}` : "";
      const { sendEmailEvent: sendPaymentFailedEmail } = await import("@/app/_lib/email/send");
      await sendPaymentFailedEmail(
        order.tenantId,
        "PAYMENT_FAILED" as Parameters<typeof sendPaymentFailedEmail>[1],
        order.guestEmail,
        {
          guestName: order.guestName || "Gäst",
          hotelName: tenant?.name ?? "",
          orderNumber: String(order.orderNumber),
          failureReason: mapDeclineCodeToSwedish(pi.last_payment_error?.decline_code),
          retryUrl: `${portalBase}/checkout?retry=${order.id}`,
        },
      );
    } catch (err) {
      log("error", "webhook.payment_failed_email_error", { orderId: order.id, error: String(err) });
    }
  }
}
