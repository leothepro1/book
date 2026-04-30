/**
 * previewDraftTotals — read-only pricing projection from in-memory line input.
 *
 * Used pre-Save by /draft-orders/new to render the live totals summary
 * as the staff composes a draft. No DB writes — only reads (Accommodation
 * rows for tax rate, DiscountCode for discount validation). PMS adapter
 * is invoked per ACCOMMODATION line (parallel) to match final-Save pricing.
 *
 * Contract:
 *   - Promise.all parallel resolveLineForAdd per line
 *   - Single line failure → mark `unavailable` in that line's breakdown,
 *     exclude from totals, continue with remaining lines
 *   - Invalid discount code → graceful return with `discountApplicable: false`
 */

import { z } from "zod";
import type { DraftOrder } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { calculateDiscountImpact } from "@/app/_lib/discounts/apply";
import { computeDraftTotalsPure } from "./calculator/core";
import {
  buildDraftTotalsInput,
  type RawDraftOrder,
  type RawDraftLineItem,
} from "./calculator/context";
import { resolveLineForAdd } from "./lines";

// ── Public types ───────────────────────────────────────────────

export type PreviewLineInput = {
  accommodationId: string;
  fromDate: Date;
  toDate: Date;
  guestCount: number;
  ratePlanId?: string;
  addons?: Array<{ id: string; quantity: number }>;
};

export type PreviewInput = {
  tenantId: string;
  lines: PreviewLineInput[];
  discountCode?: string;
  currency?: string;
};

export type PreviewLineBreakdown = {
  lineIndex: number;
  accommodationId: string;
  nights: number;
  pricePerNight: bigint;
  lineSubtotal: bigint;
  addonsTotal: bigint;
  unavailable?: boolean;
  unavailableReason?: string;
};

export type PreviewResult = {
  subtotal: bigint;
  discountAmount: bigint;
  taxAmount: bigint;
  total: bigint;
  currency: string;
  lineBreakdown: PreviewLineBreakdown[];
  discountApplicable: boolean;
  discountError?: string;
};

// ── Validation ─────────────────────────────────────────────────

const InputSchema = z.object({
  tenantId: z.string().min(1),
  lines: z.array(
    z.object({
      accommodationId: z.string().min(1),
      fromDate: z.date(),
      toDate: z.date(),
      guestCount: z.number().int().min(1),
      ratePlanId: z.string().optional(),
      addons: z
        .array(z.object({ id: z.string(), quantity: z.number().int().min(1) }))
        .optional(),
    }),
  ),
  discountCode: z.string().optional(),
  currency: z.string().optional(),
});

// ── Helpers ────────────────────────────────────────────────────

function isoDay(d: Date): string {
  // Format as YYYY-MM-DD to satisfy ISODateString in line schemas.
  return d.toISOString().slice(0, 10);
}

function emptyResult(currency: string): PreviewResult {
  return {
    subtotal: BigInt(0),
    discountAmount: BigInt(0),
    taxAmount: BigInt(0),
    total: BigInt(0),
    currency,
    lineBreakdown: [],
    discountApplicable: false,
  };
}

// ── Service ────────────────────────────────────────────────────

export async function previewDraftTotals(
  input: PreviewInput,
): Promise<PreviewResult> {
  const params = InputSchema.parse(input);
  const requestedCurrency = params.currency ?? "SEK";

  // Empty input → all-zero totals.
  if (params.lines.length === 0) {
    return emptyResult(requestedCurrency);
  }

  // Batch-load accommodations for tax rate map + tenant-scope check.
  const accommodationIds = Array.from(
    new Set(params.lines.map((l) => l.accommodationId)),
  );
  const accommodations = await prisma.accommodation.findMany({
    where: { id: { in: accommodationIds }, tenantId: params.tenantId },
    select: { id: true, taxRate: true, currency: true },
  });
  const accById = new Map(accommodations.map((a) => [a.id, a]));
  const missing = accommodationIds.filter((id) => !accById.has(id));
  if (missing.length > 0) {
    // Cross-tenant reference → fail closed: empty totals + discount-not-applicable.
    return emptyResult(requestedCurrency);
  }

  // Resolve currency: explicit → first accommodation → "SEK".
  const currency =
    params.currency ?? accommodations[0]?.currency ?? "SEK";

  // Synthetic draft for resolveLineForAdd. Only fields it reads matter
  // (tenantId, currency, buyerKind, companyLocationId, etc.).
  const syntheticDraft = {
    id: "preview",
    tenantId: params.tenantId,
    currency,
    buyerKind: "GUEST",
    companyLocationId: null,
    companyContactId: null,
    guestAccountId: null,
  } as unknown as DraftOrder;

  // Promise.all parallel pricing. Per-line failure → mark unavailable.
  type LineOutcome =
    | { idx: number; ok: true; resolved: Awaited<ReturnType<typeof resolveLineForAdd>>; line: PreviewLineInput }
    | { idx: number; ok: false; reason: string; line: PreviewLineInput };

  const outcomes: LineOutcome[] = await Promise.all(
    params.lines.map(async (line, idx): Promise<LineOutcome> => {
      try {
        const accLine = {
          lineType: "ACCOMMODATION" as const,
          accommodationId: line.accommodationId,
          checkInDate: isoDay(line.fromDate),
          checkOutDate: isoDay(line.toDate),
          guestCounts: { adults: line.guestCount, children: 0, infants: 0 },
          ratePlanId: line.ratePlanId,
          taxable: true,
        };
        const resolved = await resolveLineForAdd(syntheticDraft, accLine);
        return { idx, ok: true, resolved, line };
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Pricing failed";
        return { idx, ok: false, reason, line };
      }
    }),
  );

  // Build synthetic RawDraftLineItem rows for the lines that priced ok.
  // Failed lines are excluded from totals but remembered for breakdown.
  const taxRateByAccId = new Map<string, number>(
    accommodations.map((a) => [a.id, a.taxRate]),
  );

  const okOutcomes = outcomes.filter(
    (o): o is Extract<LineOutcome, { ok: true }> => o.ok,
  );

  const syntheticLineItems: RawDraftLineItem[] = okOutcomes.map((o) => {
    if (o.resolved.kind !== "ACCOMMODATION") {
      // Preview only supports ACCOMMODATION today; defensive cast.
      throw new Error("Preview only supports ACCOMMODATION lines");
    }
    return {
      id: `preview_${o.idx}`,
      lineType: "ACCOMMODATION",
      accommodationId: o.line.accommodationId,
      productId: null,
      checkInDate: o.line.fromDate,
      checkOutDate: o.line.toDate,
      quantity: o.resolved.nights,
      unitPriceCents: o.resolved.unitPriceCents,
      subtotalCents: o.resolved.subtotalCents,
      lineDiscountCents: BigInt(0),
      lineDiscountType: null,
      lineDiscountValue: null,
      taxable: true,
      taxCode: null,
      taxAmountCents: BigInt(0),
      totalCents: BigInt(0),
    };
  });

  // Synthetic RawDraftOrder — shape adapter for the calculator pipeline.
  const syntheticRawDraft: RawDraftOrder = {
    id: "preview",
    tenantId: params.tenantId,
    status: "OPEN",
    buyerKind: "GUEST",
    companyLocationId: null,
    contactEmail: null,
    guestAccountId: null,
    currency,
    taxesIncluded: true,
    shippingCents: BigInt(0),
    appliedDiscountCode: params.discountCode ?? null,
    subtotalCents: BigInt(0),
    orderDiscountCents: BigInt(0),
    totalTaxCents: BigInt(0),
    totalCents: BigInt(0),
    lineItems: syntheticLineItems,
  };

  // Discount evaluation (graceful — invalid → discountApplicable: false).
  let discountApplicable = false;
  let discountError: string | undefined;
  let orderDiscountImpact: Parameters<typeof buildDraftTotalsInput>[0]["orderDiscountImpact"] = null;

  if (params.discountCode && syntheticLineItems.length > 0) {
    const discountLineItems = syntheticLineItems.map((l) => ({
      id: l.id,
      productId: l.productId ?? l.accommodationId ?? "",
      totalAmount: Number(l.subtotalCents - l.lineDiscountCents),
    }));
    const orderAmount = syntheticLineItems.reduce(
      (sum, l) => sum + Number(l.subtotalCents - l.lineDiscountCents),
      0,
    );
    const ctx = {
      orderAmount: Math.max(0, orderAmount),
      productIds: Array.from(
        new Set(
          syntheticLineItems
            .map((l) => l.productId ?? l.accommodationId)
            .filter((x): x is string => Boolean(x)),
        ),
      ),
      itemCount: syntheticLineItems.reduce((s, l) => s + l.quantity, 0),
      guestEmail: undefined,
      guestAccountId: undefined,
      guestSegmentIds: [] as string[],
      checkInDate: syntheticLineItems[0].checkInDate ?? undefined,
      checkOutDate: syntheticLineItems[syntheticLineItems.length - 1].checkOutDate ?? undefined,
      nights: syntheticLineItems.reduce((s, l) => s + l.quantity, 0),
      buyerKind: "GUEST" as const,
      companyLocationId: undefined,
    };

    const impact = await calculateDiscountImpact({
      tenantId: params.tenantId,
      ctx,
      code: params.discountCode,
      lineItems: discountLineItems,
    });

    if (impact.valid) {
      discountApplicable = true;
      orderDiscountImpact = impact;
    } else {
      discountError = impact.error;
    }
  }

  // Compute via pure core.
  const totals = computeDraftTotalsPure(
    buildDraftTotalsInput({
      draft: syntheticRawDraft,
      lineItems: syntheticLineItems,
      accTaxRateMap: taxRateByAccId,
      companyTaxExempt: false,
      orderDiscountImpact,
    }),
  );

  // Assemble breakdown — preserve input order, mark unavailable failures.
  const breakdownByIdx = new Map<number, PreviewLineBreakdown>();
  for (const o of outcomes) {
    if (!o.ok) {
      breakdownByIdx.set(o.idx, {
        lineIndex: o.idx,
        accommodationId: o.line.accommodationId,
        nights: 0,
        pricePerNight: BigInt(0),
        lineSubtotal: BigInt(0),
        addonsTotal: BigInt(0),
        unavailable: true,
        unavailableReason: o.reason,
      });
      continue;
    }
    if (o.resolved.kind !== "ACCOMMODATION") continue;
    const addonsTotal = BigInt(0); // Addons don't affect pricing in preview today.
    breakdownByIdx.set(o.idx, {
      lineIndex: o.idx,
      accommodationId: o.line.accommodationId,
      nights: o.resolved.nights,
      pricePerNight:
        o.resolved.nights > 0
          ? o.resolved.subtotalCents / BigInt(o.resolved.nights)
          : BigInt(0),
      lineSubtotal: o.resolved.subtotalCents,
      addonsTotal,
    });
  }
  const lineBreakdown = params.lines.map((_, idx) =>
    breakdownByIdx.get(idx) ?? {
      lineIndex: idx,
      accommodationId: params.lines[idx].accommodationId,
      nights: 0,
      pricePerNight: BigInt(0),
      lineSubtotal: BigInt(0),
      addonsTotal: BigInt(0),
      unavailable: true,
      unavailableReason: "Unknown",
    },
  );

  return {
    subtotal: totals.subtotalCents,
    discountAmount: totals.totalDiscountCents,
    taxAmount: totals.taxCents,
    total: totals.totalCents,
    currency,
    lineBreakdown,
    discountApplicable,
    discountError,
  };
}
