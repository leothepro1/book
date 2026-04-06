export const dynamic = "force-dynamic";

/**
 * Cron: Reconcile Stuck Orders with Stripe
 * ═════════════════════════════════════════
 *
 * Finds PENDING orders older than 30 minutes and checks their actual
 * payment status on Stripe. Heals orders where the webhook was missed
 * (network issue, deploy during webhook delivery, etc.)
 *
 * Run every 15 minutes via Vercel cron.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { getStripe } from "@/app/_lib/stripe/client";
import { canTransition } from "@/app/_lib/orders/types";
import { log } from "@/app/_lib/logger";
import type Stripe from "stripe";

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

  const stuckOrders = await prisma.order.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: cutoff },
      OR: [
        { stripePaymentIntentId: { not: null } },
        { stripeCheckoutSessionId: { not: null } },
      ],
    },
    include: {
      tenant: { select: { stripeAccountId: true } },
    },
  });

  const stripe = getStripe();
  let healed = 0;
  let cancelled = 0;
  let stillPending = 0;

  for (const order of stuckOrders) {
    const connectOpts = order.tenant.stripeAccountId
      ? { stripeAccount: order.tenant.stripeAccountId }
      : undefined;

    try {
      if (order.stripePaymentIntentId) {
        const pi = await stripe.paymentIntents.retrieve(
          order.stripePaymentIntentId,
          connectOpts,
        );
        await reconcileFromPIStatus(order, pi);
      } else if (order.stripeCheckoutSessionId) {
        const session = await stripe.checkout.sessions.retrieve(
          order.stripeCheckoutSessionId,
          connectOpts,
        );
        await reconcileFromSessionStatus(order, session);
      }
    } catch (err) {
      log("error", "reconcile.stripe_fetch_failed", {
        orderId: order.id, tenantId: order.tenantId, error: String(err),
      });
      stillPending++;
    }
  }

  async function reconcileFromPIStatus(
    order: typeof stuckOrders[number],
    pi: Stripe.PaymentIntent,
  ) {
    if (pi.status === "succeeded" && canTransition(order.status, "PAID")) {
      // Mark as PAID
      await prisma.$transaction([
        prisma.order.update({
          where: { id: order.id },
          data: {
            status: "PAID",
            financialStatus: "PAID",
            fulfillmentStatus: "UNFULFILLED",
            paidAt: new Date(),
            stripePaymentIntentId: pi.id,
            guestEmail: order.guestEmail || (pi.receipt_email ?? ""),
          },
        }),
        prisma.orderEvent.create({
          data: {
            orderId: order.id,
            tenantId: order.tenantId,
            type: "RECONCILED",
            message: `Reconcilierad: payment_intent ${pi.id} succeeded (webhook missad)`,
            metadata: { paymentIntentId: pi.id, source: "cron" },
          },
        }),
      ]);

      // Run all side effects (email, PMS booking, guest account, analytics)
      // Same idempotent function used by the webhook handler
      const { processOrderPaidSideEffects } = await import("@/app/_lib/orders/process-paid-side-effects");
      await processOrderPaidSideEffects(order.id, pi.id);

      log("info", "reconcile.healed_paid", { orderId: order.id, tenantId: order.tenantId, piId: pi.id });
      healed++;
    } else if (pi.status === "canceled" && canTransition(order.status, "CANCELLED")) {
      await prisma.$transaction([
        prisma.order.update({
          where: { id: order.id },
          data: {
            status: "CANCELLED",
            financialStatus: "VOIDED",
            fulfillmentStatus: "CANCELLED",
            cancelledAt: new Date(),
          },
        }),
        prisma.orderEvent.create({
          data: {
            orderId: order.id,
            tenantId: order.tenantId,
            type: "RECONCILED",
            message: `Reconcilierad: payment_intent ${pi.id} cancelled`,
            metadata: { paymentIntentId: pi.id, source: "cron" },
          },
        }),
      ]);
      log("info", "reconcile.cancelled", { orderId: order.id, tenantId: order.tenantId, piId: pi.id });
      cancelled++;
    } else if (pi.status === "requires_payment_method" || pi.status === "requires_action") {
      // If order is >60 min old and still not paid, cancel it — guest abandoned
      const ageMs = Date.now() - order.createdAt.getTime();
      if (ageMs > 60 * 60 * 1000 && canTransition(order.status, "CANCELLED")) {
        // Cancel the PI on Stripe side, then cancel the order
        try {
          const cancelOpts = order.tenant.stripeAccountId
            ? { stripeAccount: order.tenant.stripeAccountId }
            : undefined;
          await stripe.paymentIntents.cancel(pi.id, cancelOpts);
        } catch { /* PI may already be cancelled */ }
        await prisma.$transaction([
          prisma.order.update({
            where: { id: order.id },
            data: { status: "CANCELLED", financialStatus: "VOIDED", fulfillmentStatus: "CANCELLED", cancelledAt: new Date() },
          }),
          prisma.orderEvent.create({
            data: {
              orderId: order.id,
              tenantId: order.tenantId,
              type: "RECONCILED",
              message: `Reconcilierad: PI ${pi.id} i ${pi.status} >60 min — avbruten`,
              metadata: { paymentIntentId: pi.id, source: "cron", reason: "expired" },
            },
          }),
        ]);
        log("info", "reconcile.expired_cancelled", { orderId: order.id, piId: pi.id, piStatus: pi.status });
        cancelled++;
      } else {
        log("warn", "reconcile.still_pending", {
          orderId: order.id, tenantId: order.tenantId, piStatus: pi.status,
        });
        stillPending++;
      }
    } else {
      // processing — actively being processed by Stripe, wait
      log("warn", "reconcile.still_pending", {
        orderId: order.id, tenantId: order.tenantId, piStatus: pi.status,
      });
      stillPending++;
    }
  }

  async function reconcileFromSessionStatus(
    order: typeof stuckOrders[number],
    session: Stripe.Checkout.Session,
  ) {
    if (session.payment_status === "paid" && canTransition(order.status, "PAID")) {
      const piId = typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

      await prisma.$transaction([
        prisma.order.update({
          where: { id: order.id },
          data: {
            status: "PAID",
            financialStatus: "PAID",
            fulfillmentStatus: "UNFULFILLED",
            paidAt: new Date(),
            stripePaymentIntentId: piId,
            guestEmail: session.customer_email ?? order.guestEmail,
          },
        }),
        prisma.orderEvent.create({
          data: {
            orderId: order.id,
            tenantId: order.tenantId,
            type: "RECONCILED",
            message: `Reconcilierad: checkout session ${session.id} paid (webhook missad)`,
            metadata: { sessionId: session.id, source: "cron" },
          },
        }),
      ]);
      // Run all side effects (same function as webhook)
      const { processOrderPaidSideEffects: processSessionSideEffects } = await import("@/app/_lib/orders/process-paid-side-effects");
      await processSessionSideEffects(order.id, piId);

      log("info", "reconcile.healed_paid", { orderId: order.id, tenantId: order.tenantId, sessionId: session.id });
      healed++;
    } else if (session.status === "expired" && canTransition(order.status, "CANCELLED")) {
      await prisma.$transaction([
        prisma.order.update({
          where: { id: order.id },
          data: {
            status: "CANCELLED",
            financialStatus: "VOIDED",
            fulfillmentStatus: "CANCELLED",
            cancelledAt: new Date(),
          },
        }),
        prisma.orderEvent.create({
          data: {
            orderId: order.id,
            tenantId: order.tenantId,
            type: "RECONCILED",
            message: `Reconcilierad: checkout session ${session.id} expired`,
            metadata: { sessionId: session.id, source: "cron" },
          },
        }),
      ]);
      log("info", "reconcile.cancelled", { orderId: order.id, tenantId: order.tenantId, sessionId: session.id });
      cancelled++;
    } else {
      stillPending++;
    }
  }

  log("info", "reconcile.completed", {
    checked: stuckOrders.length, healed, cancelled, stillPending,
  });

  return Response.json({
    ok: true,
    checked: stuckOrders.length,
    healed,
    cancelled,
    stillPending,
  });
}
