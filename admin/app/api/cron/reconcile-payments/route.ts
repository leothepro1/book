export const dynamic = "force-dynamic";

/**
 * Cron: Reconcile Stuck Payment Sessions
 * ═══════════════════════════════════════
 *
 * Provider-agnostic reconciliation. Finds PENDING orders with stuck
 * PaymentSessions (INITIATED, older than 30 min) and polls the
 * provider for the actual payment status.
 *
 * Replaces the Stripe-specific reconcile-stripe cron.
 * Run every 15 minutes via Vercel cron.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { canTransition } from "@/app/_lib/orders/types";
import { log } from "@/app/_lib/logger";
import { getAdapterAndContextForTenant } from "@/app/_lib/payments/providers/config";

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

  // Find all stuck PaymentSessions with their orders
  const stuckSessions = await prisma.paymentSession.findMany({
    where: {
      status: "INITIATED",
      initiatedAt: { lt: cutoff },
      externalSessionId: { not: null },
      order: { status: "PENDING" },
    },
    include: {
      order: { select: { id: true, status: true, tenantId: true, orderNumber: true } },
    },
  });

  let healed = 0;
  let cancelled = 0;
  let stillPending = 0;
  let noSupport = 0;

  for (const session of stuckSessions) {
    if (!session.externalSessionId || !session.order) continue;

    try {
      const { adapter, ctx } = await getAdapterAndContextForTenant(session.tenantId);

      // Skip providers that don't support polling
      if (!adapter.checkPaymentStatus) {
        noSupport++;
        continue;
      }

      const result = await adapter.checkPaymentStatus(session.externalSessionId, ctx);

      if (!result) {
        stillPending++;
        continue;
      }

      const order = session.order;

      if (result.outcome.status === "resolved" && canTransition(order.status, "PAID")) {
        await prisma.$transaction([
          prisma.order.update({
            where: { id: order.id },
            data: { status: "PAID", paidAt: new Date() },
          }),
          prisma.paymentSession.update({
            where: { orderId: order.id },
            data: { status: "RESOLVED", resolvedAt: new Date() },
          }),
          prisma.orderEvent.create({
            data: {
              orderId: order.id,
              tenantId: session.tenantId,
              type: "RECONCILED",
              message: `Reconcilierad: ${session.providerKey} session ${session.externalSessionId} — betalning bekräftad`,
              metadata: { externalSessionId: session.externalSessionId, source: "cron", providerKey: session.providerKey },
            },
          }),
        ]);
        log("info", "reconcile.healed_paid", {
          orderId: order.id,
          tenantId: session.tenantId,
          providerKey: session.providerKey,
          externalSessionId: session.externalSessionId,
        });
        healed++;
      } else if (result.outcome.status === "rejected" && canTransition(order.status, "CANCELLED")) {
        await prisma.$transaction([
          prisma.order.update({
            where: { id: order.id },
            data: { status: "CANCELLED", cancelledAt: new Date() },
          }),
          prisma.paymentSession.update({
            where: { orderId: order.id },
            data: { status: "REJECTED", resolvedAt: new Date() },
          }),
          prisma.orderEvent.create({
            data: {
              orderId: order.id,
              tenantId: session.tenantId,
              type: "RECONCILED",
              message: `Reconcilierad: ${session.providerKey} session ${session.externalSessionId} — avvisad`,
              metadata: { externalSessionId: session.externalSessionId, source: "cron", providerKey: session.providerKey },
            },
          }),
        ]);
        log("info", "reconcile.cancelled", {
          orderId: order.id,
          tenantId: session.tenantId,
          providerKey: session.providerKey,
        });
        cancelled++;
      } else {
        stillPending++;
      }
    } catch (err) {
      log("error", "reconcile.provider_check_failed", {
        orderId: session.order.id,
        tenantId: session.tenantId,
        providerKey: session.providerKey,
        error: String(err),
      });
      stillPending++;
    }
  }

  log("info", "reconcile.completed", {
    checked: stuckSessions.length,
    healed,
    cancelled,
    stillPending,
    noSupport,
  });

  return Response.json({
    ok: true,
    checked: stuckSessions.length,
    healed,
    cancelled,
    stillPending,
    noSupport,
  });
}
