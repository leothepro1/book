/**
 * DraftOrder service-layer types and Zod schemas.
 *
 * Input validation (Zod) happens at every service entry point. Result
 * types are the service's public contract to the admin API / UI layer.
 *
 * All monetary values are BigInt ören. Currency strings carry the same
 * "SEK" default as the DraftOrder schema.
 */

import { z } from "zod";
import type {
  DraftOrder,
  DraftLineItem,
  DraftReservation,
  DraftOrderStatus,
  DraftBuyerKind,
  DraftLineItemType,
} from "@prisma/client";
import type { DraftTotals } from "./calculator";

// ── Re-exports (convenience for callers) ────────────────────────

export type {
  DraftOrder,
  DraftLineItem,
  DraftReservation,
  DraftOrderStatus,
  DraftBuyerKind,
  DraftLineItemType,
};

// ── Shared helper schemas ────────────────────────────────────────

const ISODateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const GuestCountsSchema = z.object({
  adults: z.number().int().min(1).max(99),
  children: z.number().int().min(0).max(99).default(0),
  infants: z.number().int().min(0).max(99).default(0),
});

const LineDiscountFields = z.object({
  lineDiscountCents: z.bigint().nonnegative().optional(),
  lineDiscountType: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]).optional(),
  lineDiscountValue: z.string().optional(),
  lineDiscountTitle: z.string().optional(),
});

// ── createDraft ──────────────────────────────────────────────────

export const CreateDraftInputSchema = z
  .object({
    tenantId: z.string().min(1),
    buyerKind: z.enum(["GUEST", "COMPANY", "WALK_IN"]),

    guestAccountId: z.string().optional(),
    companyLocationId: z.string().optional(),
    companyContactId: z.string().optional(),

    contactEmail: z.string().email().optional(),
    contactPhone: z.string().optional(),
    contactFirstName: z.string().optional(),
    contactLastName: z.string().optional(),

    poNumber: z.string().optional(),

    currency: z.string().min(3).max(3).default("SEK"),

    /** Override of the buyerKind-derived default (GUEST→true, COMPANY→false). */
    taxesIncluded: z.boolean().optional(),

    shippingCents: z.bigint().nonnegative().default(BigInt(0)),

    internalNote: z.string().optional(),
    customerNote: z.string().optional(),
    tags: z.array(z.string()).default([]),
    metafields: z.unknown().optional(),

    /** Override the 7-day default. Clamped to [1d, 90d]. */
    expiresAt: z.coerce.date().optional(),

    actorUserId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.buyerKind === "COMPANY" && !data.companyLocationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "COMPANY buyer requires companyLocationId",
        path: ["companyLocationId"],
      });
    }
    if (
      data.buyerKind === "GUEST" &&
      !data.guestAccountId &&
      !data.contactEmail
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GUEST buyer requires guestAccountId or contactEmail",
        path: ["guestAccountId"],
      });
    }
    // WALK_IN has no FK requirement.
  });

/** Post-parse output — defaults applied. Used internally by the service. */
export type CreateDraftInput = z.infer<typeof CreateDraftInputSchema>;
/** Pre-parse input — optional fields with zod defaults are truly optional. Used at the service entry boundary. */
export type CreateDraftArgs = z.input<typeof CreateDraftInputSchema>;

export type CreateDraftResult = { draft: DraftOrder };

// ── addLineItem ──────────────────────────────────────────────────

export const AccommodationLineInputSchema = z
  .object({
    lineType: z.literal("ACCOMMODATION"),
    accommodationId: z.string().min(1),
    checkInDate: ISODateString,
    checkOutDate: ISODateString,
    guestCounts: GuestCountsSchema,
    ratePlanId: z.string().optional(),
    selectedAddons: z.unknown().optional(),
    taxable: z.boolean().default(true),
    taxCode: z.string().optional(),
  })
  .merge(LineDiscountFields)
  .superRefine((data, ctx) => {
    if (new Date(data.checkOutDate) <= new Date(data.checkInDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "checkOutDate must be after checkInDate",
        path: ["checkOutDate"],
      });
    }
  });

export const ProductLineInputSchema = z
  .object({
    lineType: z.literal("PRODUCT"),
    productVariantId: z.string().min(1),
    quantity: z.number().int().min(1).max(9999).default(1),
    taxable: z.boolean().default(true),
    taxCode: z.string().optional(),
  })
  .merge(LineDiscountFields);

export const CustomLineInputSchema = z
  .object({
    lineType: z.literal("CUSTOM"),
    title: z.string().min(1).max(255),
    quantity: z.number().int().min(1).max(9999).default(1),
    unitPriceCents: z.bigint().nonnegative(),
    taxable: z.boolean().default(true),
    taxCode: z.string().optional(),
  })
  .merge(LineDiscountFields);

export const AddLineItemInputSchema = z.object({
  tenantId: z.string().min(1),
  draftOrderId: z.string().min(1),
  line: z.union([
    AccommodationLineInputSchema,
    ProductLineInputSchema,
    CustomLineInputSchema,
  ]),
  actorUserId: z.string().optional(),
});

export type AddLineItemInput = z.infer<typeof AddLineItemInputSchema>;

export type AddLineItemResult = {
  draft: DraftOrder;
  lineItem: DraftLineItem;
  /** Populated only for ACCOMMODATION lines (always `NOT_PLACED` in 6.5A). */
  reservation: DraftReservation | null;
  totals: DraftTotals;
};

// ── updateLineItem ───────────────────────────────────────────────

const AccommodationLinePatch = z.object({
  lineType: z.literal("ACCOMMODATION"),
  quantity: z.number().int().min(1).max(99).optional(),
  checkInDate: ISODateString.optional(),
  checkOutDate: ISODateString.optional(),
  guestCounts: GuestCountsSchema.optional(),
  ratePlanId: z.string().optional(),
  selectedAddons: z.unknown().optional(),
  taxable: z.boolean().optional(),
  taxCode: z.string().nullable().optional(),
  lineDiscountCents: z.bigint().nonnegative().nullable().optional(),
  lineDiscountType: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]).nullable().optional(),
  lineDiscountValue: z.string().nullable().optional(),
  lineDiscountTitle: z.string().nullable().optional(),
});

const ProductLinePatch = z.object({
  lineType: z.literal("PRODUCT"),
  quantity: z.number().int().min(1).max(9999).optional(),
  taxable: z.boolean().optional(),
  taxCode: z.string().nullable().optional(),
  lineDiscountCents: z.bigint().nonnegative().nullable().optional(),
  lineDiscountType: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]).nullable().optional(),
  lineDiscountValue: z.string().nullable().optional(),
  lineDiscountTitle: z.string().nullable().optional(),
});

const CustomLinePatch = z.object({
  lineType: z.literal("CUSTOM"),
  title: z.string().min(1).max(255).optional(),
  quantity: z.number().int().min(1).max(9999).optional(),
  unitPriceCents: z.bigint().nonnegative().optional(),
  taxable: z.boolean().optional(),
  taxCode: z.string().nullable().optional(),
  lineDiscountCents: z.bigint().nonnegative().nullable().optional(),
  lineDiscountType: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]).nullable().optional(),
  lineDiscountValue: z.string().nullable().optional(),
  lineDiscountTitle: z.string().nullable().optional(),
});

export const UpdateLineItemInputSchema = z.object({
  tenantId: z.string().min(1),
  draftOrderId: z.string().min(1),
  lineItemId: z.string().min(1),
  patch: z.union([
    AccommodationLinePatch,
    ProductLinePatch,
    CustomLinePatch,
  ]),
  actorUserId: z.string().optional(),
});

export type UpdateLineItemInput = z.infer<typeof UpdateLineItemInputSchema>;

export type UpdateLineItemResult = {
  draft: DraftOrder;
  lineItem: DraftLineItem;
  reservation: DraftReservation | null;
  totals: DraftTotals;
};

// ── removeLineItem ───────────────────────────────────────────────

export const RemoveLineItemInputSchema = z.object({
  tenantId: z.string().min(1),
  draftOrderId: z.string().min(1),
  lineItemId: z.string().min(1),
  actorUserId: z.string().optional(),
});

export type RemoveLineItemInput = z.infer<typeof RemoveLineItemInputSchema>;

export type RemoveLineItemResult = {
  draft: DraftOrder;
  totals: DraftTotals;
};

// ── FAS 6.5B discount services ──────────────────────────────────

export const ApplyDiscountCodeInputSchema = z.object({
  tenantId: z.string().min(1),
  draftOrderId: z.string().min(1),
  code: z
    .string()
    .min(1)
    .max(64)
    .transform((s) => s.trim()),
  actorUserId: z.string().optional(),
});

export type ApplyDiscountCodeInput = z.infer<typeof ApplyDiscountCodeInputSchema>;

/** Snapshot of the applied discount, returned by applyDiscountCode. */
export type AppliedDiscountSummary = {
  discountId: string;
  code: string;
  title: string;
  description: string | null;
  discountAmountCents: bigint;
  valueType: "PERCENTAGE" | "FIXED_AMOUNT";
};

export type ApplyDiscountCodeResult = {
  draft: DraftOrder;
  totals: DraftTotals;
  discount: AppliedDiscountSummary;
};

export const RemoveDiscountCodeInputSchema = z.object({
  tenantId: z.string().min(1),
  draftOrderId: z.string().min(1),
  actorUserId: z.string().optional(),
});

export type RemoveDiscountCodeInput = z.infer<typeof RemoveDiscountCodeInputSchema>;

export type RemoveDiscountCodeResult = {
  draft: DraftOrder;
  totals: DraftTotals;
};

export const PreviewApplyDiscountCodeInputSchema = z.object({
  tenantId: z.string().min(1),
  draftOrderId: z.string().min(1),
  code: z
    .string()
    .min(1)
    .max(64)
    .transform((s) => s.trim()),
});

export type PreviewApplyDiscountCodeInput = z.infer<
  typeof PreviewApplyDiscountCodeInputSchema
>;

export type PreviewDiscountResult =
  | {
      valid: true;
      impact: AppliedDiscountSummary;
      projectedTotals: DraftTotals;
    }
  | {
      valid: false;
      error: string; // DiscountEvaluationError string literal
    };

// ── FAS 6.5B lifecycle: freezePrices ────────────────────────────

export const FreezePricesInputSchema = z.object({
  tenantId: z.string().min(1),
  draftOrderId: z.string().min(1),
  actorUserId: z.string().optional(),
});

export type FreezePricesInput = z.infer<typeof FreezePricesInputSchema>;

export type FreezePricesResult = {
  draft: DraftOrder;
  totals: DraftTotals;
  frozenAt: Date;
};
