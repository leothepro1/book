import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Reparent TaxLine rows from `draftLineItem` → `orderLineItem` when a
 * Draft is promoted to an Order. Per Tax-2 invariant: a TaxLine row
 * has exactly ONE of `orderLineItemId` / `draftLineItemId` non-null at
 * any time. After convert, the rows belong to the Order; their
 * draft-side ID is nulled out.
 *
 * Q7 LOCKED: we UPDATE in place rather than delete + recreate. This
 * preserves the original `createdAt`, `source`, and `channelLiable`
 * audit history from the calculator run that priced the draft.
 *
 * Q8 advisory: pre-Tax-2 frozen drafts have NO TaxLine rows. Calling
 * this helper for such a draft is a no-op (updateMany count=0); the
 * Order's `taxAmount` falls back to `draft.totalTaxCents` per the
 * existing convert.ts contract.
 */
export async function reparentTaxLinesDraftToOrder(
  tx: Tx,
  params: {
    tenantId: string;
    /**
     * Position-ordered pairs from createOrderLineItemsFromDraftInTx.
     * The pure-position correspondence is the canonical mapping —
     * draft and order line items share their `position` ordering.
     */
    pairs: ReadonlyArray<{
      draftLineItemId: string;
      orderLineItemId: string;
    }>;
  },
): Promise<{ reparented: number }> {
  let reparented = 0;
  for (const pair of params.pairs) {
    const { count } = await tx.taxLine.updateMany({
      where: {
        tenantId: params.tenantId,
        draftLineItemId: pair.draftLineItemId,
      },
      data: {
        orderLineItemId: pair.orderLineItemId,
        draftLineItemId: null,
      },
    });
    reparented += count;
  }
  return { reparented };
}
