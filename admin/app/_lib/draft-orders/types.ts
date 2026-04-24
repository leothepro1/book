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
  Order,
  OrderLineItem,
  Booking,
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
  Order,
  OrderLineItem,
  Booking,
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

// ── FAS 6.5C: hold services ─────────────────────────────────────

/** Source of a hold lifecycle event — surfaces in event metadata + webhooks. */
export type HoldReleaseSource =
  | "admin"
  | "line_removed"
  | "draft_cancelled"
  | "cron";

export const PlaceHoldForDraftLineInputSchema = z.object({
  tenantId: z.string().min(1),
  draftLineItemId: z.string().min(1),
  actorUserId: z.string().optional(),
  /**
   * Override the platform default. Clamped to [10 min, 24 h] by the
   * service per operator Q2.
   */
  holdDurationMs: z.number().int().positive().optional(),
  /** "admin" (default) or "batch" (placeHoldsForDraft) for event metadata. */
  source: z.enum(["admin", "batch"]).optional(),
});

export type PlaceHoldForDraftLineInput = z.infer<
  typeof PlaceHoldForDraftLineInputSchema
>;

export type PlaceHoldForDraftLineResult = {
  reservation: DraftReservation;
  holdExternalId: string;
  holdExpiresAt: Date;
};

export const ReleaseHoldForDraftLineInputSchema = z.object({
  tenantId: z.string().min(1),
  draftLineItemId: z.string().min(1),
  actorUserId: z.string().optional(),
  source: z
    .enum(["admin", "line_removed", "draft_cancelled", "cron"])
    .optional(),
});

export type ReleaseHoldForDraftLineInput = z.infer<
  typeof ReleaseHoldForDraftLineInputSchema
>;

export type ReleaseHoldForDraftLineResult = {
  reservation: DraftReservation;
  /** False when the adapter call threw but DB state is now RELEASED (cron retries adapter). */
  adapterReleaseOk: boolean;
};

export const PlaceHoldsForDraftInputSchema = z.object({
  tenantId: z.string().min(1),
  draftOrderId: z.string().min(1),
  actorUserId: z.string().optional(),
  holdDurationMs: z.number().int().positive().optional(),
});

export type PlaceHoldsForDraftInput = z.infer<
  typeof PlaceHoldsForDraftInputSchema
>;

export type PlaceHoldsForDraftResult = {
  placed: Array<{
    draftLineItemId: string;
    holdExternalId: string;
    holdExpiresAt: Date;
  }>;
  failed: Array<{ draftLineItemId: string; error: string }>;
  skipped: Array<{ draftLineItemId: string; reason: string }>;
};

// ── FAS 6.5D lifecycle: sendInvoice ──────────────────────────────

/**
 * Invoice sending moves a draft from OPEN / APPROVED → INVOICED.
 *
 * REQUIRES all ACCOMMODATION DraftReservations in PLACED state. Prevents
 * the "invoiced but not held" failure mode. Admin workflow:
 *   addLineItem → placeHoldsForDraft → freezePrices → sendInvoice.
 *
 * S5 is an intentional escalation of commitment level:
 *   - freezePrices is a calculation decision (no hold requirement)
 *   - placeHoldForDraftLine is optional for admin
 *   - sendInvoice is a customer commitment (requires holds)
 */
export const SendInvoiceInputSchema = z.object({
  tenantId: z.string().min(1),
  draftOrderId: z.string().min(1),
  /** Override the default 30-day share-link TTL. Clamped [1d, 90d] by the service. */
  shareLinkTtlMs: z.number().int().positive().optional(),
  /** Stored on DraftOrder.invoiceEmailSubject for a future email-send path. */
  invoiceEmailSubject: z.string().max(200).optional(),
  /** Stored on DraftOrder.invoiceEmailMessage. */
  invoiceEmailMessage: z.string().max(10000).optional(),
  actorUserId: z.string().optional(),
});

export type SendInvoiceInput = z.infer<typeof SendInvoiceInputSchema>;
export type SendInvoiceArgs = z.input<typeof SendInvoiceInputSchema>;

export type SendInvoiceResult = {
  draft: DraftOrder;
  /** Public URL the buyer uses to view + pay the invoice. */
  invoiceUrl: string;
  /** Opaque token embedded in invoiceUrl; also stored on DraftOrder.shareLinkToken. */
  shareLinkToken: string;
  shareLinkExpiresAt: Date;
  /** Stripe PaymentIntent client_secret — returned so the admin UI can inline-preview. */
  clientSecret: string;
  /** Stripe PaymentIntent ID (pi_...). Stored on DraftOrder.metafields.stripePaymentIntentId. */
  stripePaymentIntentId: string;
};

// ── FAS 6.5D lifecycle: cancelDraft ──────────────────────────────

/**
 * Cancel a draft from non-terminal status. PAID drafts are rejected
 * (per C3) because refund handling is out of 6.5D scope — staff must
 * issue the Stripe refund manually, then run cancelDraft.
 *
 * Hold release is best-effort: per-reservation adapter.releaseHold
 * errors are logged and surfaced via result.holdReleaseErrors but do
 * NOT abort the cancel. The cron picks up stragglers.
 */
export const CancelDraftInputSchema = z.object({
  tenantId: z.string().min(1),
  draftOrderId: z.string().min(1),
  /** Required when status is INVOICED or OVERDUE. */
  reason: z.string().max(500).optional(),
  actorUserId: z.string().optional(),
  /** "admin_ui" (default) or "cron" for event-trail attribution. */
  actorSource: z.enum(["admin_ui", "cron"]).default("admin_ui"),
});

export type CancelDraftInput = z.infer<typeof CancelDraftInputSchema>;
export type CancelDraftArgs = z.input<typeof CancelDraftInputSchema>;

export type CancelDraftResult = {
  draft: DraftOrder;
  /** Number of reservations RELEASED in this call (excludes ones already terminal). */
  releasedHolds: number;
  /** Per-reservation adapter-release errors (non-fatal — logged only). */
  holdReleaseErrors: Array<{ draftLineItemId: string; error: string }>;
  /** True iff we attempted to cancel a Stripe PaymentIntent for this draft. */
  stripePaymentIntentCancelAttempted: boolean;
  /** Error string iff the PI-cancel call failed; null on success or not-attempted. */
  stripePaymentIntentCancelError: string | null;
};

// ── FAS 6.5D lifecycle: convertDraftToOrder ──────────────────────

/**
 * Promote a PAID draft to a COMPLETED order.
 *
 * Called by the Stripe webhook handler after the INVOICED → PAID tx,
 * or by an admin recovery tool. Produces Order + OrderLineItems +
 * Bookings atomically, commits the discount, and confirms every
 * DraftReservation at the PMS.
 *
 * actorSource controls the confirmHold idempotency strategy:
 *   - "webhook"                → deterministic key (Stripe-retry safe;
 *                                same PI + same reservation = same key,
 *                                hitting the PmsIdempotencyKey cache)
 *   - "admin_manual_recovery"  → attemptNonce appended to the key,
 *                                producing a fresh claim. Escapes the
 *                                cached-FAILED trap (audit §13 F2).
 */
export const ConvertDraftToOrderInputSchema = z.object({
  tenantId: z.string().min(1),
  draftOrderId: z.string().min(1),
  /** Stripe PaymentIntent ID that settled for this draft (pi_...). */
  stripePaymentIntentId: z.string().min(1),
  /** Webhook (normal) vs admin manual recovery (retry after cached FAILED). */
  actorSource: z.enum(["webhook", "admin_manual_recovery"]).default("webhook"),
  actorUserId: z.string().optional(),
});

export type ConvertDraftToOrderInput = z.infer<
  typeof ConvertDraftToOrderInputSchema
>;
export type ConvertDraftToOrderArgs = z.input<
  typeof ConvertDraftToOrderInputSchema
>;

export type ConvertDraftToOrderResult = {
  draft: DraftOrder;
  order: Order;
  orderLineItems: OrderLineItem[];
  bookings: Booking[];
  /** True on idempotent replay — draft already converted; existing Order returned. */
  alreadyConverted: boolean;
};

// ── FAS 6.5D typed accessors for DraftOrder.metafields ───────────

/**
 * Typed read of the Stripe PaymentIntent ID stored on a DraftOrder.
 *
 * Per Q5 (audit §15.2), we store the PaymentIntent ID in
 * `DraftOrder.metafields.stripePaymentIntentId` rather than adding a
 * dedicated column, to minimise schema churn in 6.5D. This accessor
 * is the ONLY type-safe read path — consumers must not touch
 * `metafields` directly, so a future migration to a column stays
 * a one-line refactor here.
 *
 * Returns null when no invoice has been sent (metafields absent or
 * missing the key) or when the stored value is not a non-empty string.
 */
export function getDraftStripePaymentIntentId(
  draft: Pick<DraftOrder, "metafields">,
): string | null {
  const mf = draft.metafields;
  if (mf === null || mf === undefined) return null;
  if (typeof mf !== "object" || Array.isArray(mf)) return null;
  const v = (mf as Record<string, unknown>).stripePaymentIntentId;
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Typed read of a draft's public invoice URL. Simple passthrough today —
 * lives here so consumers have a single import surface for draft-level
 * data accessors and the field can migrate to a derived shape later.
 */
export function getDraftInvoiceUrl(
  draft: Pick<DraftOrder, "invoiceUrl">,
): string | null {
  return draft.invoiceUrl ?? null;
}
