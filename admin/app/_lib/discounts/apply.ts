/**
 * Discount Application
 * ════════════════════
 *
 * Two public functions:
 *
 *   calculateDiscountImpact(...)    PURE. No DB mutation. Returns impact +
 *                                   per-line allocation plan. Safe to call
 *                                   on every draft edit (FAS 6.4).
 *
 *   commitDiscountApplication(tx, ...)
 *                                   MUTATES. Called only inside an Order-
 *                                   creation transaction. Increments
 *                                   Discount/DiscountCode.usageCount, writes
 *                                   DiscountUsage, DiscountAllocation,
 *                                   OrderEvent, DiscountEvent.
 *
 * Legacy `applyDiscountInTx(tx, ...)` is retained as a thin wrapper for
 * existing checkout callers during the FAS 6.3 transition.
 */

import { Prisma } from "@prisma/client";
import { createOrderEventInTx } from "@/app/_lib/orders/events";
import { evaluateAutomaticDiscount, evaluateDiscountCode } from "./engine";
import { findDiscountCode, normalizeCode } from "./codes";
import type { BuyerKind, ConditionContext } from "./eligibility";
import type {
  DiscountEvaluationError,
  DiscountEvaluationResult,
  DiscountWithRelations,
} from "./types";

// ── Types ──────────────────────────────────────────────────────

type PrismaTransactionClient = Prisma.TransactionClient;

type LineItemInput = {
  id: string;
  productId: string;
  totalAmount: number;
};

/** How the discount amount is distributed across the order. */
export type DiscountAllocations =
  | { scope: "ORDER"; amount: number }
  | { scope: "LINE"; perLine: Array<{ lineItemId: string; amount: number }> };

/**
 * Result of calculateDiscountImpact — the complete, side-effect-free
 * handoff that a commit (or a draft preview) needs.
 */
export type CalculatedDiscountImpact =
  | {
      valid: true;
      discount: DiscountWithRelations;
      discountCodeId: string | undefined;
      discountCodeValue: string | undefined;
      discountAmount: number;
      allocations: DiscountAllocations;
      title: string;
      description: string | null;
      /** Snapshotted from ctx — used by commitDiscountApplication for defense-in-depth re-check. */
      buyerKind: BuyerKind;
    }
  | { valid: false; error: DiscountEvaluationError };

export type CalculateDiscountImpactParams = {
  tenantId: string;
  ctx: Omit<ConditionContext, "now">;
  /** Exactly one of `code` or `auto` must be set. */
  code?: string;
  auto?: true;
  /** Needed to compute LINE_ITEM allocations. */
  lineItems: readonly LineItemInput[];
};

// ── Allocation helpers (pure) ──────────────────────────────────

/**
 * Allocate a discount across matching lines proportionally (integer math).
 * Remainder is assigned to the last matching line so sums stay exact.
 */
function allocateToLines(
  totalDiscount: number,
  lines: readonly LineItemInput[],
  allowedProductIds: readonly string[] | null,
): Array<{ lineItemId: string; amount: number }> {
  const matchingLines =
    allowedProductIds !== null
      ? lines.filter((l) => allowedProductIds.includes(l.productId))
      : lines;

  if (matchingLines.length === 0) return [];

  const totalLineAmount = matchingLines.reduce((sum, l) => sum + l.totalAmount, 0);
  if (totalLineAmount <= 0) return [];

  let allocated = 0;
  const out: Array<{ lineItemId: string; amount: number }> = [];
  for (let i = 0; i < matchingLines.length; i++) {
    const line = matchingLines[i];
    if (i === matchingLines.length - 1) {
      out.push({ lineItemId: line.id, amount: totalDiscount - allocated });
    } else {
      const share = Math.floor((totalDiscount * line.totalAmount) / totalLineAmount);
      out.push({ lineItemId: line.id, amount: share });
      allocated += share;
    }
  }
  return out;
}

/**
 * Build the allocation plan from an eligibility result + line items.
 * Pure — reads SPECIFIC_PRODUCTS from the already-loaded discount.conditions.
 */
function buildAllocations(
  discount: DiscountWithRelations,
  discountAmount: number,
  lineItems: readonly LineItemInput[],
): DiscountAllocations {
  if (discount.targetType !== "LINE_ITEM") {
    return { scope: "ORDER", amount: discountAmount };
  }

  const specificCondition = discount.conditions.find((c) => c.type === "SPECIFIC_PRODUCTS");
  const allowedProductIds =
    specificCondition && Array.isArray(specificCondition.jsonValue)
      ? (specificCondition.jsonValue as string[])
      : null;

  const perLine = allocateToLines(discountAmount, lineItems, allowedProductIds);
  if (perLine.length === 0) {
    // LINE_ITEM discount with no matching lines → fall back to order-level.
    return { scope: "ORDER", amount: discountAmount };
  }
  return { scope: "LINE", perLine };
}

// ── calculateDiscountImpact (pure) ─────────────────────────────

/**
 * Compute a discount's impact on an order without mutating DB state.
 *
 * Called by:
 *   - Checkout flows (once, outside tx, for preview and pre-tx gating).
 *   - DraftCalculator (FAS 6.4), on every draft edit.
 *   - `applyDiscountInTx` legacy wrapper (inside tx).
 *
 * Never increments usageCount, never writes DiscountUsage rows.
 * Safe to call thousands of times per draft lifecycle.
 */
export async function calculateDiscountImpact(
  params: CalculateDiscountImpactParams,
): Promise<CalculatedDiscountImpact> {
  const { tenantId, ctx, code, auto, lineItems } = params;

  if (code) {
    const evalResult = await evaluateDiscountCode({
      tenantId,
      code,
      orderAmount: ctx.orderAmount,
      productIds: ctx.productIds,
      itemCount: ctx.itemCount,
      guestEmail: ctx.guestEmail,
      checkInDate: ctx.checkInDate,
      checkOutDate: ctx.checkOutDate,
      buyerKind: ctx.buyerKind,
      companyLocationId: ctx.companyLocationId,
    });
    if (!evalResult.valid) return evalResult;

    const codeRecord = await findDiscountCode(tenantId, code);
    const allocations = buildAllocations(
      evalResult.discount,
      evalResult.discountAmount,
      lineItems,
    );

    return {
      valid: true,
      discount: evalResult.discount,
      discountCodeId: codeRecord?.id,
      discountCodeValue: codeRecord?.code,
      discountAmount: evalResult.discountAmount,
      allocations,
      title: evalResult.title,
      description: evalResult.description,
      buyerKind: ctx.buyerKind,
    };
  }

  if (auto) {
    const autoResult = await evaluateAutomaticDiscount(tenantId, ctx);
    if (!autoResult.valid) return autoResult;

    const allocations = buildAllocations(
      autoResult.discount,
      autoResult.discountAmount,
      lineItems,
    );

    return {
      valid: true,
      discount: autoResult.discount,
      discountCodeId: undefined,
      discountCodeValue: undefined,
      discountAmount: autoResult.discountAmount,
      allocations,
      title: autoResult.title,
      description: autoResult.description,
      buyerKind: ctx.buyerKind,
    };
  }

  return { valid: false, error: "DISCOUNT_NOT_FOUND" };
}

// ── commitDiscountApplication (mutating) ───────────────────────

export type CommitDiscountApplicationParams = {
  orderId: string;
  tenantId: string;
  guestEmail: string;
  guestAccountId: string | undefined;
  impact: Extract<CalculatedDiscountImpact, { valid: true }>;
};

/**
 * Apply a pre-computed discount impact to an Order inside a transaction.
 *
 * INVARIANT: Only Order-creation transactions call this. Drafts must use
 * `calculateDiscountImpact` alone and never invoke this function — usage
 * increments exactly once, on draft → order conversion.
 *
 * Re-validates `usageLimit` under a FOR UPDATE row lock to prevent TOCTOU
 * races between two concurrent checkouts that both passed the pre-tx check.
 */
export async function commitDiscountApplication(
  tx: PrismaTransactionClient,
  params: CommitDiscountApplicationParams,
): Promise<void> {
  const { orderId, tenantId, guestEmail, guestAccountId, impact } = params;
  const { discount, discountAmount, allocations, discountCodeId, discountCodeValue } = impact;

  // ── 0. Lock + TOCTOU re-check ─────────────────────────────
  // Re-reads usageLimit AND appliesToCompanies from the locked row so the
  // authoritative values match what the calculate phase saw. Two concurrent
  // checkouts can pass the pre-tx check; only one survives the FOR UPDATE.
  const locked = await tx.$queryRaw<
    { usageCount: number; usageLimit: number | null; appliesToCompanies: boolean }[]
  >`
    SELECT "usageCount", "usageLimit", "appliesToCompanies"
    FROM "Discount"
    WHERE id = ${discount.id}
    FOR UPDATE
  `;
  if (!locked[0]) {
    throw new Error(`Discount ${discount.id} not found during lock`);
  }
  if (locked[0].usageLimit !== null && locked[0].usageCount >= locked[0].usageLimit) {
    throw new Error("USAGE_LIMIT_REACHED");
  }
  if (impact.buyerKind === "COMPANY" && !locked[0].appliesToCompanies) {
    throw new Error("NOT_ELIGIBLE_FOR_COMPANIES");
  }

  // ── 1. DiscountAllocation rows ────────────────────────────
  if (allocations.scope === "ORDER") {
    await tx.discountAllocation.create({
      data: {
        orderId,
        orderLineItemId: null,
        discountId: discount.id,
        tenantId,
        amount: allocations.amount,
      },
    });
  } else {
    for (const a of allocations.perLine) {
      await tx.discountAllocation.create({
        data: {
          orderId,
          orderLineItemId: a.lineItemId,
          discountId: discount.id,
          tenantId,
          amount: a.amount,
        },
      });
    }
  }

  // ── 2. Order + line-item amount updates ───────────────────
  await tx.order.update({
    where: { id: orderId },
    data: {
      discountAmount,
      discountCode: discountCodeValue ? normalizeCode(discountCodeValue) : null,
    },
  });

  if (allocations.scope === "LINE") {
    for (const a of allocations.perLine) {
      await tx.orderLineItem.update({
        where: { id: a.lineItemId },
        data: { discountAmount: a.amount },
      });
    }
  }

  // ── 3. Atomic usageCount increments ───────────────────────
  await tx.$executeRaw`
    UPDATE "Discount"
    SET "usageCount" = "usageCount" + 1, "updatedAt" = NOW()
    WHERE "id" = ${discount.id}
  `;
  if (discountCodeId) {
    await tx.$executeRaw`
      UPDATE "DiscountCode"
      SET "usageCount" = "usageCount" + 1
      WHERE "id" = ${discountCodeId}
    `;
  }

  // ── 4. DiscountUsage (idempotent on orderId) ──────────────
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

  // ── 5. Audit: OrderEvent ──────────────────────────────────
  const isCodeMethod = discount.method === "CODE";
  await createOrderEventInTx(tx, {
    orderId,
    tenantId,
    type: isCodeMethod ? "DISCOUNT_CODE_REDEEMED" : "DISCOUNT_APPLIED",
    message: isCodeMethod
      ? `Rabattkod "${discountCodeValue ?? ""}" applicerad`
      : `Rabatt "${discount.title}" applicerad automatiskt`,
    metadata: {
      discountId: discount.id,
      discountAmount: String(discountAmount),
      valueType: discount.valueType,
      value: String(discount.value),
    },
  });

  // ── 6. Audit: DiscountEvent ───────────────────────────────
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

// ── Legacy wrapper ─────────────────────────────────────────────

type LegacyApplyDiscountParams = {
  orderId: string;
  tenantId: string;
  guestEmail: string;
  guestAccountId: string | undefined;
  result: Extract<DiscountEvaluationResult, { valid: true }>;
  discountCodeId: string | undefined;
  lineItems: Array<{ id: string; productId: string; totalAmount: number }>;
};

/**
 * @deprecated Use `calculateDiscountImpact` + `commitDiscountApplication`.
 * Thin wrapper that preserves the FAS 6.2 signature for existing checkout
 * callers. Same behaviour, no new side effects.
 */
export async function applyDiscountInTx(
  tx: PrismaTransactionClient,
  params: LegacyApplyDiscountParams,
): Promise<void> {
  const { result, lineItems, discountCodeId } = params;

  // Resolve the code value for audit messages (matches prior L187-189 behaviour).
  const codeValue = discountCodeId
    ? await tx.discountCode
        .findUnique({ where: { id: discountCodeId }, select: { code: true } })
        .then((c) => c?.code ?? undefined)
    : undefined;

  const allocations = buildAllocations(result.discount, result.discountAmount, lineItems);

  await commitDiscountApplication(tx, {
    orderId: params.orderId,
    tenantId: params.tenantId,
    guestEmail: params.guestEmail,
    guestAccountId: params.guestAccountId,
    impact: {
      valid: true,
      discount: result.discount,
      discountCodeId,
      discountCodeValue: codeValue,
      discountAmount: result.discountAmount,
      allocations,
      title: result.title,
      description: result.description,
      // Legacy callers (FAS 6.2 checkout routes) are all D2C guest flows.
      // COMPANY callers go through calculateDiscountImpact + commitDiscountApplication directly.
      buyerKind: "GUEST",
    },
  });
}
