/**
 * DraftOrder — lifecycle services.
 *
 * FAS 6.5B scope: `freezePrices` only. FAS 6.5D will add
 * `transitionStatus`, `sendInvoice`, `cancelDraft`, `convertToOrder`.
 *
 * `freezePrices` semantics:
 *   - Snapshot current totals into DraftOrder row (subtotalCents /
 *     orderDiscountCents / totalTaxCents / totalCents).
 *   - Snapshot per-line totals into each DraftLineItem row
 *     (taxAmountCents / totalCents).
 *   - Set `DraftOrder.pricesFrozenAt = now`.
 *   - All of the above happen in a single write per row so `version`
 *     increments exactly once.
 *
 * INVARIANT: `convertToOrder` (FAS 6.5D) will REQUIRE `pricesFrozenAt`
 * to be set. It will NOT call `freezePrices` internally — staff must
 * freeze explicitly before converting. See audit §7 for rationale
 * (separation of concerns, UX flow, failure-mode safety).
 *
 * Idempotency: calling `freezePrices` on an already-frozen draft throws
 * `ValidationError("ALREADY_FROZEN")` per operator decision — explicit
 * about state changes, not silent no-op.
 *
 * Empty draft: allowed. All totals freeze to `0n`.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { emitPlatformEvent } from "@/app/_lib/apps/webhooks";
import {
  NotFoundError,
  ValidationError,
} from "@/app/_lib/errors/service-errors";
import {
  computeDraftTotals,
  type RawDraftOrder,
} from "./calculator";
import { createDraftOrderEventInTx } from "./events";
import {
  FreezePricesInputSchema,
  type DraftOrder,
  type FreezePricesInput,
  type FreezePricesResult,
} from "./types";
import { z } from "zod";

type FreezePricesArgs = z.input<typeof FreezePricesInputSchema>;
void ({} as FreezePricesInput);

// ── Helpers ──────────────────────────────────────────────────────

async function loadDraftForFreeze(
  tenantId: string,
  draftOrderId: string,
): Promise<RawDraftOrder> {
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
  return draft;
}

/**
 * Assert the draft is in a freezable state.
 *
 * TODO(FAS 6.5D): extend allowed statuses to include `APPROVED` once
 * that state is reachable via submitForApproval/approve services.
 */
function assertDraftFreezable(draft: RawDraftOrder): void {
  if (draft.status !== "OPEN") {
    throw new ValidationError("Draft is not in a freezable status", {
      draftOrderId: draft.id,
      status: draft.status,
    });
  }
  if (draft.pricesFrozenAt !== null) {
    throw new ValidationError("Draft prices are already frozen", {
      draftOrderId: draft.id,
      pricesFrozenAt: draft.pricesFrozenAt?.toISOString(),
    });
  }
}

// ── freezePrices ─────────────────────────────────────────────────

export async function freezePrices(
  input: FreezePricesArgs,
): Promise<FreezePricesResult> {
  const params = FreezePricesInputSchema.parse(input);

  // Pre-tx: fetch + fast-fail.
  const draft = await loadDraftForFreeze(
    params.tenantId,
    params.draftOrderId,
  );
  assertDraftFreezable(draft);

  const frozenAt = new Date();

  const result = await prisma.$transaction(async (tx) => {
    // Re-validate inside tx (defensive against concurrent freeze attempts).
    const fresh = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as RawDraftOrder | null;
    if (!fresh) {
      throw new NotFoundError("DraftOrder vanished during mutation", {
        draftOrderId: draft.id,
      });
    }
    assertDraftFreezable(fresh);

    // Compute totals via the injected tx (read-only — NOT the persist
    // variant, because we want to combine totals + pricesFrozenAt +
    // version+1 into a single update).
    const totals = await computeDraftTotals(
      draft.tenantId,
      draft.id,
      {},
      tx,
    );

    // Single DraftOrder write — all totals + pricesFrozenAt + version+1.
    await tx.draftOrder.update({
      where: { id: draft.id },
      data: {
        subtotalCents: totals.subtotalCents,
        orderDiscountCents: totals.orderDiscountCents,
        totalTaxCents: totals.taxCents,
        totalCents: totals.totalCents,
        pricesFrozenAt: frozenAt,
        version: { increment: 1 },
      },
    });

    // Per-line snapshot writes (taxAmountCents + totalCents).
    for (const breakdown of totals.perLine) {
      await tx.draftLineItem.update({
        where: { id: breakdown.lineId },
        data: {
          taxAmountCents: breakdown.taxCents,
          totalCents: breakdown.totalCents,
        },
      });
    }

    await createDraftOrderEventInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      type: "PRICES_FROZEN",
      metadata: {
        frozenAt: frozenAt.toISOString(),
        snapshot: {
          subtotalCents: totals.subtotalCents.toString(),
          orderDiscountCents: totals.orderDiscountCents.toString(),
          totalTaxCents: totals.taxCents.toString(),
          totalCents: totals.totalCents.toString(),
        },
      },
      actorUserId: params.actorUserId ?? null,
      actorSource: "admin_ui",
    });

    const refreshed = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as DraftOrder;

    return { draft: refreshed, totals };
  });

  log("info", "draft_order.prices_frozen", {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    totalCents: result.totals.totalCents.toString(),
    frozenAt: frozenAt.toISOString(),
  });

  emitPlatformEvent({
    type: "draft_order.updated",
    tenantId: draft.tenantId,
    payload: {
      draftOrderId: draft.id,
      tenantId: draft.tenantId,
      displayNumber: result.draft.displayNumber,
      changeType: "prices_frozen",
      frozenAt: frozenAt.toISOString(),
      totalCents: result.totals.totalCents.toString(),
      updatedAt: result.draft.updatedAt.toISOString(),
    },
  }).catch((err) => {
    log("error", "draft_order.webhook_emit_failed", {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      eventType: "draft_order.updated",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  // Shape the returned totals as FROZEN_SNAPSHOT so callers see the
  // post-freeze state consistently with future reads.
  return {
    draft: result.draft,
    totals: {
      ...result.totals,
      source: "FROZEN_SNAPSHOT",
      frozenAt,
    },
    frozenAt,
  };
}
