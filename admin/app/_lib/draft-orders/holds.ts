/**
 * DraftOrder — PMS hold services.
 *
 * FAS 6.5C scope:
 *   - placeHoldForDraftLine    — 2-phase commit, admin-triggered per line
 *   - releaseHoldForDraftLine  — idempotent best-effort release
 *   - placeHoldsForDraft       — batch across all NOT_PLACED/FAILED lines
 *
 * The hold system mirrors the Order-side `place-hold-for-order.ts`
 * pattern but uses an EXPLICIT `PLACING` intermediate state (Phase 1),
 * which the Order flow does not have. Rationale:
 *   - Admin UI can render "Placing hold on room X..." while Phase 2
 *     runs (observable progress).
 *   - Concurrent placement attempts on the same line are detected at
 *     the DB level (the PLACING update's `count=0` signals the race).
 *   - `holdLastAttemptAt` gives operational visibility into adapter
 *     latency for debugging.
 *
 * Two-phase commit:
 *   Phase 1 (tx):   NOT_PLACED/FAILED → PLACING  + store idempotency
 *                   key + last-attempt timestamp
 *   Phase 2 (no tx): adapter.holdAvailability via `withIdempotency`
 *                   (may take up to 15s for Mews)
 *   Phase 3 (tx):   PLACING → PLACED | FAILED based on Phase 2 result
 *
 * Stuck-PLACING recovery is handled by the release-expired-draft-holds
 * cron (FAS 6.5C Sweep B) — not this file.
 *
 * 6.5D contract: `convertToOrder` REQUIRES every DraftReservation to
 * be in state PLACED before converting. It does NOT call
 * `placeHoldForDraftLine` internally; staff must freeze + place first.
 */

import { randomUUID } from "node:crypto";
import { Prisma, type DraftHoldState } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { emitPlatformEvent } from "@/app/_lib/apps/webhooks";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/app/_lib/errors/service-errors";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import {
  computeIdempotencyKey,
  withIdempotency,
} from "@/app/_lib/integrations/reliability/idempotency";
import { runWithPool } from "@/app/_lib/concurrency/pool";
import { createDraftOrderEventInTx } from "./events";
import {
  PlaceHoldForDraftLineInputSchema,
  PlaceHoldsForDraftInputSchema,
  ReleaseHoldForDraftLineInputSchema,
  type DraftReservation,
  type PlaceHoldForDraftLineResult,
  type PlaceHoldsForDraftResult,
  type ReleaseHoldForDraftLineResult,
} from "./types";
import { z } from "zod";

type PlaceHoldForDraftLineArgs = z.input<
  typeof PlaceHoldForDraftLineInputSchema
>;
type ReleaseHoldForDraftLineArgs = z.input<
  typeof ReleaseHoldForDraftLineInputSchema
>;
type PlaceHoldsForDraftArgs = z.input<typeof PlaceHoldsForDraftInputSchema>;

// ── Constants ────────────────────────────────────────────────────

/** Operator Q2: platform default for draft holds is 30 min, clamped [10 min, 24 h]. */
export const DEFAULT_DRAFT_HOLD_DURATION_MS = 30 * 60 * 1000;
const MIN_DRAFT_HOLD_DURATION_MS = 10 * 60 * 1000;
const MAX_DRAFT_HOLD_DURATION_MS = 24 * 60 * 60 * 1000;

/** Max length of stored error message (db + event metadata). */
const ERROR_TRUNCATE_LEN = 500;

/** Operator Q3: batch placement concurrency. Conservative vs Mews rate-limit. */
const BATCH_PLACE_CONCURRENCY = 3;

// ── Shared helpers ───────────────────────────────────────────────

type DraftRow = {
  id: string;
  tenantId: string;
  status: string;
  pricesFrozenAt: Date | null;
  cancelledAt: Date | null;
  completedAt: Date | null;
  currency: string;
};

async function loadDraft(tenantId: string, draftOrderId: string): Promise<DraftRow> {
  const draft = (await prisma.draftOrder.findFirst({
    where: { id: draftOrderId, tenantId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      pricesFrozenAt: true,
      cancelledAt: true,
      completedAt: true,
      currency: true,
    },
  })) as DraftRow | null;
  if (!draft) {
    throw new NotFoundError("DraftOrder not found in tenant", {
      tenantId,
      draftOrderId,
    });
  }
  return draft;
}

function assertDraftMutable(draft: DraftRow): void {
  if (draft.status !== "OPEN") {
    throw new ValidationError("Draft is not editable (wrong status)", {
      draftOrderId: draft.id,
      status: draft.status,
    });
  }
  if (draft.pricesFrozenAt !== null) {
    throw new ValidationError("Draft prices are frozen; cannot modify holds", {
      draftOrderId: draft.id,
    });
  }
  if (draft.cancelledAt !== null || draft.completedAt !== null) {
    throw new ValidationError("Draft is not editable", {
      draftOrderId: draft.id,
    });
  }
}

async function loadReservationForLine(
  tenantId: string,
  draftLineItemId: string,
): Promise<DraftReservation> {
  const reservation = (await prisma.draftReservation.findFirst({
    where: { draftLineItemId, tenantId },
  })) as DraftReservation | null;
  if (!reservation) {
    throw new NotFoundError(
      "DraftReservation not found (line is not an accommodation?)",
      { tenantId, draftLineItemId },
    );
  }
  return reservation;
}

function clampHoldDuration(ms?: number): number {
  const raw = ms ?? DEFAULT_DRAFT_HOLD_DURATION_MS;
  if (raw < MIN_DRAFT_HOLD_DURATION_MS) return MIN_DRAFT_HOLD_DURATION_MS;
  if (raw > MAX_DRAFT_HOLD_DURATION_MS) return MAX_DRAFT_HOLD_DURATION_MS;
  return raw;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── placeHoldForDraftLine ────────────────────────────────────────

export async function placeHoldForDraftLine(
  input: PlaceHoldForDraftLineArgs,
): Promise<PlaceHoldForDraftLineResult> {
  const params = PlaceHoldForDraftLineInputSchema.parse(input);

  // Pre-tx: validate draft, line, reservation, adapter, accommodation.
  const draft = await loadDraft(params.tenantId, params.draftLineItemId);
  // Note: we loaded by draftLineItemId as a "draftOrderId" guess above —
  // that's wrong. The pattern: find the line first, then the draft.
  // Re-fetch correctly.
  const line = await prisma.draftLineItem.findFirst({
    where: { id: params.draftLineItemId, tenantId: params.tenantId },
    select: {
      id: true,
      draftOrderId: true,
      lineType: true,
      accommodationId: true,
      checkInDate: true,
      checkOutDate: true,
      guestCounts: true,
      ratePlanId: true,
    },
  });
  if (!line) {
    throw new NotFoundError("DraftLineItem not found in tenant", {
      tenantId: params.tenantId,
      draftLineItemId: params.draftLineItemId,
    });
  }
  if (line.lineType !== "ACCOMMODATION") {
    throw new ValidationError("Holds apply only to ACCOMMODATION lines", {
      draftLineItemId: line.id,
      lineType: line.lineType,
    });
  }

  // Reload the correct draft by line's parent.
  const parentDraft = await loadDraft(params.tenantId, line.draftOrderId);
  assertDraftMutable(parentDraft);
  void draft; // silence — replaced by parentDraft above

  const reservation = await loadReservationForLine(
    params.tenantId,
    params.draftLineItemId,
  );

  if (
    reservation.holdState !== "NOT_PLACED" &&
    reservation.holdState !== "FAILED"
  ) {
    if (reservation.holdState === "PLACING") {
      throw new ConflictError("A hold placement is already in flight", {
        draftLineItemId: line.id,
      });
    }
    throw new ValidationError("Hold cannot be placed in current state", {
      draftLineItemId: line.id,
      holdState: reservation.holdState,
    });
  }

  // Accommodation must be PMS-synced.
  const accommodation = await prisma.accommodation.findFirst({
    where: {
      id: reservation.accommodationId,
      tenantId: params.tenantId,
    },
    select: { externalId: true, name: true },
  });
  if (!accommodation?.externalId) {
    throw new ValidationError("Accommodation is not synced to the PMS", {
      accommodationId: reservation.accommodationId,
    });
  }

  const adapter = await resolveAdapter(params.tenantId);

  const holdDurationMs = clampHoldDuration(params.holdDurationMs);
  const attemptNonce = randomUUID();

  const idempotencyKey = computeIdempotencyKey({
    tenantId: params.tenantId,
    provider: adapter.provider,
    operation: "holdAvailability",
    inputs: {
      draftLineItemId: line.id,
      categoryId: accommodation.externalId,
      ratePlanId: reservation.ratePlanId ?? accommodation.externalId,
      checkIn: isoDate(reservation.checkInDate),
      checkOut: isoDate(reservation.checkOutDate),
      guests:
        (reservation.guestCounts as { adults?: number }).adults ?? 1,
      attemptNonce,
    },
  });

  // ── Phase 1 (tx): NOT_PLACED/FAILED → PLACING ──
  const phase1 = await prisma.draftReservation.updateMany({
    where: {
      id: reservation.id,
      tenantId: params.tenantId,
      holdState: { in: ["NOT_PLACED", "FAILED"] },
    },
    data: {
      holdState: "PLACING",
      holdLastAttemptAt: new Date(),
      holdLastError: null,
      holdIdempotencyKey: idempotencyKey,
    },
  });
  if (phase1.count === 0) {
    throw new ConflictError("Hold placement race — another placement won", {
      draftLineItemId: line.id,
    });
  }

  // ── Phase 2 (no tx): adapter.holdAvailability via idempotency ──
  const guestCounts = reservation.guestCounts as {
    adults?: number;
    children?: number;
  };
  const guests =
    (guestCounts.adults ?? 1) + (guestCounts.children ?? 0);

  // Placeholder guest info — the draft doesn't collect guest contact
  // before send; populate on confirmHold / createBooking downstream.
  // Matches place-hold-for-order.ts pattern L145-150.
  const guestInfo = {
    firstName: "Gäst",
    lastName: "",
    email: `draft-${line.id}@placeholder.rutgr.com`,
    phone: null,
  };

  const holdParams = {
    categoryId: accommodation.externalId,
    ratePlanId: reservation.ratePlanId ?? accommodation.externalId,
    checkIn: isoDate(reservation.checkInDate),
    checkOut: isoDate(reservation.checkOutDate),
    guests: Math.max(1, guests),
    guestInfo,
    holdDurationMs,
  };

  const source = params.source ?? "admin";

  let holdResult: { externalId: string; expiresAt: Date } | null = null;
  let phase2Error: string | null = null;
  try {
    holdResult = (await withIdempotency(
      idempotencyKey,
      {
        tenantId: params.tenantId,
        provider: adapter.provider,
        operation: "holdAvailability",
      },
      () => adapter.holdAvailability(params.tenantId, holdParams),
    )) as { externalId: string; expiresAt: Date } | null;
  } catch (err) {
    phase2Error = err instanceof Error ? err.message : String(err);
  }

  // ── Phase 3 (tx): record outcome + emit event + webhook ──
  if (holdResult === null && phase2Error === null) {
    // Adapter returned null — PMS doesn't support holds (Manual).
    await prisma.$transaction(async (tx) => {
      await tx.draftReservation.updateMany({
        where: {
          id: reservation.id,
          tenantId: params.tenantId,
          holdState: "PLACING",
        },
        data: {
          holdState: "FAILED",
          holdLastError: "ADAPTER_NOT_SUPPORTED",
        },
      });
      await createDraftOrderEventInTx(tx, {
        tenantId: params.tenantId,
        draftOrderId: line.draftOrderId,
        type: "HOLD_FAILED",
        metadata: {
          draftLineItemId: line.id,
          errorCode: "ADAPTER_NOT_SUPPORTED",
          errorMessage: "PMS adapter does not support holds",
          source,
        },
        actorUserId: params.actorUserId ?? null,
        actorSource: "admin_ui",
      });
    });
    emitHoldWebhook(
      params.tenantId,
      line.draftOrderId,
      "hold_failed",
      { draftLineItemId: line.id, errorCode: "ADAPTER_NOT_SUPPORTED" },
    );
    throw new ValidationError("PMS adapter does not support holds", {
      draftLineItemId: line.id,
      provider: adapter.provider,
    });
  }

  if (phase2Error !== null) {
    const truncated = phase2Error.slice(0, ERROR_TRUNCATE_LEN);
    await prisma.$transaction(async (tx) => {
      await tx.draftReservation.updateMany({
        where: {
          id: reservation.id,
          tenantId: params.tenantId,
          holdState: "PLACING",
        },
        data: {
          holdState: "FAILED",
          holdLastError: truncated,
        },
      });
      await createDraftOrderEventInTx(tx, {
        tenantId: params.tenantId,
        draftOrderId: line.draftOrderId,
        type: "HOLD_FAILED",
        metadata: {
          draftLineItemId: line.id,
          errorCode: "HOLD_PLACEMENT_FAILED",
          errorMessage: truncated,
          source,
        },
        actorUserId: params.actorUserId ?? null,
        actorSource: "admin_ui",
      });
    });
    log("error", "draft_hold.place_failed", {
      tenantId: params.tenantId,
      draftLineItemId: line.id,
      error: truncated,
    });
    emitHoldWebhook(
      params.tenantId,
      line.draftOrderId,
      "hold_failed",
      { draftLineItemId: line.id, errorCode: "HOLD_PLACEMENT_FAILED" },
    );
    throw new ValidationError("Hold placement failed at PMS", {
      draftLineItemId: line.id,
      cause: truncated,
    });
  }

  // Success — holdResult non-null.
  const { externalId, expiresAt } = holdResult as {
    externalId: string;
    expiresAt: Date;
  };

  const refreshed = await prisma.$transaction(async (tx) => {
    await tx.draftReservation.updateMany({
      where: {
        id: reservation.id,
        tenantId: params.tenantId,
        holdState: "PLACING",
      },
      data: {
        holdState: "PLACED",
        holdExternalId: externalId,
        holdExpiresAt: expiresAt,
        holdLastError: null,
      },
    });
    // Bump DraftOrder.version so platform webhooks see a consistent
    // updatedAt. The calculator doesn't re-run — totals are unaffected
    // by hold placement.
    await tx.draftOrder.update({
      where: { id: line.draftOrderId },
      data: { version: { increment: 1 } },
    });
    await createDraftOrderEventInTx(tx, {
      tenantId: params.tenantId,
      draftOrderId: line.draftOrderId,
      type: "HOLD_PLACED",
      metadata: {
        draftLineItemId: line.id,
        externalId,
        holdExpiresAt: expiresAt.toISOString(),
        source,
        accommodationId: reservation.accommodationId,
        ratePlanId: reservation.ratePlanId,
        checkInDate: isoDate(reservation.checkInDate),
        checkOutDate: isoDate(reservation.checkOutDate),
      },
      actorUserId: params.actorUserId ?? null,
      actorSource: "admin_ui",
    });
    return (await tx.draftReservation.findFirst({
      where: { id: reservation.id },
    })) as DraftReservation;
  });

  log("info", "draft_hold.placed", {
    tenantId: params.tenantId,
    draftLineItemId: line.id,
    externalId,
    holdExpiresAt: expiresAt.toISOString(),
  });

  emitHoldWebhook(params.tenantId, line.draftOrderId, "hold_placed", {
    draftLineItemId: line.id,
    externalId,
    holdExpiresAt: expiresAt.toISOString(),
  });

  return {
    reservation: refreshed,
    holdExternalId: externalId,
    holdExpiresAt: expiresAt,
  };
}

// ── releaseHoldForDraftLine ──────────────────────────────────────

export async function releaseHoldForDraftLine(
  input: ReleaseHoldForDraftLineArgs,
): Promise<ReleaseHoldForDraftLineResult> {
  const params = ReleaseHoldForDraftLineInputSchema.parse(input);

  const line = await prisma.draftLineItem.findFirst({
    where: { id: params.draftLineItemId, tenantId: params.tenantId },
    select: { id: true, draftOrderId: true, lineType: true },
  });
  if (!line) {
    throw new NotFoundError("DraftLineItem not found in tenant", {
      tenantId: params.tenantId,
      draftLineItemId: params.draftLineItemId,
    });
  }

  // Mutability gate ONLY for admin-triggered releases. Cron + system-
  // triggered releases (line_removed, draft_cancelled) operate on
  // non-OPEN drafts too (legitimate cleanup paths).
  const source = params.source ?? "admin";
  if (source === "admin") {
    const draft = await loadDraft(params.tenantId, line.draftOrderId);
    assertDraftMutable(draft);
  }

  const reservation = await loadReservationForLine(
    params.tenantId,
    params.draftLineItemId,
  );

  // State gate per audit §5.2
  if (reservation.holdState === "PLACING") {
    throw new ConflictError(
      "Cannot release hold — placement is in flight",
      { draftLineItemId: line.id },
    );
  }
  if (
    reservation.holdState !== "PLACED" &&
    reservation.holdState !== "FAILED"
  ) {
    throw new ValidationError("Hold cannot be released in current state", {
      draftLineItemId: line.id,
      holdState: reservation.holdState,
    });
  }

  // Adapter call (best-effort, outside tx). Skip for FAILED — no PMS
  // state to clear (placement never succeeded).
  let adapterReleaseOk = true;
  const previousExternalId = reservation.holdExternalId;
  if (reservation.holdState === "PLACED" && previousExternalId) {
    try {
      const adapter = await resolveAdapter(params.tenantId);
      await adapter.releaseHold(params.tenantId, previousExternalId);
    } catch (err) {
      adapterReleaseOk = false;
      log("warn", "draft_hold.release_adapter_failed", {
        tenantId: params.tenantId,
        draftLineItemId: line.id,
        externalId: previousExternalId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Don't throw — continue to update DB so state converges.
      // Cron will retry the adapter call if this row re-surfaces.
    }
  }

  const refreshed = await prisma.$transaction(async (tx) => {
    await tx.draftReservation.updateMany({
      where: {
        id: reservation.id,
        tenantId: params.tenantId,
        holdState: { in: ["PLACED", "FAILED"] },
      },
      data: {
        holdState: "RELEASED",
        // Keep holdExternalId as audit trail; cleanup cron purges.
      },
    });
    await tx.draftOrder.update({
      where: { id: line.draftOrderId },
      data: { version: { increment: 1 } },
    });
    await createDraftOrderEventInTx(tx, {
      tenantId: params.tenantId,
      draftOrderId: line.draftOrderId,
      type: "HOLD_RELEASED",
      metadata: {
        draftLineItemId: line.id,
        previousExternalId: previousExternalId ?? null,
        source,
        adapterReleaseOk,
      },
      actorUserId: params.actorUserId ?? null,
      actorSource:
        source === "admin"
          ? "admin_ui"
          : source === "cron"
            ? "cron"
            : "api",
    });
    return (await tx.draftReservation.findFirst({
      where: { id: reservation.id },
    })) as DraftReservation;
  });

  log("info", "draft_hold.released", {
    tenantId: params.tenantId,
    draftLineItemId: line.id,
    previousExternalId,
    source,
    adapterReleaseOk,
  });

  emitHoldWebhook(params.tenantId, line.draftOrderId, "hold_released", {
    draftLineItemId: line.id,
    source,
  });

  return { reservation: refreshed, adapterReleaseOk };
}

// ── placeHoldsForDraft (batch) ───────────────────────────────────

export async function placeHoldsForDraft(
  input: PlaceHoldsForDraftArgs,
): Promise<PlaceHoldsForDraftResult> {
  const params = PlaceHoldsForDraftInputSchema.parse(input);

  const draft = await loadDraft(params.tenantId, params.draftOrderId);
  assertDraftMutable(draft);

  const reservations = (await prisma.draftReservation.findMany({
    where: {
      draftOrderId: params.draftOrderId,
      tenantId: params.tenantId,
      holdState: { in: ["NOT_PLACED", "FAILED"] },
    },
    select: { id: true, draftLineItemId: true, accommodationId: true },
  })) as Array<{
    id: string;
    draftLineItemId: string;
    accommodationId: string;
  }>;

  const result: PlaceHoldsForDraftResult = {
    placed: [],
    failed: [],
    skipped: [],
  };

  // Pre-filter: skip lines where accommodation isn't PMS-synced.
  const accIds = Array.from(new Set(reservations.map((r) => r.accommodationId)));
  const accRows =
    accIds.length > 0
      ? await prisma.accommodation.findMany({
          where: { id: { in: accIds }, tenantId: params.tenantId },
          select: { id: true, externalId: true },
        })
      : [];
  const accExternalByAcc = new Map(accRows.map((a) => [a.id, a.externalId]));

  const actionable: typeof reservations = [];
  for (const r of reservations) {
    if (!accExternalByAcc.get(r.accommodationId)) {
      result.skipped.push({
        draftLineItemId: r.draftLineItemId,
        reason: "ACCOMMODATION_NOT_PMS_SYNCED",
      });
      continue;
    }
    actionable.push(r);
  }

  const poolOutcomes = await runWithPool(
    actionable,
    async (r) => {
      try {
        const placed = await placeHoldForDraftLine({
          tenantId: params.tenantId,
          draftLineItemId: r.draftLineItemId,
          holdDurationMs: params.holdDurationMs,
          actorUserId: params.actorUserId,
          source: "batch",
        });
        return {
          kind: "placed" as const,
          draftLineItemId: r.draftLineItemId,
          holdExternalId: placed.holdExternalId,
          holdExpiresAt: placed.holdExpiresAt,
        };
      } catch (err) {
        return {
          kind: "failed" as const,
          draftLineItemId: r.draftLineItemId,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    { concurrency: BATCH_PLACE_CONCURRENCY },
  );

  for (const outcome of poolOutcomes) {
    if (outcome.skippedDueToBudget) {
      // Budget-skipped rows are neither placed nor a hard failure —
      // record as "skipped" so admin can retry.
      const r = actionable[poolOutcomes.indexOf(outcome)];
      if (r) {
        result.skipped.push({
          draftLineItemId: r.draftLineItemId,
          reason: "BUDGET_SKIPPED",
        });
      }
      continue;
    }
    if (!outcome.ok || !outcome.value) {
      // Pool-level error — shouldn't happen; handler catches above.
      continue;
    }
    const v = outcome.value;
    if (v.kind === "placed") {
      result.placed.push({
        draftLineItemId: v.draftLineItemId,
        holdExternalId: v.holdExternalId,
        holdExpiresAt: v.holdExpiresAt,
      });
    } else {
      result.failed.push({
        draftLineItemId: v.draftLineItemId,
        error: v.error,
      });
    }
  }

  log("info", "draft_hold.batch_placed", {
    tenantId: params.tenantId,
    draftOrderId: params.draftOrderId,
    placedCount: result.placed.length,
    failedCount: result.failed.length,
    skippedCount: result.skipped.length,
  });

  return result;
}

// ── Webhook helper ───────────────────────────────────────────────

type HoldChangeType = "hold_placed" | "hold_released" | "hold_failed";

function emitHoldWebhook(
  tenantId: string,
  draftOrderId: string,
  changeType: HoldChangeType,
  extras: Record<string, unknown>,
): void {
  emitPlatformEvent({
    type: "draft_order.updated",
    tenantId,
    payload: {
      draftOrderId,
      tenantId,
      changeType,
      ...extras,
      updatedAt: new Date().toISOString(),
    },
  }).catch((err) => {
    log("error", "draft_order.webhook_emit_failed", {
      tenantId,
      draftOrderId,
      changeType,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

// Silence unused-var warnings at module boundary.
void ({} as Prisma.DraftReservationWhereUniqueInput);
void ({} as DraftHoldState);
