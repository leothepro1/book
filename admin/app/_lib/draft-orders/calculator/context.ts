/**
 * Pure construction helpers shared by the calculator orchestrator + the
 * FAS 6.5B discount services.
 *
 * All functions here are pure — no DB, no time dependency, no side
 * effects. The orchestrator feeds them pre-loaded rows; services calling
 * `calculateDiscountImpact` directly (applyDiscountCode, preview) use
 * the same helpers to avoid duplicating ctx/input assembly.
 */

import type { CalculatedDiscountImpact } from "@/app/_lib/discounts/apply";
import type { ConditionContext } from "@/app/_lib/discounts/eligibility";
import { getTaxRate } from "@/app/_lib/orders/tax";
import type { ComputedTaxLine } from "@/app/_lib/tax/types";
import type {
  DraftTotalsInput,
  DraftTotalsLineInput,
} from "./types";

// ── Raw prisma-row shapes (trimmed to fields this module reads) ──

export type RawDraftOrder = {
  id: string;
  tenantId: string;
  status: string;
  buyerKind: "GUEST" | "COMPANY" | "WALK_IN";
  companyLocationId: string | null;
  contactEmail: string | null;
  guestAccountId: string | null;
  currency: string;
  taxesIncluded: boolean;
  shippingCents: bigint;
  pricesFrozenAt: Date | null;
  appliedDiscountCode: string | null;
  // Persisted snapshot (only used on the frozen path in orchestrator)
  subtotalCents: bigint;
  orderDiscountCents: bigint;
  totalTaxCents: bigint;
  totalCents: bigint;
  lineItems: RawDraftLineItem[];
};

export type RawDraftLineItem = {
  id: string;
  lineType: "ACCOMMODATION" | "PRODUCT" | "CUSTOM";
  accommodationId: string | null;
  productId: string | null;
  checkInDate: Date | null;
  checkOutDate: Date | null;
  quantity: number;
  unitPriceCents: bigint;
  subtotalCents: bigint;
  lineDiscountCents: bigint;
  lineDiscountType: "PERCENTAGE" | "FIXED_AMOUNT" | null;
  lineDiscountValue: unknown; // Decimal — stringified via `String()` at use
  taxable: boolean;
  taxCode: string | null;
  // Persisted snapshot (only used on the frozen path in orchestrator)
  taxAmountCents: bigint;
  totalCents: bigint;
};

// ── Constants ──────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

// ── Stay-window derivation ─────────────────────────────────────

/**
 * Derive a single stay window spanning all ACCOMMODATION lines in the
 * draft. Used to populate `ConditionContext.checkInDate/checkOutDate/nights`
 * for the discount engine. Product-only drafts get `undefined` dates and
 * `nights = 0`.
 *
 * Semantics (FAS 6.4 audit §9 Q on multi-accommodation drafts): earliest
 * check-in across ACC lines + latest check-out. `nights = ceil(diff /
 * MS_PER_DAY)`. For a multi-stay B2B draft this is a reasonable default;
 * per-line discount eval is future work.
 */
export function deriveStayWindow(lines: RawDraftLineItem[]): {
  checkInDate: Date | undefined;
  checkOutDate: Date | undefined;
  nights: number;
} {
  const accLines = lines.filter(
    (l) => l.lineType === "ACCOMMODATION" && l.checkInDate && l.checkOutDate,
  );
  if (accLines.length === 0) {
    return { checkInDate: undefined, checkOutDate: undefined, nights: 0 };
  }
  let earliest = accLines[0].checkInDate as Date;
  let latest = accLines[0].checkOutDate as Date;
  for (const l of accLines) {
    const ci = l.checkInDate as Date;
    const co = l.checkOutDate as Date;
    if (ci < earliest) earliest = ci;
    if (co > latest) latest = co;
  }
  const diff = latest.getTime() - earliest.getTime();
  const nights = diff > 0 ? Math.ceil(diff / MS_PER_DAY) : 0;
  return { checkInDate: earliest, checkOutDate: latest, nights };
}

// ── Per-line tax rate resolution ───────────────────────────────

/**
 * Resolve the tax rate for a line per audit §2:
 *   - `!line.taxable` → 0 bp (per-line kill switch).
 *   - ACCOMMODATION → `Accommodation.taxRate` via pre-loaded map, fallback 0.
 *   - PRODUCT / CUSTOM → `getTaxRate(...)` stub (0 today).
 *
 * `accTaxRateMap` is keyed by `Accommodation.id` and is pre-loaded by
 * the orchestrator (batched `findMany` for all accommodation IDs the
 * draft references).
 */
export function resolveLineTaxRateBp(
  line: RawDraftLineItem,
  accTaxRateMap: Map<string, number>,
): number {
  if (!line.taxable) return 0;
  if (line.lineType === "ACCOMMODATION") {
    if (line.accommodationId) {
      return accTaxRateMap.get(line.accommodationId) ?? 0;
    }
    return 0;
  }
  // PRODUCT / CUSTOM — flat tenant-level stub. Returns 0 until a real
  // tax engine is wired per Q2-open resolution.
  return getTaxRate("STANDARD", "SE");
}

// ── Discount engine input ──────────────────────────────────────

/**
 * Build the inputs for `calculateDiscountImpact`: both the
 * `ConditionContext` (omit `now`; caller supplies) and the line-item
 * shape the discount engine expects.
 *
 * Matches the orchestrator's internal assembly 1:1. Exposed so the
 * FAS 6.5B discount services (applyDiscountCode, preview) can validate
 * without re-implementing the ctx construction.
 *
 * WALK_IN buyerKind maps to GUEST at this layer (audit Section 8).
 */
export function buildDiscountEngineInput(
  draft: RawDraftOrder,
  lineItems: RawDraftLineItem[],
): {
  ctx: Omit<ConditionContext, "now">;
  discountLineItems: Array<{
    id: string;
    productId: string;
    totalAmount: number;
  }>;
} {
  const productIds = Array.from(
    new Set(
      lineItems
        .map((l) => l.productId ?? l.accommodationId)
        .filter((x): x is string => Boolean(x)),
    ),
  );
  const itemCount = lineItems.reduce(
    (sum, l) => sum + Math.max(0, l.quantity),
    0,
  );
  const orderAmount = lineItems.reduce(
    (sum, l) => sum + Number(l.subtotalCents - l.lineDiscountCents),
    0,
  );
  const stayWindow = deriveStayWindow(lineItems);
  const ctxBuyerKind: "GUEST" | "COMPANY" =
    draft.buyerKind === "COMPANY" ? "COMPANY" : "GUEST";

  const ctx: Omit<ConditionContext, "now"> = {
    orderAmount: Math.max(0, orderAmount),
    productIds,
    itemCount,
    guestEmail: draft.contactEmail ?? undefined,
    guestAccountId: draft.guestAccountId ?? undefined,
    guestSegmentIds: [], // engine re-hydrates from guestEmail
    checkInDate: stayWindow.checkInDate,
    checkOutDate: stayWindow.checkOutDate,
    nights: stayWindow.nights,
    buyerKind: ctxBuyerKind,
    companyLocationId: draft.companyLocationId ?? undefined,
  };

  const discountLineItems = lineItems.map((l) => ({
    id: l.id,
    productId: l.productId ?? l.accommodationId ?? "",
    totalAmount: Number(l.subtotalCents - l.lineDiscountCents),
  }));

  return { ctx, discountLineItems };
}

// ── DraftTotalsInput assembly ──────────────────────────────────

/**
 * Build a `DraftTotalsInput` for `computeDraftTotalsPure`. Combines the
 * DraftOrder + lines + pre-resolved tax rates + (optional) discount
 * impact into the pure-core's expected shape.
 *
 * Callers:
 *   - Orchestrator's `computeDraftTotals` — after it resolves
 *     `accTaxRateMap`, `companyTaxExempt`, and `orderDiscountImpact`
 *     against committed/live DB state.
 *   - `previewApplyDiscountCode` (FAS 6.5B) — assembles a hypothetical
 *     input with a projected `orderDiscountImpact` for a would-be code,
 *     without persisting.
 */
/**
 * Per-line tax resolution from the Tax-1 calculator (Tax-2 wire-up).
 * The orchestrator (or preview-totals) maps a `TaxResponse` into this
 * shape and feeds it back into `buildDraftTotalsInput` so the pure
 * core can echo `taxCents` instead of computing it inline.
 */
export type TaxByLineEntry = {
  taxCents: bigint;
  taxLines: ComputedTaxLine[];
};

export function buildDraftTotalsInput(params: {
  draft: RawDraftOrder;
  lineItems: RawDraftLineItem[];
  /**
   * Legacy FAS 6.4 path. When set, the input carries `taxRateBp` per
   * line and the pure core computes tax inline. Tax-2 callers should
   * pass `taxByLineId` instead.
   */
  accTaxRateMap?: Map<string, number>;
  /**
   * Tax-2 path. When set, lines carry pre-computed `taxCents` +
   * `taxLines` from the calculator; the pure core skips inline tax
   * computation. Mutually exclusive with `accTaxRateMap` in practice
   * (calculator-supplied taxCents wins when both are present).
   */
  taxByLineId?: Map<string, TaxByLineEntry>;
  companyTaxExempt: boolean;
  orderDiscountImpact:
    | Extract<CalculatedDiscountImpact, { valid: true }>
    | null;
}): DraftTotalsInput {
  const {
    draft,
    lineItems,
    accTaxRateMap,
    taxByLineId,
    companyTaxExempt,
    orderDiscountImpact,
  } = params;

  const lines: DraftTotalsLineInput[] = lineItems.map((l) => {
    const fromCalculator = taxByLineId?.get(l.id);
    return {
      id: l.id,
      lineType: l.lineType,
      unitPriceCents: l.unitPriceCents,
      quantity: l.quantity,
      subtotalCents: l.subtotalCents,
      taxable: l.taxable,
      taxRateBp: accTaxRateMap
        ? resolveLineTaxRateBp(l, accTaxRateMap)
        : undefined,
      taxCents: fromCalculator?.taxCents,
      taxLines: fromCalculator?.taxLines,
      lineDiscountCents: l.lineDiscountCents,
      lineDiscountType: l.lineDiscountType,
      lineDiscountValue:
        l.lineDiscountValue === null || l.lineDiscountValue === undefined
          ? null
          : String(l.lineDiscountValue),
    };
  });

  const ctxBuyerKind: "GUEST" | "COMPANY" =
    draft.buyerKind === "COMPANY" ? "COMPANY" : "GUEST";

  return {
    currency: draft.currency,
    buyerKind: ctxBuyerKind,
    taxesIncluded: draft.taxesIncluded,
    companyTaxExempt,
    shippingCents: draft.shippingCents,
    lines,
    orderDiscountImpact,
  };
}
