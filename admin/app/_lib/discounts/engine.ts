/**
 * Discount Engine
 * ═══════════════
 *
 * The single entry point for discount evaluation. All discount resolution
 * flows through this file. Never call Prisma discount queries outside
 * this file (except apply.ts which writes within a transaction).
 *
 * ── SCOPE for FAS 6.3 ────────────────────────────────────────────
 *   - Product scoping via `appliesToAllProducts` + targetedProducts/Collections
 *   - Customer scoping via `appliesToAllCustomers` + targetedSegments/Customers
 *   - B2B opt-in via `appliesToCompanies` — gates COMPANY buyers
 *
 * ── NOT IN SCOPE (future work) ───────────────────────────────────
 *   - CompanyContact-level targeting (DiscountCompany table)
 *   - CompanyLocation-level targeting (DiscountCompanyLocation table)
 *
 * INVARIANT: CompanyContact/CompanyLocation targeting is future work;
 * 6.3 supports appliesToAllCustomers + appliesToCompanies only. Company
 * buyers have no GuestAccount, so any discount with
 * `appliesToAllCustomers=false` silently fails the customer-scope check
 * for them — by design. To reach a COMPANY buyer in 6.3 a discount must
 * have BOTH `appliesToAllCustomers=true` AND `appliesToCompanies=true`.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { findDiscountCode } from "./codes";
import { evaluateAllConditions, type ConditionContext } from "./eligibility";
import type {
  ApplyDiscountCodeInput,
  DiscountEvaluationResult,
  DiscountWithRelations,
} from "./types";

// ── Constants ──────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

// ── Helpers ────────────────────────────────────────────────────

function deriveNights(
  checkInDate: Date | undefined,
  checkOutDate: Date | undefined,
): number {
  if (!checkInDate || !checkOutDate) return 0;
  const diff = checkOutDate.getTime() - checkInDate.getTime();
  return diff > 0 ? Math.ceil(diff / MS_PER_DAY) : 0;
}

function buildConditionContext(
  ctx: Omit<ConditionContext, "now">,
  now: Date,
): ConditionContext {
  return { ...ctx, now };
}

/**
 * Calculate discount amount based on value type and target.
 * PERCENTAGE + ORDER: Math.floor(orderAmount * value / 10000)
 * FIXED_AMOUNT: min(value, orderAmount) — never exceed order total
 */
function calculateDiscountAmount(
  discount: DiscountWithRelations,
  orderAmount: number,
): number {
  if (discount.valueType === "PERCENTAGE") {
    return Math.floor((orderAmount * discount.value) / 10000);
  }
  // FIXED_AMOUNT — never exceed order total
  return Math.min(discount.value, orderAmount);
}

/**
 * Validate discount status and usage limits.
 * Returns null if all checks pass, or an error code if not.
 */
function checkDiscountValidity(
  discount: DiscountWithRelations,
  now: Date,
): DiscountEvaluationResult | null {
  if (discount.status === "DISABLED") {
    return { valid: false, error: "DISCOUNT_DISABLED" };
  }
  if (discount.startsAt > now) {
    return { valid: false, error: "DISCOUNT_NOT_STARTED" };
  }
  if (discount.endsAt && discount.endsAt < now) {
    return { valid: false, error: "DISCOUNT_EXPIRED" };
  }
  if (
    discount.usageLimit !== null &&
    discount.usageCount >= discount.usageLimit
  ) {
    return { valid: false, error: "USAGE_LIMIT_REACHED" };
  }
  return null;
}

/**
 * Check ONCE_PER_CUSTOMER condition via DB lookup.
 * Returns true if the customer has already used this discount.
 */
async function hasCustomerUsedDiscount(
  tenantId: string,
  discountId: string,
  guestEmail: string,
): Promise<boolean> {
  const usage = await prisma.discountUsage.findFirst({
    where: { tenantId, discountId, guestEmail },
    select: { id: true },
  });
  return usage !== null;
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Evaluate whether an automatic discount applies to the current context.
 * Called at checkout build time — before order creation.
 * Returns the first matching active AUTOMATIC discount for this tenant,
 * or { valid: false } if none match.
 */
export async function evaluateAutomaticDiscount(
  tenantId: string,
  ctx: Omit<ConditionContext, "now">,
): Promise<DiscountEvaluationResult> {
  const now = new Date();

  // Check tenant toggle
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { discountsEnabled: true },
  });
  if (!tenant || !tenant.discountsEnabled) {
    return { valid: false, error: "TENANT_DISCOUNTS_DISABLED" };
  }

  // Find all active automatic discounts for this tenant
  const discounts = await prisma.discount.findMany({
    where: {
      tenantId,
      method: "AUTOMATIC",
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    include: {
      conditions: true,
      codes: true,
      targetedProducts: true,
      targetedCollections: true,
      targetedSegments: true,
      targetedCustomers: true,
    },
    orderBy: { createdAt: "asc" },
  });

  for (const discount of discounts) {
    // Check usage limit
    if (
      discount.usageLimit !== null &&
      discount.usageCount >= discount.usageLimit
    ) {
      continue;
    }

    // B2B opt-in gate — COMPANY buyers skip discounts that haven't opted in.
    // Independent of customer scoping; see engine.ts header.
    if (ctx.buyerKind === "COMPANY" && !discount.appliesToCompanies) {
      continue;
    }

    // Product scope check
    if (!discount.appliesToAllProducts) {
      const targetedProductIds = discount.targetedProducts.map((tp) => tp.productId);
      const collectionProductIds: string[] = [];
      if (discount.targetedCollections.length > 0) {
        const collectionIds = discount.targetedCollections.map((tc) => tc.collectionId);
        const items = await prisma.productCollectionItem.findMany({
          where: { collectionId: { in: collectionIds } },
          select: { productId: true },
        });
        collectionProductIds.push(...items.map((i) => i.productId));
      }
      const allTargetedIds = [...new Set([...targetedProductIds, ...collectionProductIds])];
      if (!ctx.productIds.some((id) => allTargetedIds.includes(id))) continue;
    }

    // Pre-fetch guest segment memberships
    const hasSegmentCondition = discount.conditions.some((c) => c.type === "CUSTOMER_SEGMENT");
    const guestSegmentIds: string[] = [];
    if ((hasSegmentCondition || !discount.appliesToAllCustomers) && ctx.guestEmail) {
      const account = await prisma.guestAccount.findFirst({
        where: { tenantId, email: ctx.guestEmail },
        select: { id: true, segmentMemberships: { where: { leftAt: null }, select: { segmentId: true } } },
      });
      if (account) {
        guestSegmentIds.push(...account.segmentMemberships.map((m) => m.segmentId));
      }
    }

    // Customer scope check
    if (!discount.appliesToAllCustomers) {
      const hasMatchingSegment = discount.targetedSegments.some((ts) =>
        guestSegmentIds.includes(ts.segmentId),
      );
      const guestAcct = ctx.guestEmail
        ? await prisma.guestAccount.findFirst({
            where: { tenantId, email: ctx.guestEmail },
            select: { id: true },
          })
        : null;
      const hasMatchingCustomer = guestAcct
        ? discount.targetedCustomers.some((tc) => tc.guestAccountId === guestAcct.id)
        : false;
      if (!hasMatchingSegment && !hasMatchingCustomer) continue;
    }

    // Check ONCE_PER_CUSTOMER — fail closed if email absent
    const oncePerCustomer = discount.conditions.find(
      (c) => c.type === "ONCE_PER_CUSTOMER",
    );
    if (oncePerCustomer) {
      if (!ctx.guestEmail) continue;
      const used = await hasCustomerUsedDiscount(discount.tenantId, discount.id, ctx.guestEmail);
      if (used) continue;
    }

    // Minimum requirements (typed fields on Discount, not condition rows)
    if (discount.minimumAmount !== null && ctx.orderAmount < discount.minimumAmount) continue;
    if (discount.minimumQuantity !== null && ctx.itemCount < discount.minimumQuantity) continue;

    const fullCtx = buildConditionContext({ ...ctx, guestSegmentIds, guestAccountId: ctx.guestAccountId }, now);

    // Evaluate all conditions
    if (!evaluateAllConditions(discount.conditions, fullCtx)) {
      continue;
    }

    const discountAmount = calculateDiscountAmount(discount, ctx.orderAmount);
    if (discountAmount <= 0) continue;

    log("info", "discount.automatic.matched", {
      tenantId,
      discountId: discount.id,
      discountAmount,
    });

    return {
      valid: true,
      discount,
      discountAmount,
      title: discount.title,
      description: discount.description,
    };
  }

  return { valid: false, error: "DISCOUNT_NOT_FOUND" };
}

/**
 * Evaluate a discount code entered by a guest.
 *
 * **CRITICAL:** This function must be re-run server-side at order creation.
 * The result from a preview/validation call must NEVER be trusted or cached.
 * The checkout flow calls this twice: once for UI feedback, once
 * authoritatively inside the order creation transaction.
 */
export async function evaluateDiscountCode(
  input: ApplyDiscountCodeInput,
): Promise<DiscountEvaluationResult> {
  const now = new Date();

  // Check tenant toggle
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: { discountsEnabled: true },
  });
  if (!tenant || !tenant.discountsEnabled) {
    return { valid: false, error: "TENANT_DISCOUNTS_DISABLED" };
  }

  // Look up code
  const codeRecord = await findDiscountCode(input.tenantId, input.code);
  if (!codeRecord) {
    return { valid: false, error: "DISCOUNT_NOT_FOUND" };
  }

  if (!codeRecord.isActive) {
    return { valid: false, error: "CODE_INACTIVE" };
  }

  const { discount } = codeRecord;

  // Status checks
  const validityError = checkDiscountValidity(discount, now);
  if (validityError) return validityError;

  // B2B opt-in gate — companies ineligible unless the discount opts in.
  // Independent of customer scoping; see engine.ts header.
  if (input.buyerKind === "COMPANY" && !discount.appliesToCompanies) {
    return { valid: false, error: "NOT_ELIGIBLE_FOR_COMPANIES" };
  }

  // Code-level usage limit
  if (
    codeRecord.usageLimit !== null &&
    codeRecord.usageCount >= codeRecord.usageLimit
  ) {
    return { valid: false, error: "CODE_USAGE_LIMIT_REACHED" };
  }

  // ONCE_PER_CUSTOMER — fail closed if email absent
  const oncePerCustomer = discount.conditions.find(
    (c) => c.type === "ONCE_PER_CUSTOMER",
  );
  if (oncePerCustomer) {
    if (!input.guestEmail) {
      return { valid: false, error: "CONDITION_NOT_MET" };
    }
    const used = await hasCustomerUsedDiscount(discount.tenantId, discount.id, input.guestEmail);
    if (used) {
      return { valid: false, error: "ONCE_PER_CUSTOMER_VIOLATED" };
    }
  }

  // Product scope check
  if (!discount.appliesToAllProducts) {
    const targetedProductIds = discount.targetedProducts.map((tp) => tp.productId);
    const collectionProductIds: string[] = [];
    if (discount.targetedCollections.length > 0) {
      const collectionIds = discount.targetedCollections.map((tc) => tc.collectionId);
      const items = await prisma.productCollectionItem.findMany({
        where: { collectionId: { in: collectionIds } },
        select: { productId: true },
      });
      collectionProductIds.push(...items.map((i) => i.productId));
    }
    const allTargetedIds = [...new Set([...targetedProductIds, ...collectionProductIds])];
    if (!input.productIds.some((id) => allTargetedIds.includes(id))) {
      return { valid: false, error: "CONDITION_NOT_MET" };
    }
  }

  // Pre-fetch guest segment memberships
  const hasSegmentCondition = discount.conditions.some((c) => c.type === "CUSTOMER_SEGMENT");
  const guestSegmentIds: string[] = [];
  if ((hasSegmentCondition || !discount.appliesToAllCustomers) && input.guestEmail) {
    const account = await prisma.guestAccount.findFirst({
      where: { tenantId: input.tenantId, email: input.guestEmail },
      select: { id: true, segmentMemberships: { where: { leftAt: null }, select: { segmentId: true } } },
    });
    if (account) {
      guestSegmentIds.push(...account.segmentMemberships.map((m) => m.segmentId));
    }
  }

  // Customer scope check
  if (!discount.appliesToAllCustomers) {
    const hasMatchingSegment = discount.targetedSegments.some((ts) =>
      guestSegmentIds.includes(ts.segmentId),
    );
    const guestAcct = input.guestEmail
      ? await prisma.guestAccount.findFirst({
          where: { tenantId: input.tenantId, email: input.guestEmail },
          select: { id: true },
        })
      : null;
    const hasMatchingCustomer = guestAcct
      ? discount.targetedCustomers.some((tc) => tc.guestAccountId === guestAcct.id)
      : false;
    if (!hasMatchingSegment && !hasMatchingCustomer) {
      return { valid: false, error: "CONDITION_NOT_MET" };
    }
  }

  // Minimum requirements
  if (discount.minimumAmount !== null && input.orderAmount < discount.minimumAmount) {
    return { valid: false, error: "CONDITION_NOT_MET" };
  }
  if (discount.minimumQuantity !== null && input.itemCount < discount.minimumQuantity) {
    return { valid: false, error: "CONDITION_NOT_MET" };
  }

  // Build context and evaluate conditions
  const nights = deriveNights(input.checkInDate, input.checkOutDate);
  const ctx = buildConditionContext(
    {
      orderAmount: input.orderAmount,
      productIds: input.productIds,
      itemCount: input.itemCount,
      guestEmail: input.guestEmail,
      guestAccountId: undefined,
      guestSegmentIds,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      nights,
      buyerKind: input.buyerKind,
      companyLocationId: input.companyLocationId,
    },
    now,
  );

  if (!evaluateAllConditions(discount.conditions, ctx)) {
    return { valid: false, error: "CONDITION_NOT_MET" };
  }

  const discountAmount = calculateDiscountAmount(discount, input.orderAmount);
  if (discountAmount <= 0) {
    return { valid: false, error: "CONDITION_NOT_MET" };
  }

  log("info", "discount.code.validated", {
    tenantId: input.tenantId,
    discountId: discount.id,
    code: codeRecord.code,
    discountAmount,
  });

  return {
    valid: true,
    discount,
    discountAmount,
    title: discount.title,
    description: discount.description,
  };
}
