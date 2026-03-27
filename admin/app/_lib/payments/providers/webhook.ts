/**
 * Unified Payment Webhook Handler
 * ════════════════════════════════
 *
 * handlePaymentWebhook() normalizes webhooks from any provider
 * and applies the outcome to the Order state machine.
 *
 * Provider-specific logic lives in the adapter. This handler
 * only knows about outcomes: resolved, rejected, pending.
 *
 * A provider NEVER touches an Order directly.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { canTransition } from "@/app/_lib/orders/types";
import { log } from "@/app/_lib/logger";
import { adjustInventoryInTx } from "@/app/_lib/products/inventory";
import { emitPlatformEvent } from "@/app/_lib/apps/webhooks";
import { getPaymentAdapter } from "./registry";
import type { PaymentSessionOutcome } from "./types";

function isPrismaUniqueConstraintError(e: unknown): boolean {
  return isPrismaError(e, "P2002");
}

function isPrismaRecordNotFound(e: unknown): boolean {
  return isPrismaError(e, "P2025");
}

function isPrismaError(e: unknown, code: string): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === code
  );
}

export async function handlePaymentWebhook(
  providerKey: string,
  rawBody: string,
  headers: Record<string, string>,
): Promise<{ handled: boolean; outcome?: PaymentSessionOutcome }> {
  const adapter = getPaymentAdapter(providerKey);

  // 1. Parse and verify webhook (adapter handles signature verification)
  const event = await adapter.parseWebhook(rawBody, headers, prisma);
  if (!event) return { handled: false };

  // 2. Idempotency gate — stripeWebhookEvent table used for all providers
  try {
    await prisma.stripeWebhookEvent.create({
      data: {
        stripeEventId: event.externalEventId,
        tenantId: "system",
        eventType: `${providerKey}.webhook`,
      },
    });
  } catch (e: unknown) {
    if (isPrismaUniqueConstraintError(e)) {
      log("info", "webhook.duplicate_skipped", {
        externalEventId: event.externalEventId,
        providerKey,
      });
      return { handled: true };
    }
    throw e;
  }

  // 3. Resolve outcome
  const outcome = await adapter.resolveOutcome(event);

  // 4. Find the Order
  const order = await prisma.order.findUnique({
    where: { id: event.orderId },
    include: { paymentSession: true, lineItems: true },
  });

  if (!order) {
    log("warn", "webhook.order_not_found", {
      orderId: event.orderId,
      providerKey,
    });
    return { handled: false };
  }

  // 5. Apply outcome to Order state machine
  if (outcome.status === "resolved") {
    if (!canTransition(order.status, "PAID")) {
      log("info", "webhook.transition_skipped", {
        orderId: order.id,
        currentStatus: order.status,
        providerKey,
      });
      return { handled: true, outcome };
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: { status: "PAID", paidAt: new Date() },
        });
        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            type: "PAID",
            message: `Betalning mottagen via ${adapter.displayName}`,
            metadata: { providerKey, externalEventId: event.externalEventId },
          },
        });
        // Update PaymentSession — updateMany silently skips if no session
        await tx.paymentSession.updateMany({
          where: { orderId: order.id },
          data: { status: "RESOLVED", resolvedAt: new Date() },
        });

        // Consume inventory reservations
        const reservations = await tx.inventoryReservation.findMany({
          where: { sessionId: order.id, consumed: false },
        });
        if (reservations.length > 0) {
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
          await tx.orderEvent.create({
            data: {
              orderId: order.id,
              type: "INVENTORY_CONSUMED",
              message: `${reservations.length} lagerreservation(er) förbrukade`,
            },
          });
        }
      });
    } catch (err) {
      if (isPrismaRecordNotFound(err)) {
        log("warn", "webhook.payment_session_missing", {
          orderId: order.id,
          outcome: outcome.status,
        });
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "PAID", paidAt: new Date() },
        });
        await prisma.orderEvent.create({
          data: {
            orderId: order.id,
            type: "PAID",
            message: `Betalning mottagen via ${adapter.displayName} (legacy)`,
            metadata: { providerKey },
          },
        });
      } else {
        throw err;
      }
    }

    log("info", "webhook.payment_resolved", {
      orderId: order.id,
      providerKey,
      amount: order.totalAmount,
    });

    // Emit platform event for app webhooks (non-blocking, fire-and-forget)
    const paidMeta = (order.metadata ?? {}) as Record<string, unknown>;
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
        ...(paidMeta.gclid ? { gclid: paidMeta.gclid } : {}),
      },
    }).catch((err) => log("error", "webhook.app_event_emit_failed", { orderId: order.id, error: String(err) }));

    // Guest account creation (non-blocking)
    try {
      const { upsertGuestAccountFromOrder } = await import("@/app/_lib/guest-auth/account");
      if (order.guestEmail) {
        await upsertGuestAccountFromOrder(
          order.tenantId,
          order.id,
          order.guestEmail,
          order.guestName || undefined,
          order.guestPhone || undefined,
        );
      }
    } catch (err) {
      log("warn", "webhook.guest_account_failed", { orderId: order.id, error: String(err) });
    }

    // Send confirmation email (non-blocking — never fail the webhook)
    try {
      const { sendEmailEvent } = await import("@/app/_lib/email/send");
      const { formatPriceDisplay } = await import("@/app/_lib/products/pricing");
      const tenant = await prisma.tenant.findUnique({
        where: { id: order.tenantId },
        select: { name: true, portalSlug: true },
      });

      if (order.guestEmail) {
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
            orderStatusUrl: (order as { statusToken?: string | null }).statusToken && portalBase
              ? `${portalBase}/order-status/${(order as { statusToken?: string | null }).statusToken}`
              : "",
            portalUrl: portalBase ? `${portalBase}/login` : "",
          },
        );
      }
    } catch (err) {
      log("error", "webhook.email_failed", {
        orderId: order.id,
        tenantId: order.tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Gift card fulfillment (for PURCHASE orders)
    const orderMeta = order.metadata as Record<string, unknown> | null;
    if (order.orderType === "PURCHASE" || orderMeta?.type === "gift_card") {
      try {
        const { createGiftCard } = await import("@/app/_lib/gift-cards/create");
        const meta = orderMeta ?? {};
        const giftCard = await createGiftCard({
          orderId: order.id,
          tenantId: order.tenantId,
          designId: (meta.designId as string) || null,
          amount: order.totalAmount,
          recipientEmail: (meta.recipientEmail as string) ?? order.guestEmail,
          recipientName: (meta.recipientName as string) ?? "",
          senderName: (meta.senderName as string) ?? order.guestName,
          message: (meta.message as string) ?? "",
          scheduledAt: meta.scheduledAt ? new Date(meta.scheduledAt as string) : new Date(),
        });
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
      } catch (err) {
        log("error", "webhook.gift_card_creation_failed", {
          orderId: order.id,
          tenantId: order.tenantId,
          error: String(err),
        });
      }
    }
  }

  if (outcome.status === "rejected") {
    await prisma.$transaction(async (tx) => {
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: "PAYMENT_FAILED",
          message: `Betalning avvisad: ${outcome.reason}`,
          metadata: { providerKey, reason: outcome.reason },
        },
      });
      await tx.paymentSession.updateMany({
        where: { orderId: order.id },
        data: { status: "REJECTED", resolvedAt: new Date() },
      });
    });

    log("info", "webhook.payment_rejected", {
      orderId: order.id,
      providerKey,
      reason: outcome.reason,
    });

    // Send PAYMENT_FAILED email (non-blocking)
    if (order.guestEmail) {
      try {
        const { sendEmailEvent: sendFailedEmail } = await import("@/app/_lib/email/send");
        const tenant = await prisma.tenant.findUnique({
          where: { id: order.tenantId },
          select: { name: true, portalSlug: true },
        });
        const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "bedfront.com";
        const portalBase = tenant?.portalSlug ? `https://${tenant.portalSlug}.${baseDomain}` : "";
        await sendFailedEmail(
          order.tenantId,
          "PAYMENT_FAILED" as Parameters<typeof sendFailedEmail>[1],
          order.guestEmail,
          {
            guestName: order.guestName || "Gäst",
            hotelName: tenant?.name ?? "",
            orderNumber: String(order.orderNumber),
            failureReason: outcome.reason ?? "Betalningen kunde inte genomföras",
            retryUrl: `${portalBase}/checkout?retry=${order.id}`,
          },
        );
      } catch (err) {
        log("error", "webhook.payment_failed_email_error", { orderId: order.id, error: String(err) });
      }
    }
    // Do NOT cancel the Order — guest may retry
  }

  if (outcome.status === "pending") {
    await prisma.paymentSession.updateMany({
      where: { orderId: order.id },
      data: { status: "PENDING" },
    });

    log("info", "webhook.payment_pending", {
      orderId: order.id,
      providerKey,
    });
  }

  return { handled: true, outcome };
}
