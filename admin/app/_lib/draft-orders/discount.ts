/**
 * DraftOrder — discount services.
 *
 * Three public entry points:
 *   - applyDiscountCode        — validate code + persist on draft + recompute
 *   - removeDiscountCode       — clear discount fields + recompute
 *   - previewApplyDiscountCode — pure preview (no writes, no events)
 *
 * All three evaluate the code via `calculateDiscountImpact` (FAS 6.3)
 * using the shared `buildDiscountEngineInput` helper from the calculator
 * module — single source of truth for ctx + lineItems assembly.
 *
 * Transaction discipline (matches FAS 6.5A pattern):
 *   1. Pre-tx: fetch draft, validate mutability, call
 *      `calculateDiscountImpact` for early rejection.
 *   2. Tx: re-validate, persist discount fields, emit event, recompute
 *      totals, check for race-invalidation via calculator warnings.
 *   3. After commit: fire-and-forget platform webhook.
 *
 * Preview bypasses the tx entirely — it's a read-only projection.
 */

import type { DiscountValueType, Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { emitPlatformEvent } from "@/app/_lib/apps/webhooks";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/app/_lib/errors/service-errors";
import {
  calculateDiscountImpact,
  type CalculatedDiscountImpact,
} from "@/app/_lib/discounts/apply";
import {
  buildDiscountEngineInput,
  buildDraftTotalsInput,
  computeAndPersistDraftTotalsInTx,
  computeDraftTotalsPure,
  type RawDraftLineItem,
  type RawDraftOrder,
} from "./calculator";
import { createDraftOrderEventInTx } from "./events";
import { unlinkActiveCheckoutSession, type UnlinkResult } from "./unlink";
import { runUnlinkSideEffects } from "./unlink-side-effects";
import {
  ApplyDiscountCodeInputSchema,
  PreviewApplyDiscountCodeInputSchema,
  RemoveDiscountCodeInputSchema,
  type ApplyDiscountCodeInput,
  type ApplyDiscountCodeResult,
  type AppliedDiscountSummary,
  type DraftOrder,
  type PreviewApplyDiscountCodeInput,
  type PreviewDiscountResult,
  type RemoveDiscountCodeInput,
  type RemoveDiscountCodeResult,
} from "./types";
import { z } from "zod";

type ApplyDiscountCodeArgs = z.input<typeof ApplyDiscountCodeInputSchema>;
type RemoveDiscountCodeArgs = z.input<typeof RemoveDiscountCodeInputSchema>;
type PreviewApplyDiscountCodeArgs = z.input<
  typeof PreviewApplyDiscountCodeInputSchema
>;

// Silence unused-import warnings — types are imported for surface clarity.
void ({} as ApplyDiscountCodeInput);
void ({} as RemoveDiscountCodeInput);
void ({} as PreviewApplyDiscountCodeInput);

// ── Shared helpers ──────────────────────────────────────────────

/**
 * Fetch draft + lines. Returns the RawDraftOrder shape the calculator
 * module expects. Throws NotFoundError on miss.
 */
async function loadDraftWithLines(
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
 * Assert a draft is mutable. TODO(FAS 6.5D): extend to also accept APPROVED
 * once that state is reachable.
 */
function assertDraftMutable(draft: RawDraftOrder): void {
  if (draft.status !== "OPEN") {
    throw new ValidationError("Draft is not editable (wrong status)", {
      draftOrderId: draft.id,
      status: draft.status,
    });
  }
}

function impactToSummary(
  impact: Extract<CalculatedDiscountImpact, { valid: true }>,
): AppliedDiscountSummary {
  return {
    discountId: impact.discount.id,
    code: impact.discountCodeValue ?? "",
    title: impact.title,
    description: impact.description,
    discountAmountCents: BigInt(impact.discountAmount),
    valueType: impact.discount.valueType,
  };
}

// ── applyDiscountCode ──────────────────────────────────────────

export async function applyDiscountCode(
  input: ApplyDiscountCodeArgs,
): Promise<ApplyDiscountCodeResult> {
  const params = ApplyDiscountCodeInputSchema.parse(input);

  // Pre-tx: fetch draft + validate mutability.
  const draft = await loadDraftWithLines(params.tenantId, params.draftOrderId);
  assertDraftMutable(draft);

  // Pre-tx: validate code via calculateDiscountImpact. Fail fast on
  // invalid codes (expired / disabled / not eligible / etc.) before
  // opening the tx.
  const { ctx, discountLineItems } = buildDiscountEngineInput(
    draft,
    draft.lineItems,
  );
  const preImpact = await calculateDiscountImpact({
    tenantId: params.tenantId,
    ctx,
    code: params.code,
    lineItems: discountLineItems,
  });
  if (!preImpact.valid) {
    throw new ValidationError("Discount code not eligible", {
      code: params.code,
      error: preImpact.error,
    });
  }

  const summary = impactToSummary(preImpact);

  const result = await prisma.$transaction(async (tx) => {
    const fresh = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as RawDraftOrder | null;
    if (!fresh) {
      throw new NotFoundError("DraftOrder vanished during mutation", {
        draftOrderId: draft.id,
      });
    }
    assertDraftMutable(fresh);

    await tx.draftOrder.update({
      where: { id: draft.id },
      data: {
        appliedDiscountId: preImpact.discount.id,
        appliedDiscountCode: summary.code,
        appliedDiscountAmount: summary.discountAmountCents,
        appliedDiscountType: summary.valueType as DiscountValueType,
      },
    });

    await createDraftOrderEventInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      type: "DISCOUNT_APPLIED",
      metadata: {
        code: summary.code,
        discountId: summary.discountId,
        discountType: summary.valueType,
        discountAmountCents: summary.discountAmountCents.toString(),
        title: summary.title,
      },
      actorUserId: params.actorUserId ?? null,
      actorSource: "admin_ui",
    });

    // Recompute — the orchestrator re-runs calculateDiscountImpact
    // against the now-persisted code and feeds the core.
    const totals = await computeAndPersistDraftTotalsInTx(
      tx,
      draft.tenantId,
      draft.id,
      fresh.version,
    );

    // Race safety: if the Discount's usage count was exhausted between
    // our pre-tx validation and this tx (by a concurrent checkout),
    // the orchestrator's re-call returns invalid + adds DISCOUNT_INVALID
    // to warnings. Throw to rollback.
    if (totals.warnings.includes("DISCOUNT_INVALID")) {
      throw new ConflictError(
        "Discount became invalid between validation and commit",
        { code: summary.code, draftOrderId: draft.id },
      );
    }

    // Phase D — v1.2 §6.1.
    const unlink = await unlinkActiveCheckoutSession(
      tx,
      draft.id,
      draft.tenantId,
      "draft_mutated",
      { source: "admin_ui", userId: params.actorUserId },
    );

    const refreshed = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as DraftOrder;

    return { draft: refreshed, totals, unlink };
  });

  if (result.unlink.unlinked) {
    schedulePostCommitUnlinkSideEffects(draft.tenantId, draft.id, result.unlink);
  }

  log("info", "draft_order.discount_applied", {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    code: summary.code,
    discountAmountCents: summary.discountAmountCents.toString(),
  });

  emitPlatformEvent({
    type: "draft_order.updated",
    tenantId: draft.tenantId,
    payload: {
      draftOrderId: draft.id,
      tenantId: draft.tenantId,
      displayNumber: result.draft.displayNumber,
      changeType: "discount_applied",
      discountCode: summary.code,
      discountAmountCents: summary.discountAmountCents.toString(),
      discountType: summary.valueType,
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

  const { unlink: _unlinkApply, ...publicApply } = result;
  return { ...publicApply, discount: summary };
}

// ── removeDiscountCode ─────────────────────────────────────────

export async function removeDiscountCode(
  input: RemoveDiscountCodeArgs,
): Promise<RemoveDiscountCodeResult> {
  const params = RemoveDiscountCodeInputSchema.parse(input);

  const draft = await loadDraftWithLines(params.tenantId, params.draftOrderId);
  assertDraftMutable(draft);

  // Re-fetch to get appliedDiscount* fields (not in RawDraftOrder shape
  // but they're on the DraftOrder row).
  const appliedRow = await prisma.draftOrder.findFirst({
    where: { id: draft.id, tenantId: draft.tenantId },
    select: {
      appliedDiscountCode: true,
      appliedDiscountAmount: true,
    },
  });
  if (!appliedRow?.appliedDiscountCode) {
    throw new ValidationError("Draft has no applied discount to remove", {
      draftOrderId: draft.id,
    });
  }

  const previousCode = appliedRow.appliedDiscountCode;
  const previousAmount = appliedRow.appliedDiscountAmount ?? BigInt(0);

  const result = await prisma.$transaction(async (tx) => {
    const fresh = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as RawDraftOrder | null;
    if (!fresh) {
      throw new NotFoundError("DraftOrder vanished during mutation", {
        draftOrderId: draft.id,
      });
    }
    assertDraftMutable(fresh);

    await tx.draftOrder.update({
      where: { id: draft.id },
      data: {
        appliedDiscountId: null,
        appliedDiscountCode: null,
        appliedDiscountAmount: null,
        appliedDiscountType: null,
      },
    });

    await createDraftOrderEventInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      type: "DISCOUNT_REMOVED",
      metadata: {
        previousCode,
        previousAmountCents: previousAmount.toString(),
      },
      actorUserId: params.actorUserId ?? null,
      actorSource: "admin_ui",
    });

    const totals = await computeAndPersistDraftTotalsInTx(
      tx,
      draft.tenantId,
      draft.id,
      fresh.version,
    );

    // Phase D — v1.2 §6.1.
    const unlink = await unlinkActiveCheckoutSession(
      tx,
      draft.id,
      draft.tenantId,
      "draft_mutated",
      { source: "admin_ui", userId: params.actorUserId },
    );

    const refreshed = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as DraftOrder;

    return { draft: refreshed, totals, unlink };
  });

  if (result.unlink.unlinked) {
    schedulePostCommitUnlinkSideEffects(draft.tenantId, draft.id, result.unlink);
  }

  log("info", "draft_order.discount_removed", {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    previousCode,
  });

  emitPlatformEvent({
    type: "draft_order.updated",
    tenantId: draft.tenantId,
    payload: {
      draftOrderId: draft.id,
      tenantId: draft.tenantId,
      displayNumber: result.draft.displayNumber,
      changeType: "discount_removed",
      previousCode,
      previousAmountCents: previousAmount.toString(),
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

  const { unlink: _unlinkRemove, ...publicRemove } = result;
  return publicRemove;
}

/**
 * Fire-and-forget post-commit dispatcher for unlink side effects.
 * Mirrors the same helper in `lines.ts`.
 */
function schedulePostCommitUnlinkSideEffects(
  tenantId: string,
  draftOrderId: string,
  unlink: UnlinkResult,
): void {
  if (!unlink.unlinked || unlink.sessionId === null) return;
  void runUnlinkSideEffects({
    tenantId,
    draftOrderId,
    sessionId: unlink.sessionId,
    releasedHoldExternalIds: unlink.releasedHoldExternalIds,
    stripePaymentIntentId: unlink.stripePaymentIntentId,
  }).catch((err) => {
    log("error", "draft_invoice.side_effects_failed", {
      tenantId,
      draftOrderId,
      sessionId: unlink.sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

// ── previewApplyDiscountCode (read-only) ───────────────────────

export async function previewApplyDiscountCode(
  input: PreviewApplyDiscountCodeArgs,
): Promise<PreviewDiscountResult> {
  const params = PreviewApplyDiscountCodeInputSchema.parse(input);

  const draft = await loadDraftWithLines(params.tenantId, params.draftOrderId);
  // Preview on an immutable draft doesn't make sense — admin shouldn't
  // be offering the action anyway. Fail consistently with other gates.
  assertDraftMutable(draft);

  // Build ctx + lineItems from current state.
  const { ctx, discountLineItems } = buildDiscountEngineInput(
    draft,
    draft.lineItems,
  );

  const impact = await calculateDiscountImpact({
    tenantId: params.tenantId,
    ctx,
    code: params.code,
    lineItems: discountLineItems,
  });

  if (!impact.valid) {
    return { valid: false, error: impact.error };
  }

  // Resolve taxRateBp + companyTaxExempt for an accurate projection.
  const accommodationIds = Array.from(
    new Set(
      draft.lineItems
        .filter((l: RawDraftLineItem) => l.lineType === "ACCOMMODATION" && l.accommodationId)
        .map((l: RawDraftLineItem) => l.accommodationId as string),
    ),
  );
  const accTaxRateMap = new Map<string, number>();
  if (accommodationIds.length > 0) {
    const rows = await prisma.accommodation.findMany({
      where: { id: { in: accommodationIds }, tenantId: draft.tenantId },
      select: { id: true, taxRate: true },
    });
    for (const row of rows) accTaxRateMap.set(row.id, row.taxRate);
  }

  let companyTaxExempt = false;
  if (draft.buyerKind === "COMPANY" && draft.companyLocationId) {
    const loc = await prisma.companyLocation.findFirst({
      where: { id: draft.companyLocationId, tenantId: draft.tenantId },
      select: { taxSetting: true },
    });
    if (loc?.taxSetting === "EXEMPT") companyTaxExempt = true;
  }

  const projectedTotals = computeDraftTotalsPure(
    buildDraftTotalsInput({
      draft,
      lineItems: draft.lineItems,
      accTaxRateMap,
      companyTaxExempt,
      orderDiscountImpact: impact,
    }),
  );

  return {
    valid: true,
    impact: impactToSummary(impact),
    projectedTotals,
  };
}
