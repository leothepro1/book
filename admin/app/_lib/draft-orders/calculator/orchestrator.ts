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
import { computeDraftTotalsPure } from "./core";
import {
  buildDiscountEngineInput,
  buildDraftTotalsInput,
  type RawDraftOrder,
  type RawDraftLineItem,
} from "./context";
import type {
  DraftCalculatorOptions,
  DraftTotals,
  DraftTotalsInput,
  DraftTotalsLineBreakdown,
} from "./types";

type Tx = Prisma.TransactionClient;

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

  // The historical `pricesFrozenAt` short-circuit was removed in
  // Phase C — the column was dropped in Phase B and frozen totals now
  // live on `DraftCheckoutSession` (Phase E). The orchestrator always
  // recomputes from current state. `assembleFrozenSnapshot` is kept
  // unreachable for now in case Phase E reuses the row-snapshot shape.

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
    const rows = await db.accommodation.findMany({
      where: { id: { in: accommodationIds }, tenantId },
      select: { id: true, taxRate: true },
    });
    for (const row of rows) accTaxRateMap.set(row.id, row.taxRate);
  }

  // ── Resolve companyTaxExempt (audit §5) ──
  let companyTaxExempt = false;
  if (draft.buyerKind === "COMPANY" && draft.companyLocationId) {
    const loc = await db.companyLocation.findFirst({
      where: { id: draft.companyLocationId, tenantId },
      select: { taxSetting: true },
    });
    if (loc?.taxSetting === "EXEMPT") companyTaxExempt = true;
    // COLLECT_UNLESS_EXEMPT is treated as COLLECT in 6.4.
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

  // ── Assemble core input via shared builder ──
  const input = buildDraftTotalsInput({
    draft,
    lineItems: draft.lineItems,
    accTaxRateMap,
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
      totalCents: l.totalCents,
    };
  });

  return {
    source: "FROZEN_SNAPSHOT",
    frozenAt: null,
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
