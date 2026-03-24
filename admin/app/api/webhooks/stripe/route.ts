export const dynamic = "force-dynamic";

/**
 * Stripe Webhook Handler
 * ══════════════════════
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
import type Stripe from "stripe";

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
    console.error("[stripe-webhook] Signature verification failed:", err);
    return new NextResponse("Invalid signature", { status: 400 });
  }

  // ── Event-level dedup ─────────────────────────────────────────
  // Atomic INSERT — if the event was already processed, the unique
  // constraint on stripeEventId prevents a second insert.
  const obj = event.data.object as { metadata?: Record<string, string> };
  const tenantId = obj.metadata?.tenantId ?? "unknown";

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

      default:
        // Unhandled event type — acknowledge receipt
        break;
    }
  } catch (err) {
    console.error(`[stripe-webhook] Error processing ${event.type}:`, err);
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
    console.warn(`[stripe-webhook] No order found for session ${session.id}`);
    return;
  }

  // Order-level idempotency — already processed
  if (order.status !== "PENDING") return;

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

  // Send order confirmation email (non-blocking)
  try {
    const { sendEmailEvent } = await import("@/app/_lib/email/send");
    const { formatPriceDisplay } = await import("@/app/_lib/products/pricing");
    const tenant = await prisma.tenant.findUnique({
      where: { id: order.tenantId },
      select: { name: true },
    });

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
      },
    );
  } catch (err) {
    console.error(`[stripe-webhook] Failed to send confirmation email for order #${order.orderNumber}:`, err);
    // Email failure must NEVER abort the webhook response
  }
}

// ── checkout.session.expired ───────────────────────────────────

async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const order = await prisma.order.findUnique({
    where: { stripeCheckoutSessionId: session.id },
  });

  if (!order) return;
  if (order.status !== "PENDING") return;

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
  if (order.status === "REFUNDED") return;

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
