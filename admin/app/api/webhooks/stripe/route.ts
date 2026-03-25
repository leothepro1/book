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
import { canTransition } from "@/app/_lib/orders/types";
import { log } from "@/app/_lib/logger";
import type Stripe from "stripe";
import { upsertGuestAccountFromOrder } from "@/app/_lib/guest-auth/account";
import { createGiftCard } from "@/app/_lib/gift-cards/create";

export async function POST(req: Request) {
  const stripe = getStripe();
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new NextResponse("Missing stripe-signature header", { status: 400 });
  }

  // Verify webhook signature
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    log("error", "webhook.signature_failed", { error: String(err) });
    return new NextResponse("Invalid signature", { status: 400 });
  }

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

  // ── Event-level dedup ─────────────────────────────────────────
  // Atomic INSERT — if the event was already processed, the unique
  // constraint on stripeEventId prevents a second insert.

  try {
    await prisma.stripeWebhookEvent.create({
      data: {
        stripeEventId: event.id,
        tenantId,
        eventType: event.type,
      },
    });
  } catch (e: unknown) {
    // Unique constraint violation = already processed → no-op
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    throw e;
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
        // Unhandled event type — acknowledge receipt
        break;
    }
  } catch (err) {
    log("error", "webhook.processing_failed", { eventType: event.type, eventId: event.id, error: String(err) });
    // Return 200 anyway — Stripe retries on 5xx, and we've already
    // recorded the event in StripeWebhookEvent so it won't be re-processed
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

  await prisma.$transaction(async (tx) => {
    // Update order to PAID
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        stripePaymentIntentId: paymentIntentId,
        guestEmail: session.customer_email ?? order.guestEmail,
      },
    });

    // Append events
    await tx.orderEvent.createMany({
      data: [
        {
          orderId: order.id,
          type: "STRIPE_WEBHOOK_RECEIVED",
          message: `checkout.session.completed (${session.id})`,
          metadata: { sessionId: session.id, paymentIntentId },
        },
        {
          orderId: order.id,
          type: "PAID",
          message: `Betalning mottagen — ${session.amount_total ? session.amount_total / 100 : "?"} ${session.currency?.toUpperCase() ?? "SEK"}`,
        },
      ],
    });

    // Update PaymentSession status — updateMany to silently skip if no session exists
    await tx.paymentSession.updateMany({
      where: { orderId: order.id },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });

    // Consume inventory reservations — mark consumed AND create ledger entries
    const reservations = await tx.inventoryReservation.findMany({
      where: { sessionId: order.id, consumed: false },
    });

    if (reservations.length > 0) {
      await tx.inventoryReservation.updateMany({
        where: { sessionId: order.id, consumed: false },
        data: { consumed: true },
      });

      // Create PURCHASE ledger entries (the stock was already decremented
      // by the RESERVATION — consuming just records the purchase in the ledger)
      for (const res of reservations) {
        await tx.inventoryChange.create({
          data: {
            tenantId: res.tenantId,
            productId: res.productId,
            variantId: res.variantId,
            quantityDelta: 0, // Stock already decremented by reservation
            quantityAfter: res.variantId
              ? (await tx.productVariant.findUnique({ where: { id: res.variantId }, select: { inventoryQuantity: true } }))?.inventoryQuantity ?? 0
              : (await tx.product.findUnique({ where: { id: res.productId }, select: { inventoryQuantity: true } }))?.inventoryQuantity ?? 0,
            reason: "PURCHASE",
            note: `Order #${order.orderNumber} — reservation consumed`,
            referenceId: order.id,
          },
        });
      }

      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: "INVENTORY_CONSUMED",
          message: `${reservations.length} lagerreservation(er) förbrukade`,
        },
      });
    }
  });

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
      data: { status: "CANCELLED", cancelledAt: new Date() },
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

    await tx.orderEvent.createMany({
      data: [
        {
          orderId: order.id,
          type: "STRIPE_WEBHOOK_RECEIVED",
          message: `checkout.session.expired (${session.id})`,
        },
        {
          orderId: order.id,
          type: "CANCELLED",
          message: "Checkout-session löpte ut",
        },
        ...(reservations.length > 0
          ? [
              {
                orderId: order.id,
                type: "INVENTORY_RELEASED" as const,
                message: `${reservations.length} lagerreservation(er) frigivna`,
              },
            ]
          : []),
      ],
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
      data: { status: "REFUNDED", refundedAt: new Date() },
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

    await tx.orderEvent.createMany({
      data: [
        {
          orderId: order.id,
          type: "STRIPE_WEBHOOK_RECEIVED",
          message: `charge.refunded (${charge.id})`,
          metadata: { chargeId: charge.id },
        },
        {
          orderId: order.id,
          type: "REFUNDED",
          message: `Återbetalning genomförd — ${charge.amount_refunded / 100} ${charge.currency.toUpperCase()}`,
        },
      ],
    });
  });
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
        paidAt: new Date(),
        stripePaymentIntentId: pi.id,
        guestEmail: order.guestEmail || (pi.receipt_email ?? ""),
      },
    });

    await tx.orderEvent.createMany({
      data: [
        {
          orderId: order.id,
          type: "STRIPE_WEBHOOK_RECEIVED",
          message: `payment_intent.succeeded (${pi.id})`,
          metadata: { paymentIntentId: pi.id },
        },
        {
          orderId: order.id,
          type: "PAID",
          message: `Betalning mottagen — ${pi.amount / 100} ${pi.currency.toUpperCase()}`,
        },
      ],
    });

    // Update PaymentSession status — updateMany to silently skip if no session exists
    await tx.paymentSession.updateMany({
      where: { orderId: order.id },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
  });

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
          data: { status: "FULFILLED", fulfilledAt: new Date() },
        });
        await prisma.orderEvent.create({
          data: {
            orderId: order.id,
            type: "FULFILLED",
            message: `Presentkort ${giftCard.code} skapat — ${giftCard.initialAmount / 100} kr`,
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
    }
  } catch (err) {
    log("error", "webhook.email_failed", { orderId: order.id, orderNumber: order.orderNumber, error: String(err) });
  }
}

// ── payment_intent.payment_failed ──────────────────────────────
// Log the failure but do NOT cancel — guest may retry.

async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent) {
  const orderId = pi.metadata?.orderId;
  if (!orderId) return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, orderNumber: true },
  });

  if (!order || order.status !== "PENDING") return;

  await prisma.$transaction(async (tx) => {
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: "PAYMENT_FAILED",
        message: `Betalningsförsök misslyckades — ${pi.last_payment_error?.message ?? "okänt fel"}`,
        metadata: {
          paymentIntentId: pi.id,
          errorCode: pi.last_payment_error?.code ?? null,
        },
      },
    });

    // Update PaymentSession status — updateMany to silently skip if no session exists
    await tx.paymentSession.updateMany({
      where: { orderId: order.id },
      data: { status: "REJECTED", resolvedAt: new Date() },
    });
  });
}
