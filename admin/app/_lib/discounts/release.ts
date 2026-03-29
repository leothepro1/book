/**
 * Discount Usage Release
 * ══════════════════════
 *
 * Releases a discount usage when an order is cancelled or refunded.
 * Decrements usageCount atomically, marks usage as voided, and creates
 * audit events. Idempotent — safe to call multiple times on the same order.
 *
 * Must be called inside an existing Prisma $transaction.
 */

import { Prisma } from "@prisma/client";
import { createOrderEventInTx } from "@/app/_lib/orders/events";
import { log } from "@/app/_lib/logger";

type PrismaTransactionClient = Prisma.TransactionClient;

export async function releaseDiscountUsageInTx(
  tx: PrismaTransactionClient,
  params: {
    orderId: string;
    tenantId: string;
    reason: "CANCELLED" | "REFUNDED";
    actorUserId?: string;
  },
): Promise<void> {
  // Step 1 — Find the usage record + order number for audit messages
  const usage = await tx.discountUsage.findUnique({
    where: { orderId: params.orderId },
    include: { discount: true, discountCode: true, order: { select: { orderNumber: true } } },
  });

  if (!usage) return; // No discount was applied — no-op

  // Step 2 — Check if already voided (idempotency)
  if (usage.voidedAt) return;

  // Step 3 — Atomic decrement on Discount.usageCount (never below 0)
  await tx.$executeRaw`
    UPDATE "Discount"
    SET "usageCount" = GREATEST(0, "usageCount" - 1), "updatedAt" = NOW()
    WHERE id = ${usage.discountId}
  `;

  // Step 4 — Atomic decrement on DiscountCode.usageCount (if applicable)
  if (usage.discountCodeId) {
    await tx.$executeRaw`
      UPDATE "DiscountCode"
      SET "usageCount" = GREATEST(0, "usageCount" - 1)
      WHERE id = ${usage.discountCodeId}
    `;
  }

  // Step 5 — Mark usage as voided
  await tx.discountUsage.update({
    where: { orderId: params.orderId },
    data: { voidedAt: new Date() },
  });

  // Step 6 — DiscountEvent audit record
  const orderNum = usage.order?.orderNumber ? `#${usage.order.orderNumber}` : params.orderId;
  const reasonText = params.reason === "CANCELLED"
    ? `order ${orderNum} annullerades`
    : `order ${orderNum} återbetalades`;

  await tx.discountEvent.create({
    data: {
      discountId: usage.discountId,
      tenantId: params.tenantId,
      type: "USAGE_VOIDED",
      message: `Rabattanvändning återkallad — ${reasonText}`,
      metadata: {
        orderId: params.orderId,
        reason: params.reason,
        triggeredBy: params.actorUserId ?? "system",
      },
      actorUserId: params.actorUserId ?? null,
    },
  });

  // Step 7 — OrderEvent
  await createOrderEventInTx(tx, {
    orderId: params.orderId,
    tenantId: params.tenantId,
    type: "DISCOUNT_REMOVED",
    message: `Rabattanvändning återkallad — ${reasonText}`,
    metadata: {
      discountId: usage.discountId,
      discountAmount: String(usage.discountAmount),
      reason: params.reason,
    },
  });

  // Step 8 — Structured log
  log("info", "discount.usage_released", {
    tenantId: params.tenantId,
    orderId: params.orderId,
    discountId: usage.discountId,
    reason: params.reason,
  });
}
