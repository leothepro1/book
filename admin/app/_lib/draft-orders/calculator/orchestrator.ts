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

import { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { calculateDiscountImpact } from "@/app/_lib/discounts/apply";
import { NotFoundError } from "@/app/_lib/errors/service-errors";
import { calculateTax } from "@/app/_lib/tax";
import type { TaxExemptionCode } from "@/app/_lib/tax/exemptions";
import { computeDraftTotalsPure, computeTaxableBasesPure } from "./core";
import {
  buildDiscountEngineInput,
  buildDraftTotalsInput,
  type RawDraftOrder,
  type RawDraftLineItem,
  type TaxByLineEntry,
} from "./context";
import { resolveFulfillmentCountry } from "./fulfillment-country";
import { buildTaxRequestFromDraft } from "./tax-request";
import type {
  DraftCalculatorOptions,
  DraftTotals,
  DraftTotalsInput,
  DraftTotalsLineBreakdown,
} from "./types";

type Tx = Prisma.TransactionClient;

/** Map from Prisma TaxSetting enum → calculator collectMode (Q9 A). */
function mapCollectMode(
  taxSetting: "COLLECT" | "EXEMPT" | "COLLECT_UNLESS_EXEMPT",
): "COLLECT" | "DO_NOT_COLLECT" | "COLLECT_UNLESS_EXEMPT" {
  if (taxSetting === "EXEMPT") return "DO_NOT_COLLECT";
  return taxSetting;
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Compute a draft's live totals.
 *
 * When `tx` is provided, all reads use the caller's transaction client so
 * the calculator sees pre-commit state. Services performing mutations
 * (FAS 6.5+) pass their `tx` here and persist the resulting totals back to
 * the DraftOrder row inside the same transaction for atomicity.
 *
 * @throws `NotFoundError` when no DraftOrder matches (tenantId, id).
 */
export async function computeDraftTotals(
  tenantId: string,
  draftOrderId: string,
  options: DraftCalculatorOptions = {},
  tx?: Tx,
): Promise<DraftTotals> {
  const db = tx ?? prisma;

  const draft = (await db.draftOrder.findFirst({
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

  // ── Resolve B2B context (CompanyLocation tax-settings) ──
  let companyTaxExempt = false;
  let companyLocationTaxContext: {
    taxExemptions: TaxExemptionCode[];
    collectMode: "COLLECT" | "DO_NOT_COLLECT" | "COLLECT_UNLESS_EXEMPT";
    vatNumber?: string;
    taxRegistrationId?: string;
  } | undefined = undefined;
  if (draft.buyerKind === "COMPANY" && draft.companyLocationId) {
    const loc = await db.companyLocation.findFirst({
      where: { id: draft.companyLocationId, tenantId },
      select: { taxSetting: true, taxExemptions: true, taxId: true },
    });
    if (loc) {
      const collectMode = mapCollectMode(loc.taxSetting);
      // EXEMPT → companyTaxExempt + DO_NOT_COLLECT both express the
      // same intent. Honour the legacy flag as a defense-in-depth
      // belt-and-braces (Q9 advisory A: delegate to calculator AND
      // suppress at core level so the contract is bulletproof).
      if (loc.taxSetting === "EXEMPT") companyTaxExempt = true;
      companyLocationTaxContext = {
        taxExemptions: (loc.taxExemptions ?? []) as TaxExemptionCode[],
        collectMode,
        vatNumber: loc.taxId ?? undefined,
      };
    }
  }

  // ── Resolve discount code (CODE path only — see SCOPE NOTE) ──
  const orchestratorWarnings: string[] = [];
  let orderDiscountImpact = null as DraftTotalsInput["orderDiscountImpact"];

  if (draft.appliedDiscountCode) {
    const { ctx, discountLineItems } = buildDiscountEngineInput(
      draft,
      draft.lineItems,
    );
    const impact = await calculateDiscountImpact({
      tenantId,
      ctx,
      code: draft.appliedDiscountCode,
      lineItems: discountLineItems,
    });

    if (impact.valid) {
      orderDiscountImpact = impact;
    } else {
      orchestratorWarnings.push("DISCOUNT_INVALID");
    }
  }

  // ── Pre-compute discount-adjusted bases for the calculator ──
  // We need these BEFORE calling calculateTax so the calculator sees
  // the correct taxable base per line. Build a "no-tax" input shape
  // first, run Steps 1-5 via the pure helper, then layer calculator
  // results back in for the final pass.
  const baseInput = buildDraftTotalsInput({
    draft,
    lineItems: draft.lineItems,
    companyTaxExempt,
    orderDiscountImpact,
  });
  const taxableBaseByLineId = computeTaxableBasesPure(baseInput);

  // ── Pre-load Product.productType for PRODUCT lines (taxonomy lookup) ──
  const productIds = Array.from(
    new Set(
      draft.lineItems
        .filter((l) => l.lineType === "PRODUCT" && l.productId)
        .map((l) => l.productId as string),
    ),
  );
  const productTypeById = new Map<string, "STANDARD" | "GIFT_CARD">();
  if (productIds.length > 0) {
    const rows = await db.product.findMany({
      where: { id: { in: productIds }, tenantId },
      select: { id: true, productType: true },
    });
    for (const row of rows) {
      productTypeById.set(
        row.id,
        row.productType as "STANDARD" | "GIFT_CARD",
      );
    }
  }

  // ── Resolve fulfillment country (Q3 LOCKED) ──
  const fulfillmentCountryCode = await resolveFulfillmentCountry(
    tenantId,
    tx,
  );

  // ── Call calculateTax (Tax-1 entry-point) ──
  const taxRequest = buildTaxRequestFromDraft({
    draft,
    lineItems: draft.lineItems,
    taxableBaseByLineId,
    productTypeById,
    fulfillmentCountryCode,
    // V1: buyer country = fulfillment country (intra-country default).
    // Future: extract from CompanyLocation.billingAddress JSON when
    // cross-border B2B becomes a real case.
    buyerCountryCode: fulfillmentCountryCode,
    shopCurrency: draft.currency,
    presentmentCurrency: draft.currency, // Q4 LOCKED
    companyLocation: companyLocationTaxContext,
  });
  const taxResponse = await calculateTax(taxRequest);

  // ── Map TaxResponse → taxByLineId for the final pure-core pass ──
  const taxByLineId = new Map<string, TaxByLineEntry>();
  for (const respLine of taxResponse.lines) {
    const taxCents = respLine.taxLines.reduce(
      (acc, tl) => acc + tl.taxAmount,
      BigInt(0),
    );
    taxByLineId.set(respLine.lineId, {
      taxCents,
      taxLines: respLine.taxLines,
    });
  }

  // Surface calculator warnings via `tax.<warning>` prefix so callers
  // (admin UI, logs) can filter them.
  for (const w of taxResponse.warnings) {
    orchestratorWarnings.push(`tax.${w}`);
  }

  // ── Assemble final core input via shared builder ──
  const input = buildDraftTotalsInput({
    draft,
    lineItems: draft.lineItems,
    taxByLineId,
    companyTaxExempt,
    orderDiscountImpact,
  });

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

// ── Persist helper (FAS 6.5+) ──────────────────────────────────

/**
 * Compute totals within the caller's transaction AND persist them back to
 * the DraftOrder + DraftLineItem rows in the same tx. Returns the computed
 * DraftTotals so callers can include it in service results without
 * re-reading the DB.
 *
 * Called by service-layer mutations (addLineItem, updateLineItem,
 * removeLineItem, applyDiscountCode, etc.) that want totals refreshed
 * atomically with their mutation.
 *
 * Increments `DraftOrder.version` to keep optimistic-concurrency chains
 * consistent.
 */
export async function computeAndPersistDraftTotalsInTx(
  tx: Tx,
  tenantId: string,
  draftOrderId: string,
  options: DraftCalculatorOptions = {},
): Promise<DraftTotals> {
  const totals = await computeDraftTotals(tenantId, draftOrderId, options, tx);

  // Never persist on the frozen path — it's read-only by definition.
  if (totals.source === "FROZEN_SNAPSHOT") return totals;

  await tx.draftOrder.update({
    where: { id: draftOrderId },
    data: {
      subtotalCents: totals.subtotalCents,
      orderDiscountCents: totals.orderDiscountCents,
      totalTaxCents: totals.taxCents,
      totalCents: totals.totalCents,
      version: { increment: 1 },
    },
  });

  for (const breakdown of totals.perLine) {
    await tx.draftLineItem.update({
      where: { id: breakdown.lineId },
      data: {
        taxAmountCents: breakdown.taxCents,
        totalCents: breakdown.totalCents,
      },
    });
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
      // Frozen snapshots predating Tax-2 have no per-jurisdiction
      // breakdown stored on the row. The TaxLine table (B.4) carries
      // the canonical per-jurisdiction history for post-Tax-2 freezes;
      // surfacing it here would require an extra query — defer to a
      // later phase if a UI needs it.
      taxLines: [],
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

// Pure helpers (resolveLineTaxRateBp, deriveStayWindow,
// buildDiscountEngineInput, buildDraftTotalsInput) live in `./context`
// as of FAS 6.5B so the discount services can share them.
