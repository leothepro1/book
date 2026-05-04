import type { Prisma } from "@prisma/client";
import type { DraftTotalsLineBreakdown } from "./calculator/types";

type Tx = Prisma.TransactionClient;

/**
 * Persist per-line × per-jurisdiction TaxLine rows for a draft as part
 * of the freezePrices transaction. The TaxLine table is the canonical
 * audit trail for tax computations; once a draft is frozen, the rows
 * here are the source of truth for any downstream tax report.
 *
 * Idempotency (Q6 LOCKED): the helper does deleteMany + createMany in
 * the SAME transaction. `assertDraftFreezable` already blocks double
 * freeze on the normal path, but defensive cleanup guarantees the
 * invariant "max one TaxLine-set per draftLineItem at any time" even
 * if a future re-issue / re-freeze flow lands.
 *
 * The helper does NOT throw on calculator-tier-3 fallback (where
 * `breakdown.taxLines` is empty); freeze must succeed even when the
 * tax engine returned a degraded response. Callers see the empty-row
 * fingerprint via `Order.taxAmount` reconciliation downstream.
 */
export async function persistTaxLinesForDraft(
  tx: Tx,
  params: {
    tenantId: string;
    perLine: DraftTotalsLineBreakdown[];
    /** Tax-1 V1: equals shopCurrency (Q4 LOCKED). Tax-4 introduces FX. */
    presentmentCurrency: string;
  },
): Promise<void> {
  const { tenantId, perLine, presentmentCurrency } = params;

  const draftLineItemIds = perLine.map((p) => p.lineId);
  if (draftLineItemIds.length === 0) return;

  // Idempotent cleanup: drop any prior TaxLines bound to these draft
  // line items. Empty taxLines arrays still trigger this so a re-freeze
  // that produced no rows leaves the table clean.
  await tx.taxLine.deleteMany({
    where: {
      tenantId,
      draftLineItemId: { in: draftLineItemIds },
    },
  });

  const rows = perLine.flatMap((breakdown) =>
    (breakdown.taxLines ?? []).map((tl) => ({
      tenantId,
      draftLineItemId: breakdown.lineId,
      orderLineItemId: null,
      title: tl.title,
      jurisdiction: tl.jurisdiction,
      // Prisma Decimal accepts string input — `.toString()` keeps
      // exact precision (no float intermediate).
      rate: tl.rate.toString(),
      taxableAmountCents: tl.taxableAmount,
      taxAmountCents: tl.taxAmount,
      presentmentTaxAmountCents: tl.presentmentTaxAmount,
      presentmentCurrency,
      source: tl.source,
      channelLiable: tl.channelLiable,
    })),
  );

  if (rows.length === 0) return;

  await tx.taxLine.createMany({ data: rows });
}
