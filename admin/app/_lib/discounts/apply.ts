/**
 * Discount Application
 * ════════════════════
 *
 * Applies an evaluated discount to an order inside a Prisma transaction.
 * Never called outside a transaction. Never opens its own transaction.
 *
 * Creates allocation records, updates order/line amounts, increments
 * usage counters atomically, and appends audit events.
 */

import { Prisma } from "@prisma/client";
import { createOrderEventInTx } from "@/app/_lib/orders/events";
import { normalizeCode } from "./codes";
import type { DiscountEvaluationResult } from "./types";

// ── Types ──────────────────────────────────────────────────────

type PrismaTransactionClient = Prisma.TransactionClient;

type ApplyDiscountParams = {
  orderId: string;
  tenantId: string;
  guestEmail: string;
  guestAccountId: string | undefined;
  result: Extract<DiscountEvaluationResult, { valid: true }>;
  discountCodeId: string | undefined;
  lineItems: Array<{
    id: string;
    productId: string;
    totalAmount: number;
  }>;
};

// ─��� Helpers ────────────────────────────────────────────────────

/**
 * Find the SPECIFIC_PRODUCTS condition on a discount, if any.
 * Returns the allowed product IDs, or null if no such condition.
 */
function getSpecificProductIds(
  discount: ApplyDiscountParams["result"]["discount"],
): string[] | null {
  // Access conditions from the Prisma include — they live on DiscountWithRelations
  // but the Discount type from evaluation only has base fields.
  // We pass the condition data through the evaluation result's discount.
  return null;
}

/**
 * Calculate per-line allocation for LINE_ITEM discounts.
 * Allocates proportionally across matching lines.
 * Uses integer division, assigns remainder to first matching line.
 */
function allocateToLines(
  totalDiscount: number,
  lines: ApplyDiscountParams["lineItems"],
  allowedProductIds: string[] | null,
): Array<{ lineItemId: string; amount: number }> {
  const matchingLines =
    allowedProductIds !== null
      ? lines.filter((l) => allowedProductIds.includes(l.productId))
      : lines;

  // If no lines match, fall back to empty (caller handles order-level)
  if (matchingLines.length === 0) return [];

  const totalLineAmount = matchingLines.reduce(
    (sum, l) => sum + l.totalAmount,
    0,
  );
  if (totalLineAmount <= 0) return [];

  let allocated = 0;
  const allocations: Array<{ lineItemId: string; amount: number }> = [];

  for (let i = 0; i < matchingLines.length; i++) {
    const line = matchingLines[i];
    if (i === matchingLines.length - 1) {
      // Last line gets the remainder
      allocations.push({
        lineItemId: line.id,
        amount: totalDiscount - allocated,
      });
    } else {
      const share = Math.floor(
        (totalDiscount * line.totalAmount) / totalLineAmount,
      );
      allocations.push({ lineItemId: line.id, amount: share });
      allocated += share;
    }
  }

  return allocations;
}

// ── Main function ──────────────────────────────────────────────

/**
 * Apply a discount to an order inside an existing transaction.
 * Creates DiscountAllocation records and DiscountUsage record.
 * Updates Order.discountAmount and OrderLineItem.discountAmount.
 * Updates Discount.usageCount and DiscountCode.usageCount.
 * Appends OrderEvent (DISCOUNT_APPLIED or DISCOUNT_CODE_REDEEMED).
 * Appends DiscountEvent (USAGE_RECORDED).
 * All writes happen in the passed transaction — never opens its own.
 */
export async function applyDiscountInTx(
  tx: PrismaTransactionClient,
  params: ApplyDiscountParams,
): Promise<void> {
  const { orderId, tenantId, guestEmail, guestAccountId, result, discountCodeId, lineItems } =
    params;
  const { discount, discountAmount } = result;

  // ── 0. Lock Discount row — TOCTOU prevention ─────────────
  // Lock the Discount row for the duration of this transaction.
  // Prevents concurrent checkouts from both passing a usageLimit check
  // that was evaluated outside the transaction (TOCTOU prevention).
  const lockedDiscount = await tx.$queryRaw<{ usageCount: number; usageLimit: number | null }[]>`
    SELECT "usageCount", "usageLimit"
    FROM "Discount"
    WHERE id = ${discount.id}
    FOR UPDATE
  `;

  const locked = lockedDiscount[0];
  if (!locked) {
    throw new Error(`Discount ${discount.id} not found during lock`);
  }

  if (locked.usageLimit !== null && locked.usageCount >= locked.usageLimit) {
    throw new Error("USAGE_LIMIT_REACHED");
  }

  // ── 1. Calculate allocations ──────────────────────────────

  const isLineItem = discount.targetType === "LINE_ITEM";
  let lineAllocations: Array<{ lineItemId: string; amount: number }> = [];

  if (isLineItem) {
    // Check for SPECIFIC_PRODUCTS condition on the discount
    const specificCondition = await tx.discountCondition.findFirst({
      where: { discountId: discount.id, type: "SPECIFIC_PRODUCTS" },
      select: { jsonValue: true },
    });
    const allowedProductIds =
      specificCondition && Array.isArray(specificCondition.jsonValue)
        ? (specificCondition.jsonValue as string[])
        : null;

    lineAllocations = allocateToLines(discountAmount, lineItems, allowedProductIds);
  }

  const isOrderLevel = !isLineItem || lineAllocations.length === 0;

  // ── 2. Create DiscountAllocation records ──────────────────

  if (isOrderLevel) {
    await tx.discountAllocation.create({
      data: {
        orderId,
        orderLineItemId: null,
        discountId: discount.id,
        tenantId,
        amount: discountAmount,
      },
    });
  } else {
    for (const alloc of lineAllocations) {
      await tx.discountAllocation.create({
        data: {
          orderId,
          orderLineItemId: alloc.lineItemId,
          discountId: discount.id,
          tenantId,
          amount: alloc.amount,
        },
      });
    }
  }

  // ── 3. Update Order.discountAmount and discountCode ───────

  const codeValue =
    discountCodeId
      ? await tx.discountCode
          .findUnique({ where: { id: discountCodeId }, select: { code: true } })
          .then((c) => c?.code ?? null)
      : null;

  await tx.order.update({
    where: { id: orderId },
    data: {
      discountAmount,
      discountCode: codeValue ? normalizeCode(codeValue) : null,
    },
  });

  // ── 4. Update OrderLineItem.discountAmount ────────────────

  for (const alloc of lineAllocations) {
    await tx.orderLineItem.update({
      where: { id: alloc.lineItemId },
      data: { discountAmount: alloc.amount },
    });
  }

  // ── 5. Atomic increment Discount.usageCount ───────────────

  await tx.$executeRaw`
    UPDATE "Discount"
    SET "usageCount" = "usageCount" + 1, "updatedAt" = NOW()
    WHERE "id" = ${discount.id}
  `;

  // ── 6. Atomic increment DiscountCode.usageCount ───────────

  if (discountCodeId) {
    await tx.$executeRaw`
      UPDATE "DiscountCode"
      SET "usageCount" = "usageCount" + 1
      WHERE "id" = ${discountCodeId}
    `;
  }

  // ── 7. Create DiscountUsage (upsert on orderId for idempotency) ──

  await tx.discountUsage.upsert({
    where: { orderId },
    create: {
      discountId: discount.id,
      discountCodeId: discountCodeId ?? null,
      tenantId,
      orderId,
      guestAccountId: guestAccountId ?? null,
      guestEmail,
      discountAmount,
    },
    update: {},
  });

  // ── 8. OrderEvent ─────────────────────────────────────────

  const isCodeMethod = discount.method === "CODE";
  await createOrderEventInTx(tx, {
    orderId,
    tenantId,
    type: isCodeMethod ? "DISCOUNT_CODE_REDEEMED" : "DISCOUNT_APPLIED",
    message: isCodeMethod
      ? `Rabattkod "${codeValue ?? ""}" applicerad`
      : `Rabatt "${discount.title}" applicerad automatiskt`,
    metadata: {
      discountId: discount.id,
      discountAmount: String(discountAmount),
      valueType: discount.valueType,
      value: String(discount.value),
    },
  });

  // ── 9. DiscountEvent ──────────────────────────────────────

  await tx.discountEvent.create({
    data: {
      discountId: discount.id,
      tenantId,
      type: "USAGE_RECORDED",
      message: `Rabatt använd på order ${orderId}`,
      metadata: {
        orderId,
        discountAmount: String(discountAmount),
        guestEmail,
      },
    },
  });
}
