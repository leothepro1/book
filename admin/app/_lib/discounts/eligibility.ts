/**
 * Discount Eligibility
 * ════════════════════
 *
 * Pure condition evaluation. No DB calls. All inputs passed explicitly.
 * Never calls new Date() — `now` is always injected for testability.
 */

import type { DiscountCondition } from "@prisma/client";

// ── Types ──────────────────────────────────────────────────────

export type ConditionContext = {
  orderAmount: number;       // ören
  productIds: string[];
  itemCount: number;
  guestEmail: string | undefined;
  guestAccountId: string | undefined; // for SPECIFIC_CUSTOMERS check
  guestSegmentIds: string[];          // pre-fetched segment IDs the guest belongs to
  checkInDate: Date | undefined;
  checkOutDate: Date | undefined;
  nights: number;            // derived: Math.ceil((checkOut - checkIn) / ms_per_day), 0 if not set
  now: Date;                 // injected for testability
};

// ── Constants ──────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

// ── Single condition evaluation ────────────────────────────────

/**
 * Evaluate a single condition against the context.
 * Returns true if condition is satisfied, false otherwise.
 * Never throws — treat malformed condition data as unsatisfied.
 */
export function evaluateCondition(
  condition: DiscountCondition,
  ctx: ConditionContext,
): boolean {
  switch (condition.type) {
    case "MIN_NIGHTS":
      return (
        typeof condition.intValue === "number" &&
        ctx.nights >= condition.intValue
      );

    case "DAYS_IN_ADVANCE": {
      if (typeof condition.intValue !== "number" || !ctx.checkInDate) {
        return false;
      }
      const daysUntilCheckIn = Math.ceil(
        (ctx.checkInDate.getTime() - ctx.now.getTime()) / MS_PER_DAY,
      );
      return daysUntilCheckIn >= condition.intValue;
    }

    case "ARRIVAL_WINDOW": {
      if (!ctx.checkInDate || !condition.jsonValue) return false;
      const jv = condition.jsonValue as Record<string, unknown>;
      if (typeof jv.startsAt !== "string" || typeof jv.endsAt !== "string") {
        return false;
      }
      const windowStart = new Date(jv.startsAt);
      const windowEnd = new Date(jv.endsAt);
      if (isNaN(windowStart.getTime()) || isNaN(windowEnd.getTime())) {
        return false;
      }
      return ctx.checkInDate >= windowStart && ctx.checkInDate <= windowEnd;
    }

    case "MIN_ORDER_AMOUNT":
      return (
        typeof condition.intValue === "number" &&
        ctx.orderAmount >= condition.intValue
      );

    case "MIN_ITEMS":
      return (
        typeof condition.intValue === "number" &&
        ctx.itemCount >= condition.intValue
      );

    case "SPECIFIC_PRODUCTS": {
      if (!Array.isArray(condition.jsonValue)) return false;
      const allowedIds = condition.jsonValue as string[];
      return ctx.productIds.some((id) => allowedIds.includes(id));
    }

    case "CUSTOMER_SEGMENT":
      // Segment membership pre-fetched by engine — never do DB calls in eligibility
      if (!condition.stringValue) return false;
      return ctx.guestSegmentIds.includes(condition.stringValue);

    case "ONCE_PER_CUSTOMER":
      // Uniqueness is checked via DB at evaluation time
      return true;

    default:
      return false;
  }
}

// ── Aggregate evaluation ───────────────────────────────────────

/**
 * Returns true if ALL conditions pass (AND logic).
 * An empty condition list always passes.
 */
export function evaluateAllConditions(
  conditions: DiscountCondition[],
  ctx: ConditionContext,
): boolean {
  return conditions.every((c) => evaluateCondition(c, ctx));
}
