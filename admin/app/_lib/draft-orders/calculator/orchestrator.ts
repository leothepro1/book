/**
 * DraftCalculator — Orchestrator
 * ═══════════════════════════════
 *
 * Async entry point. Fetches the DraftOrder + its lines, resolves the
 * tax-rate per line and the company-tax-exempt flag, invokes
 * `calculateDiscountImpact` when a code is applied, then feeds a
 * pre-assembled `DraftTotalsInput` to the pure core.
 *
 * When `DraftOrder.pricesFrozenAt` is set, the orchestrator returns the
 * persisted snapshot DIRECTLY from the DraftOrder + DraftLineItem rows
 * without invoking the core. This guarantees the displayed totals match
 * the invoiced totals byte-for-byte.
 *
 * SCOPE NOTE (FAS 6.4):
 *   - Only CODE-path discounts are evaluated for drafts. AUTOMATIC
 *     discount evaluation is NOT run on drafts — staff authoring a draft
 *     would be surprised if a D2C "summer sale" silently reduced an
 *     invoice. AUTOMATIC discounts remain D2C checkout territory.
 *   - `CompanyLocation.taxSetting === "EXEMPT"` is honoured.
 *     `COLLECT_UNLESS_EXEMPT` is treated as `COLLECT` until a real tax
 *     engine lands (see audit §5).
 *
 * Shipping is treated as pass-through, non-taxed (see audit §4 Step 7
 * + core.ts Step 7 comment).
 */

import { prisma } from "@/app/_lib/db/prisma";
import { calculateDiscountImpact } from "@/app/_lib/discounts/apply";
import { NotFoundError } from "@/app/_lib/errors/service-errors";
import { getTaxRate } from "@/app/_lib/orders/tax";
import { computeDraftTotalsPure } from "./core";
import type {
  DraftCalculatorOptions,
  DraftTotals,
  DraftTotalsInput,
  DraftTotalsLineBreakdown,
  DraftTotalsLineInput,
} from "./types";

// ── Types shaped to the Prisma rows (trimmed to fields we read) ──

type RawDraftOrder = {
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
  // Persisted snapshot (used only on the frozen path)
  subtotalCents: bigint;
  orderDiscountCents: bigint;
  totalTaxCents: bigint;
  totalCents: bigint;
  lineItems: RawDraftLineItem[];
};

type RawDraftLineItem = {
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
  lineDiscountValue: unknown; // Decimal — read as string via .toString()
  taxable: boolean;
  taxCode: string | null;
  // Persisted snapshot (used only on the frozen path)
  taxAmountCents: bigint;
  totalCents: bigint;
};

// ── Constants ──────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

// ── Public API ─────────────────────────────────────────────────

/**
 * Compute a draft's live totals.
 *
 * @throws `NotFoundError` when no DraftOrder matches (tenantId, id).
 */
export async function computeDraftTotals(
  tenantId: string,
  draftOrderId: string,
  options: DraftCalculatorOptions = {},
): Promise<DraftTotals> {
  const draft = (await prisma.draftOrder.findFirst({
    where: { id: draftOrderId, tenantId },
    include: { lineItems: { orderBy: { position: "asc" } } },
  })) as RawDraftOrder | null;

  if (!draft) {
    throw new NotFoundError("DraftOrder not found in tenant", {
      tenantId,
      draftOrderId,
    });
  }

  // ── Frozen short-circuit (audit §6) ──
  if (draft.pricesFrozenAt && !options.ignorePricesFrozenAt) {
    return assembleFrozenSnapshot(draft);
  }

  // ── Resolve accommodation tax rates (batch) ──
  const accommodationIds = Array.from(
    new Set(
      draft.lineItems
        .filter((l) => l.lineType === "ACCOMMODATION" && l.accommodationId)
        .map((l) => l.accommodationId as string),
    ),
  );
  const accTaxRateMap = new Map<string, number>();
  if (accommodationIds.length > 0) {
    const rows = await prisma.accommodation.findMany({
      where: { id: { in: accommodationIds }, tenantId },
      select: { id: true, taxRate: true },
    });
    for (const row of rows) accTaxRateMap.set(row.id, row.taxRate);
  }

  // ── Resolve companyTaxExempt (audit §5) ──
  let companyTaxExempt = false;
  if (draft.buyerKind === "COMPANY" && draft.companyLocationId) {
    const loc = await prisma.companyLocation.findFirst({
      where: { id: draft.companyLocationId, tenantId },
      select: { taxSetting: true },
    });
    if (loc?.taxSetting === "EXEMPT") companyTaxExempt = true;
    // COLLECT_UNLESS_EXEMPT is treated as COLLECT in 6.4.
  }

  // ── Map DraftBuyerKind → ConditionContext BuyerKind (WALK_IN → GUEST) ──
  const ctxBuyerKind: "GUEST" | "COMPANY" =
    draft.buyerKind === "COMPANY" ? "COMPANY" : "GUEST";

  // ── Resolve discount code (CODE path only — see SCOPE NOTE) ──
  const orchestratorWarnings: string[] = [];
  let orderDiscountImpact = null as DraftTotalsInput["orderDiscountImpact"];

  if (draft.appliedDiscountCode) {
    const stayWindow = deriveStayWindow(draft.lineItems);
    const productIds = Array.from(
      new Set(
        draft.lineItems
          .map((l) => l.productId ?? l.accommodationId)
          .filter((x): x is string => Boolean(x)),
      ),
    );
    const itemCount = draft.lineItems.reduce(
      (sum, l) => sum + Math.max(0, l.quantity),
      0,
    );
    const orderAmount = draft.lineItems.reduce(
      (sum, l) => sum + Number(l.subtotalCents - l.lineDiscountCents),
      0,
    );
    const discountLineItems = draft.lineItems.map((l) => ({
      id: l.id,
      productId: l.productId ?? l.accommodationId ?? "",
      totalAmount: Number(l.subtotalCents - l.lineDiscountCents),
    }));

    const impact = await calculateDiscountImpact({
      tenantId,
      ctx: {
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
      },
      code: draft.appliedDiscountCode,
      lineItems: discountLineItems,
    });

    if (impact.valid) {
      orderDiscountImpact = impact;
    } else {
      orchestratorWarnings.push("DISCOUNT_INVALID");
    }
  }

  // ── Assemble core input ──
  const lines: DraftTotalsLineInput[] = draft.lineItems.map((l) => ({
    id: l.id,
    lineType: l.lineType,
    unitPriceCents: l.unitPriceCents,
    quantity: l.quantity,
    subtotalCents: l.subtotalCents,
    taxable: l.taxable,
    taxRateBp: resolveLineTaxRateBp(l, accTaxRateMap),
    lineDiscountCents: l.lineDiscountCents,
    lineDiscountType: l.lineDiscountType,
    lineDiscountValue:
      l.lineDiscountValue === null || l.lineDiscountValue === undefined
        ? null
        : String(l.lineDiscountValue),
  }));

  const input: DraftTotalsInput = {
    currency: draft.currency,
    buyerKind: ctxBuyerKind,
    taxesIncluded: draft.taxesIncluded,
    companyTaxExempt,
    shippingCents: draft.shippingCents,
    lines,
    orderDiscountImpact,
  };

  const totals = computeDraftTotalsPure(input);

  // Merge orchestrator-level warnings into the core's warning list.
  if (orchestratorWarnings.length > 0) {
    return {
      ...totals,
      warnings: [...orchestratorWarnings, ...totals.warnings],
    };
  }
  return totals;
}

// ── Helpers ────────────────────────────────────────────────────

/**
 * Assemble a DraftTotals shape directly from the persisted DraftOrder +
 * DraftLineItem rows. Bypasses the pure core — the frozen values ARE
 * the source of truth once pricesFrozenAt is set.
 */
function assembleFrozenSnapshot(draft: RawDraftOrder): DraftTotals {
  const manualSum = draft.lineItems.reduce(
    (acc, l) => acc + l.lineDiscountCents,
    BigInt(0),
  );
  const perLine: DraftTotalsLineBreakdown[] = draft.lineItems.map((l) => {
    const base = l.subtotalCents - l.lineDiscountCents;
    return {
      lineId: l.id,
      subtotalCents: l.subtotalCents,
      manualLineDiscountCents: l.lineDiscountCents,
      // Frozen rows don't persist engine-allocated per-line — best
      // approximation is 0 here since draft totals embed the effect.
      allocatedOrderDiscountCents: BigInt(0),
      totalLineDiscountCents: l.lineDiscountCents,
      taxableBaseCents: base < BigInt(0) ? BigInt(0) : base,
      taxCents: l.taxAmountCents,
      totalCents: l.totalCents,
    };
  });

  return {
    source: "FROZEN_SNAPSHOT",
    frozenAt: draft.pricesFrozenAt,
    currency: draft.currency,
    subtotalCents: draft.subtotalCents,
    totalLineDiscountCents: manualSum,
    orderDiscountCents: draft.orderDiscountCents,
    totalDiscountCents: manualSum + draft.orderDiscountCents,
    taxCents: draft.totalTaxCents,
    shippingCents: draft.shippingCents,
    totalCents: draft.totalCents,
    perLine,
    warnings: [],
  };
}

/**
 * Resolve the tax rate for a line per audit §2:
 *   - `!line.taxable` → 0 bp (per-line kill switch).
 *   - ACCOMMODATION → `Accommodation.taxRate`, fallback 0.
 *   - PRODUCT / CUSTOM → `getTaxRate(...)` stub (0 today).
 */
function resolveLineTaxRateBp(
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

/** Derive a single stay window spanning all accommodation lines. */
function deriveStayWindow(lines: RawDraftLineItem[]): {
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
