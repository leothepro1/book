/**
 * DraftOrder — manual operator-driven approval flow (FAS 7.6-lite).
 *
 * Three services wrap the existing `transitionDraftStatusInTx` helper
 * for transitions that have been legal in the state-machine since
 * FAS 6.5D but had no caller until now:
 *
 *   submitForApproval: OPEN              → PENDING_APPROVAL
 *   approveDraft:      PENDING_APPROVAL  → APPROVED
 *   rejectDraft:       PENDING_APPROVAL  → REJECTED  (terminal)
 *
 * Locked decisions (recon §D, ratified by operator):
 *   Q1 — self-approval blocked at the service layer:
 *        actorUserId !== draft.createdByUserId is required for approval.
 *        UI also hides the button, but the server is authoritative.
 *   Q2 — rejectionReason REQUIRED (no anonymous rejections).
 *   Q3 — legacy drafts with createdByUserId === null are graceful:
 *        the self-approval check is skipped + a warn log is emitted.
 *   Q5 — note/reason fields capped at 500 chars (matches cancelDraft).
 *  Q10 — minimum-PII metadata: actorUserId + note/reason only. No
 *        Clerk role, no email — those can be looked up at audit time.
 *
 * Race-safety mirror of FAS 7.4 INVOICE_RESENT pattern:
 *   - Pre-tx fast-fail on status + self-approval check (advisory).
 *   - In-tx re-validation of status AND self-approval (race-safe).
 *   - Optimistic-locked updateMany inside transitionDraftStatusInTx.
 *   - Dual events per tx: STATE_CHANGED via the helper + a dedicated
 *     APPROVAL_REQUESTED/GRANTED/REJECTED for timeline distinction.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { emitPlatformEvent } from "@/app/_lib/apps/webhooks";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/app/_lib/errors/service-errors";
import { createDraftOrderEventInTx } from "./events";
import { transitionDraftStatusInTx } from "./lifecycle";
import {
  ApproveDraftInputSchema,
  RejectDraftInputSchema,
  SubmitForApprovalInputSchema,
  type ApproveDraftArgs,
  type ApproveDraftResult,
  type DraftOrder,
  type RejectDraftArgs,
  type RejectDraftResult,
  type SubmitForApprovalArgs,
  type SubmitForApprovalResult,
} from "./types";

// ── Helpers ──────────────────────────────────────────────────────

async function loadDraft(
  tenantId: string,
  draftOrderId: string,
): Promise<DraftOrder> {
  const draft = (await prisma.draftOrder.findFirst({
    where: { id: draftOrderId, tenantId },
  })) as DraftOrder | null;
  if (!draft) {
    throw new NotFoundError("DraftOrder not found in tenant", {
      tenantId,
      draftOrderId,
    });
  }
  return draft;
}

/**
 * Q1 + Q3: self-approval block, gracefully skipped on legacy null
 * createdByUserId. Throws ValidationError when blocked.
 */
function assertNotSelfApproval(
  draft: Pick<DraftOrder, "id" | "tenantId" | "createdByUserId">,
  actorUserId: string,
  context: "pre-tx" | "in-tx",
): void {
  if (draft.createdByUserId === null) {
    log("warn", "draft_order.approve.legacy_null_creator_skip_self_check", {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      actorUserId,
      stage: context,
    });
    return;
  }
  if (draft.createdByUserId === actorUserId) {
    throw new ValidationError(
      "Cannot approve your own approval request",
      {
        draftOrderId: draft.id,
        actorUserId,
        createdByUserId: draft.createdByUserId,
      },
    );
  }
}

// ── submitForApproval ─────────────────────────────────────────────

export async function submitForApproval(
  input: SubmitForApprovalArgs,
): Promise<SubmitForApprovalResult> {
  const params = SubmitForApprovalInputSchema.parse(input);

  // Pre-tx: load + status fast-fail.
  const draft = await loadDraft(params.tenantId, params.draftOrderId);
  if (draft.status !== "OPEN") {
    throw new ValidationError(
      "Draft is not in OPEN status — cannot submit for approval",
      { draftOrderId: draft.id, status: draft.status },
    );
  }

  const refreshed = await prisma.$transaction(async (tx) => {
    const fresh = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
      select: { status: true },
    })) as { status: DraftOrder["status"] } | null;
    if (!fresh) {
      throw new NotFoundError("DraftOrder vanished during mutation", {
        draftOrderId: draft.id,
      });
    }
    if (fresh.status !== "OPEN") {
      throw new ConflictError(
        "Draft status changed before submit-for-approval could commit",
        { draftOrderId: draft.id, status: fresh.status },
      );
    }

    // Prisma.InputJsonValue does not accept `null` in nested fields —
    // omit optional string fields when they have no value.
    const transitionMetadata: Prisma.InputJsonValue = {
      ...(params.requestNote !== undefined
        ? { requestNote: params.requestNote }
        : {}),
    };

    const transition = await transitionDraftStatusInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      from: "OPEN",
      to: "PENDING_APPROVAL",
      actorUserId: params.actorUserId,
      actorSource: "admin_ui",
      metadata: transitionMetadata,
    });
    if (!transition.transitioned) {
      throw new ConflictError(
        "Draft mutated during submit-for-approval — retry",
        { draftOrderId: draft.id },
      );
    }

    const eventMetadata: Prisma.InputJsonValue = {
      ...(params.requestNote !== undefined
        ? { requestNote: params.requestNote }
        : {}),
    };

    await createDraftOrderEventInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      type: "APPROVAL_REQUESTED",
      metadata: eventMetadata,
      actorUserId: params.actorUserId,
      actorSource: "admin_ui",
    });

    return (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as DraftOrder;
  });

  log("info", "draft_order.approval_requested", {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    actorUserId: params.actorUserId,
  });

  emitPlatformEvent({
    type: "draft_order.approval_requested",
    tenantId: draft.tenantId,
    payload: {
      draftOrderId: draft.id,
      tenantId: draft.tenantId,
      displayNumber: refreshed.displayNumber,
      actorUserId: params.actorUserId,
      ...(params.requestNote !== undefined
        ? { requestNote: params.requestNote }
        : {}),
    },
  }).catch((err) => {
    log("error", "draft_order.webhook_emit_failed", {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      eventType: "draft_order.approval_requested",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return { draft: refreshed };
}

// ── approveDraft ──────────────────────────────────────────────────

export async function approveDraft(
  input: ApproveDraftArgs,
): Promise<ApproveDraftResult> {
  const params = ApproveDraftInputSchema.parse(input);

  // Pre-tx: load + status fast-fail + self-approval check.
  const draft = await loadDraft(params.tenantId, params.draftOrderId);
  if (draft.status !== "PENDING_APPROVAL") {
    throw new ValidationError(
      "Draft is not in PENDING_APPROVAL status — cannot approve",
      { draftOrderId: draft.id, status: draft.status },
    );
  }
  assertNotSelfApproval(draft, params.actorUserId, "pre-tx");

  const refreshed = await prisma.$transaction(async (tx) => {
    const fresh = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
      select: { status: true, createdByUserId: true },
    })) as
      | Pick<DraftOrder, "status" | "createdByUserId">
      | null;
    if (!fresh) {
      throw new NotFoundError("DraftOrder vanished during mutation", {
        draftOrderId: draft.id,
      });
    }
    if (fresh.status !== "PENDING_APPROVAL") {
      throw new ConflictError(
        "Draft status changed before approval could commit",
        { draftOrderId: draft.id, status: fresh.status },
      );
    }
    // Race-safe: re-check self-approval inside tx in case the
    // creator field somehow changed between pre-tx and now (it can't
    // today, but the cost is one branch and a future-proofed contract).
    assertNotSelfApproval(
      {
        id: draft.id,
        tenantId: draft.tenantId,
        createdByUserId: fresh.createdByUserId,
      },
      params.actorUserId,
      "in-tx",
    );

    const transitionMetadata: Prisma.InputJsonValue = {
      ...(params.approvalNote !== undefined
        ? { approvalNote: params.approvalNote }
        : {}),
    };

    const transition = await transitionDraftStatusInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      from: "PENDING_APPROVAL",
      to: "APPROVED",
      actorUserId: params.actorUserId,
      actorSource: "admin_ui",
      metadata: transitionMetadata,
    });
    if (!transition.transitioned) {
      throw new ConflictError(
        "Draft mutated during approval — retry",
        { draftOrderId: draft.id },
      );
    }

    const eventMetadata: Prisma.InputJsonValue = {
      ...(params.approvalNote !== undefined
        ? { approvalNote: params.approvalNote }
        : {}),
    };

    await createDraftOrderEventInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      type: "APPROVAL_GRANTED",
      metadata: eventMetadata,
      actorUserId: params.actorUserId,
      actorSource: "admin_ui",
    });

    return (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as DraftOrder;
  });

  log("info", "draft_order.approval_granted", {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    actorUserId: params.actorUserId,
  });

  emitPlatformEvent({
    type: "draft_order.approved",
    tenantId: draft.tenantId,
    payload: {
      draftOrderId: draft.id,
      tenantId: draft.tenantId,
      displayNumber: refreshed.displayNumber,
      actorUserId: params.actorUserId,
      ...(params.approvalNote !== undefined
        ? { approvalNote: params.approvalNote }
        : {}),
    },
  }).catch((err) => {
    log("error", "draft_order.webhook_emit_failed", {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      eventType: "draft_order.approved",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return { draft: refreshed };
}

// ── rejectDraft ───────────────────────────────────────────────────

export async function rejectDraft(
  input: RejectDraftArgs,
): Promise<RejectDraftResult> {
  const params = RejectDraftInputSchema.parse(input);

  // Pre-tx: load + status fast-fail. Self-rejection is allowed (Q1).
  const draft = await loadDraft(params.tenantId, params.draftOrderId);
  if (draft.status !== "PENDING_APPROVAL") {
    throw new ValidationError(
      "Draft is not in PENDING_APPROVAL status — cannot reject",
      { draftOrderId: draft.id, status: draft.status },
    );
  }

  const refreshed = await prisma.$transaction(async (tx) => {
    const fresh = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
      select: { status: true },
    })) as { status: DraftOrder["status"] } | null;
    if (!fresh) {
      throw new NotFoundError("DraftOrder vanished during mutation", {
        draftOrderId: draft.id,
      });
    }
    if (fresh.status !== "PENDING_APPROVAL") {
      throw new ConflictError(
        "Draft status changed before rejection could commit",
        { draftOrderId: draft.id, status: fresh.status },
      );
    }

    const transition = await transitionDraftStatusInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      from: "PENDING_APPROVAL",
      to: "REJECTED",
      actorUserId: params.actorUserId,
      actorSource: "admin_ui",
      metadata: { rejectionReason: params.rejectionReason },
    });
    if (!transition.transitioned) {
      throw new ConflictError(
        "Draft mutated during rejection — retry",
        { draftOrderId: draft.id },
      );
    }

    await createDraftOrderEventInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      type: "APPROVAL_REJECTED",
      metadata: { rejectionReason: params.rejectionReason },
      actorUserId: params.actorUserId,
      actorSource: "admin_ui",
    });

    return (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as DraftOrder;
  });

  log("info", "draft_order.approval_rejected", {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    actorUserId: params.actorUserId,
  });

  emitPlatformEvent({
    type: "draft_order.rejected",
    tenantId: draft.tenantId,
    payload: {
      draftOrderId: draft.id,
      tenantId: draft.tenantId,
      displayNumber: refreshed.displayNumber,
      actorUserId: params.actorUserId,
      rejectionReason: params.rejectionReason,
    },
  }).catch((err) => {
    log("error", "draft_order.webhook_emit_failed", {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      eventType: "draft_order.rejected",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return { draft: refreshed };
}
