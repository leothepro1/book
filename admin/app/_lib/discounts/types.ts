/**
 * Discount Types
 * ══════════════
 *
 * Zod schemas and TypeScript types for the discount system.
 * All monetary amounts in smallest currency unit (ören/cents) — never floats.
 * Percentage values in basis points (1500 = 15.00%).
 */

import { z } from "zod";
import type {
  Discount,
  DiscountCode,
  DiscountCondition,
  DiscountProduct,
  DiscountCollection,
  DiscountSegment,
  DiscountCustomer,
} from "@prisma/client";

// ── Re-exports for convenience ─────────────────────────────────

export type { Discount, DiscountCode, DiscountCondition };

// ── Composite types ────────────────────────────────────────────

export type DiscountWithRelations = Discount & {
  codes: DiscountCode[];
  conditions: DiscountCondition[];
  targetedProducts: DiscountProduct[];
  targetedCollections: DiscountCollection[];
  targetedSegments: DiscountSegment[];
  targetedCustomers: DiscountCustomer[];
};

// ── Evaluation result ──────────────────────────────────────────

export type DiscountEvaluationError =
  | "DISCOUNT_NOT_FOUND"
  | "DISCOUNT_DISABLED"
  | "DISCOUNT_EXPIRED"
  | "DISCOUNT_NOT_STARTED"
  | "USAGE_LIMIT_REACHED"
  | "CODE_USAGE_LIMIT_REACHED"
  | "CODE_INACTIVE"
  | "CONDITION_NOT_MET"
  | "ONCE_PER_CUSTOMER_VIOLATED"
  | "TENANT_DISCOUNTS_DISABLED"
  | "NOT_ELIGIBLE_FOR_COMPANIES";

export type DiscountEvaluationResult =
  | {
      valid: true;
      discount: DiscountWithRelations;
      discountAmount: number;
      title: string;
      description: string | null;
    }
  | { valid: false; error: DiscountEvaluationError };

// ── Condition input schema ─────────────────────────────────────

export const createDiscountConditionInput = z
  .object({
    type: z.enum([
      "MIN_NIGHTS",
      "DAYS_IN_ADVANCE",
      "ARRIVAL_WINDOW",
      "MIN_ORDER_AMOUNT",
      "MIN_ITEMS",
      "SPECIFIC_PRODUCTS",
      "CUSTOMER_SEGMENT",
      "ONCE_PER_CUSTOMER",
    ]),
    intValue: z.number().int().nonnegative().optional(),
    stringValue: z.string().optional(),
    jsonValue: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    switch (data.type) {
      case "MIN_NIGHTS":
        if (data.intValue === undefined || data.intValue < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "MIN_NIGHTS kräver intValue >= 1",
            path: ["intValue"],
          });
        }
        break;
      case "DAYS_IN_ADVANCE":
        if (data.intValue === undefined || data.intValue < 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "DAYS_IN_ADVANCE kräver intValue >= 0",
            path: ["intValue"],
          });
        }
        break;
      case "ARRIVAL_WINDOW": {
        if (!data.jsonValue || typeof data.jsonValue !== "object") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "ARRIVAL_WINDOW kräver jsonValue med startsAt och endsAt",
            path: ["jsonValue"],
          });
          break;
        }
        const jv = data.jsonValue as Record<string, unknown>;
        if (typeof jv.startsAt !== "string" || typeof jv.endsAt !== "string") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "ARRIVAL_WINDOW kräver jsonValue.startsAt och jsonValue.endsAt som strängar",
            path: ["jsonValue"],
          });
        }
        break;
      }
      case "MIN_ORDER_AMOUNT":
        if (data.intValue === undefined || data.intValue < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "MIN_ORDER_AMOUNT kräver intValue >= 1",
            path: ["intValue"],
          });
        }
        break;
      case "MIN_ITEMS":
        if (data.intValue === undefined || data.intValue < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "MIN_ITEMS kräver intValue >= 1",
            path: ["intValue"],
          });
        }
        break;
      case "SPECIFIC_PRODUCTS": {
        if (!Array.isArray(data.jsonValue) || data.jsonValue.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "SPECIFIC_PRODUCTS kräver jsonValue som icke-tom string[]",
            path: ["jsonValue"],
          });
          break;
        }
        if (!data.jsonValue.every((v: unknown) => typeof v === "string")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "SPECIFIC_PRODUCTS jsonValue måste vara string[]",
            path: ["jsonValue"],
          });
        }
        break;
      }
      case "CUSTOMER_SEGMENT":
        if (!data.stringValue || data.stringValue.trim().length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "CUSTOMER_SEGMENT kräver stringValue (segmentId)",
            path: ["stringValue"],
          });
        }
        break;
      case "ONCE_PER_CUSTOMER":
        // No value required — presence means the rule is active
        break;
    }
  });

export type CreateDiscountConditionInput = z.infer<typeof createDiscountConditionInput>;

// ── Discount input schema ──────────────────────────────────────

export const createDiscountInput = z
  .object({
    title: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    method: z.enum(["AUTOMATIC", "CODE"]),
    valueType: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
    value: z.number().int().positive(),
    targetType: z.enum(["ORDER", "LINE_ITEM"]),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    usageLimit: z.number().int().positive().optional(),
    combinesWithProductDiscounts: z.boolean().default(false),
    combinesWithOrderDiscounts: z.boolean().default(false),
    combinesWithShippingDiscounts: z.boolean().default(false),
    conditions: z.array(createDiscountConditionInput).default([]),
    codes: z.array(z.string().min(1).max(64)).optional(),
    // Targeting scope
    appliesToAllProducts: z.boolean().default(true),
    appliesToAllCustomers: z.boolean().default(true),
    targetedProductIds: z.array(z.string()).default([]),
    targetedCollectionIds: z.array(z.string()).default([]),
    targetedSegmentIds: z.array(z.string()).default([]),
    targetedGuestAccountIds: z.array(z.string()).default([]),
    // Minimum requirements
    minimumAmount: z.number().int().nonnegative().optional(),
    minimumQuantity: z.number().int().nonnegative().optional(),
  })
  .superRefine((data, ctx) => {
    // CODE method requires at least one code
    if (data.method === "CODE") {
      if (!data.codes || data.codes.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Rabattkoder krävs för metod CODE",
          path: ["codes"],
        });
      }
    }

    // AUTOMATIC method must not have codes
    if (data.method === "AUTOMATIC") {
      if (data.codes && data.codes.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Automatiska rabatter kan inte ha koder",
          path: ["codes"],
        });
      }
    }

    // PERCENTAGE: value in basis points, 1–10000 (0.01% to 100%)
    if (data.valueType === "PERCENTAGE") {
      if (data.value < 1 || data.value > 10000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Procentvärde måste vara 1–10000 baspunkter",
          path: ["value"],
        });
      }
    }

    // Targeting: if not all products, must have at least one target
    if (!data.appliesToAllProducts && data.targetedProductIds.length === 0 && data.targetedCollectionIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Välj minst en produkt eller produktserie",
        path: ["targetedProductIds"],
      });
    }

    // Targeting: if not all customers, must have at least one target
    if (!data.appliesToAllCustomers && data.targetedSegmentIds.length === 0 && data.targetedGuestAccountIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Välj minst ett kundsegment eller en kund",
        path: ["targetedSegmentIds"],
      });
    }

    // endsAt must be after startsAt
    if (data.endsAt && data.startsAt && data.endsAt <= data.startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Slutdatum måste vara efter startdatum",
        path: ["endsAt"],
      });
    }
  });

export type CreateDiscountInput = z.infer<typeof createDiscountInput>;

// ── Checkout code application schema ───────────────────────────

export const applyDiscountCodeInput = z.object({
  tenantId: z.string().min(1),
  code: z.string().min(1).max(64),
  orderAmount: z.number().int().nonnegative(),
  productIds: z.array(z.string()).default([]),
  itemCount: z.number().int().nonnegative().default(0),
  guestEmail: z.string().email().optional(),
  checkInDate: z.coerce.date().optional(),
  checkOutDate: z.coerce.date().optional(),
  /** Buyer classification. Defaults to GUEST so existing HTTP callers need no change. */
  buyerKind: z.enum(["GUEST", "COMPANY"]).optional().default("GUEST"),
  companyLocationId: z.string().optional(),
});

export type ApplyDiscountCodeInput = z.infer<typeof applyDiscountCodeInput>;
