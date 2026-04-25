/**
 * createDraftWithLines — atomic compound action.
 *
 * Creates a new DraftOrder with line items + optional discount in ONE
 * Prisma transaction. Pre-tx work (validation, availability recheck,
 * PMS pricing, discount validation) runs OUTSIDE the tx so locks are
 * never held during PMS calls. Post-commit work (hold placement,
 * platform webhook) is best-effort and fires async.
 *
 * Returns Result<T,E> shape — never throws to callers. Empty-lines,
 * tenant-mismatch, availability-fail, pricing-fail, invalid-discount
 * all surface as `{ ok: false, error, conflictingLineIndices? }`.
 *
 * Race-defense: pre-tx availability recheck precis innan $transaction.
 * Race window mellan recheck och draft-create är millisekund-skala —
 * post-commit `placeHoldsForDraft` (FAS 6.5C) fångar real conflicts via
 * PMS-kontraktet.
 */

import { z } from "zod";
import type {
  DraftOrder,
  DraftLineItem,
  DiscountValueType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { emitPlatformEvent } from "@/app/_lib/apps/webhooks";
import { calculateDiscountImpact } from "@/app/_lib/discounts/apply";
import { nextDraftDisplayNumber } from "./sequence";
import { createDraftOrderEventInTx } from "./events";
import { resolveLineForAdd, buildLineItemCreateData } from "./lines";
import { placeHoldsForDraft } from "./holds";
import { computeAndPersistDraftTotalsInTx } from "./calculator/orchestrator";
import { checkAvailability } from "./check-availability";
import { DRAFT_ERRORS } from "./errors";
import type { PreviewLineInput } from "./preview-totals";

// ── Public types ───────────────────────────────────────────────

export type CreateDraftWithLinesInput = {
  tenantId: string;
  lines: PreviewLineInput[];
  discountCode?: string;
  customerId?: string;
  expiresAt?: Date;
  internalNote?: string;
  tags?: string[];
  actorUserId?: string;
};

export type CreateDraftWithLinesResult =
  | { ok: true; draft: DraftOrder & { lines: DraftLineItem[] } }
  | {
      ok: false;
      error: string;
      conflictingLineIndices?: number[];
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
  customerId: z.string().optional(),
  expiresAt: z.date().optional(),
  internalNote: z.string().optional(),
  tags: z.array(z.string()).optional(),
  actorUserId: z.string().optional(),
});

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Service ────────────────────────────────────────────────────

export async function createDraftWithLines(
  input: CreateDraftWithLinesInput,
): Promise<CreateDraftWithLinesResult> {
  // 1. Validate Zod
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const params = parsed.data;

  // 2. Empty lines → error
  if (params.lines.length === 0) {
    return { ok: false, error: DRAFT_ERRORS.NO_LINES };
  }

  const expiresAt = params.expiresAt ?? new Date(Date.now() + DEFAULT_TTL_MS);

  // 3. Pre-tx availability recheck (parallel)
  const availChecks = await Promise.all(
    params.lines.map((line) =>
      checkAvailability(params.tenantId, line.accommodationId, line.fromDate, line.toDate),
    ),
  );
  const conflictingLineIndices = availChecks
    .map((r, idx) => (r.available ? -1 : idx))
    .filter((idx) => idx >= 0);
  if (conflictingLineIndices.length > 0) {
    return {
      ok: false,
      error: DRAFT_ERRORS.ACCOMMODATION_UNAVAILABLE(conflictingLineIndices),
      conflictingLineIndices,
    };
  }

  // 4. Resolve currency from first accommodation (tenant-scope already
  //    confirmed via successful checkAvailability call above).
  const firstAcc = await prisma.accommodation.findFirst({
    where: { id: params.lines[0].accommodationId, tenantId: params.tenantId },
    select: { currency: true },
  });
  const currency = firstAcc?.currency ?? "SEK";

  // 5. Synthetic draft for resolveLineForAdd PMS pricing.
  const syntheticDraft = {
    id: "pending",
    tenantId: params.tenantId,
    currency,
    buyerKind: "GUEST",
    companyLocationId: null,
    companyContactId: null,
    guestAccountId: params.customerId ?? null,
  } as unknown as DraftOrder;

  // 6. Pre-tx PMS pricing (parallel)
  const pricingOutcomes = await Promise.all(
    params.lines.map(async (line, idx) => {
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
        return { idx, ok: true as const, resolved, accLine };
      } catch (err) {
        return {
          idx,
          ok: false as const,
          error: err instanceof Error ? err.message : "Pricing failed",
        };
      }
    }),
  );
  const pricingFailures = pricingOutcomes.filter((o) => !o.ok);
  if (pricingFailures.length > 0) {
    const firstFail = pricingFailures[0];
    return {
      ok: false,
      error: DRAFT_ERRORS.PRICING_FAILED(firstFail.idx),
    };
  }

  // 7. Pre-tx discount validation (race-defense recheck inside tx covers
  //    "code became invalid between here and commit"; we throw inside
  //    the tx-body to rollback).
  let discountImpact = null;
  if (params.discountCode) {
    const discountLineItems = pricingOutcomes
      .filter((o): o is Extract<typeof o, { ok: true }> => o.ok)
      .map((o) => ({
        id: `pending_${o.idx}`,
        productId: o.accLine.accommodationId,
        totalAmount: Number(
          o.resolved.kind === "ACCOMMODATION" ? o.resolved.subtotalCents : BigInt(0),
        ),
      }));
    const totalAmount = discountLineItems.reduce((s, l) => s + l.totalAmount, 0);
    const ctx = {
      orderAmount: Math.max(0, totalAmount),
      productIds: Array.from(new Set(discountLineItems.map((l) => l.productId))),
      itemCount: pricingOutcomes.length,
      guestEmail: undefined,
      guestAccountId: params.customerId,
      guestSegmentIds: [] as string[],
      checkInDate: params.lines[0].fromDate,
      checkOutDate: params.lines[params.lines.length - 1].toDate,
      nights: pricingOutcomes
        .filter((o): o is Extract<typeof o, { ok: true }> => o.ok)
        .reduce(
          (s, o) =>
            s + (o.resolved.kind === "ACCOMMODATION" ? o.resolved.nights : 0),
          0,
        ),
      buyerKind: "GUEST" as const,
      companyLocationId: undefined,
    };
    const impact = await calculateDiscountImpact({
      tenantId: params.tenantId,
      ctx,
      code: params.discountCode,
      lineItems: discountLineItems,
    });
    if (!impact.valid) {
      return { ok: false, error: DRAFT_ERRORS.INVALID_DISCOUNT };
    }
    discountImpact = impact;
  }

  // 8. $transaction — atomic create
  let txResult: { draft: DraftOrder; lines: DraftLineItem[] };
  try {
    txResult = await prisma.$transaction(async (tx) => {
      // 8a. Display number (atomic sequence bump)
      const displayNumber = await nextDraftDisplayNumber(params.tenantId, tx);

      // 8b. Create draft record
      const draft = (await tx.draftOrder.create({
        data: {
          tenantId: params.tenantId,
          displayNumber,
          status: "OPEN",
          buyerKind: "GUEST",
          guestAccountId: params.customerId ?? null,
          currency,
          taxesIncluded: true,
          shippingCents: BigInt(0),
          internalNote: params.internalNote ?? null,
          tags: params.tags ?? [],
          expiresAt,
          createdByUserId: params.actorUserId ?? null,
        },
      })) as DraftOrder;

      // 8c. Create line items + reservations in parallel
      const okOutcomes = pricingOutcomes.filter(
        (o): o is Extract<typeof o, { ok: true }> => o.ok,
      );
      const createdLines = await Promise.all(
        okOutcomes.map(async (o, position) => {
          const createData = buildLineItemCreateData(
            draft,
            o.resolved,
            o.accLine,
            position,
          );
          const line = (await tx.draftLineItem.create({
            data: createData,
          })) as DraftLineItem;

          if (o.resolved.kind === "ACCOMMODATION") {
            await tx.draftReservation.create({
              data: {
                tenantId: params.tenantId,
                draftOrderId: draft.id,
                draftLineItemId: line.id,
                accommodationId: o.accLine.accommodationId,
                ratePlanId: o.resolved.ratePlanId,
                checkInDate: new Date(o.accLine.checkInDate),
                checkOutDate: new Date(o.accLine.checkOutDate),
                guestCounts: o.accLine.guestCounts as unknown as Prisma.InputJsonValue,
              },
            });
          }
          return line;
        }),
      );

      // 8d. Apply discount on draft if present
      if (discountImpact) {
        await tx.draftOrder.update({
          where: { id: draft.id },
          data: {
            appliedDiscountId: discountImpact.discount.id,
            appliedDiscountCode: discountImpact.discountCodeValue ?? params.discountCode,
            appliedDiscountAmount: BigInt(discountImpact.discountAmount),
            appliedDiscountType: discountImpact.discount.valueType as DiscountValueType,
          },
        });
        await createDraftOrderEventInTx(tx, {
          tenantId: params.tenantId,
          draftOrderId: draft.id,
          type: "DISCOUNT_APPLIED",
          metadata: {
            code: params.discountCode,
            discountId: discountImpact.discount.id,
            discountAmountCents: discountImpact.discountAmount.toString(),
            title: discountImpact.title,
          },
          actorUserId: params.actorUserId ?? null,
          actorSource: "admin_ui",
        });
      }

      // 8e. Compute & persist totals
      await computeAndPersistDraftTotalsInTx(tx, params.tenantId, draft.id);

      // 8f. Emit CREATED event
      await createDraftOrderEventInTx(tx, {
        tenantId: params.tenantId,
        draftOrderId: draft.id,
        type: "CREATED",
        metadata: {
          displayNumber,
          buyerKind: "GUEST",
          lineCount: createdLines.length,
        },
        actorUserId: params.actorUserId ?? null,
        actorSource: "admin_ui",
      });

      // 8g. Emit LINE_ADDED per line
      for (const line of createdLines) {
        await createDraftOrderEventInTx(tx, {
          tenantId: params.tenantId,
          draftOrderId: draft.id,
          type: "LINE_ADDED",
          metadata: {
            lineItemId: line.id,
            lineType: line.lineType,
          },
          actorUserId: params.actorUserId ?? null,
          actorSource: "admin_ui",
        });
      }

      // Re-read draft to capture updated totals + discount fields
      const refreshed = (await tx.draftOrder.findFirst({
        where: { id: draft.id, tenantId: params.tenantId },
      })) as DraftOrder;

      return { draft: refreshed, lines: createdLines };
    });
  } catch (err) {
    log("error", "draft_order.create_with_lines.tx_failed", {
      tenantId: params.tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Transaction failed",
    };
  }

  // 9. Post-commit best-effort: place holds (FAS 6.5C). Failure logged
  //    but does NOT block return — caller gets ok:true.
  placeHoldsForDraft({
    tenantId: params.tenantId,
    draftOrderId: txResult.draft.id,
    actorUserId: params.actorUserId,
  }).catch((err) => {
    log("error", "draft_order.create_with_lines.holds_failed", {
      tenantId: params.tenantId,
      draftOrderId: txResult.draft.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  // 10. Platform webhook fire-forget
  emitPlatformEvent({
    type: "draft_order.created",
    tenantId: params.tenantId,
    payload: {
      draftOrderId: txResult.draft.id,
      tenantId: params.tenantId,
      displayNumber: txResult.draft.displayNumber,
      buyerKind: "GUEST",
      companyLocationId: null,
      guestAccountId: txResult.draft.guestAccountId,
      createdAt: txResult.draft.createdAt.toISOString(),
      createdByUserId: txResult.draft.createdByUserId,
    },
  }).catch((err) => {
    log("error", "draft_order.create_with_lines.webhook_failed", {
      tenantId: params.tenantId,
      draftOrderId: txResult.draft.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  log("info", "draft_order.create_with_lines.created", {
    tenantId: params.tenantId,
    draftOrderId: txResult.draft.id,
    displayNumber: txResult.draft.displayNumber,
    lineCount: txResult.lines.length,
  });

  return { ok: true, draft: { ...txResult.draft, lines: txResult.lines } };
}
