/**
 * `unlinkActiveCheckoutSession` — Phase D, in-tx half of the v1.2 §6.2
 * unlink protocol.
 *
 * When a merchant mutates an `INVOICED` draft (or marks it paid via a
 * non-Stripe rail), any in-flight buyer-side checkout session must be
 * invalidated atomically with the mutation. This helper does the DB
 * work — flip the session to UNLINKED, release any PLACED holds, emit
 * the audit event. It does NOT call Stripe or the PMS adapter; those
 * post-commit side effects live in `runUnlinkSideEffects`.
 *
 * Contract:
 *   - Runs entirely inside a caller-owned `Prisma.TransactionClient`.
 *   - Throws `VersionConflictError` on session-version CAS failure
 *     (concurrent unlink). Caller's tx rolls back.
 *   - Returns a typed summary so the caller can hand off to
 *     `runUnlinkSideEffects` after commit.
 *
 * See `draft-orders-invoice-flow.md` v1.2 §6.2 for the canonical
 * sequence and invariants 4, 6, 8, 13.
 */

import type { Prisma } from "@prisma/client";
import { VersionConflictError } from "@/app/_lib/errors/service-errors";
import {
  createDraftOrderEventInTx,
  type DraftEventActorSource,
} from "./events";
import { DRAFT_ERRORS } from "./errors";

export type UnlinkReason =
  | "draft_mutated"
  | "marked_paid_manually"
  | "draft_cancelled"
  | "manual_admin"
  // Phase I — hold-refresh cron (v1.2 §6.5 + invariant 19)
  | "hold_refresh_failed";

export interface UnlinkResult {
  /** False when no ACTIVE session existed — caller skips post-commit work. */
  unlinked: boolean;
  sessionId: string | null;
  /** PMS hold IDs that were marked RELEASED in this tx. */
  releasedHoldExternalIds: string[];
  /** Stored on the unlinked session; null when session had no PI yet. */
  stripePaymentIntentId: string | null;
}

export interface UnlinkActor {
  userId?: string;
  source: DraftEventActorSource;
}

const DEFAULT_ACTOR: UnlinkActor = { source: "api" };

export async function unlinkActiveCheckoutSession(
  tx: Prisma.TransactionClient,
  draftOrderId: string,
  tenantId: string,
  reason: UnlinkReason,
  actor: UnlinkActor = DEFAULT_ACTOR,
): Promise<UnlinkResult> {
  // 1. Find the active session for this draft. Tenant-scoped lookup —
  //    cross-tenant access is prevented by upstream service guards but
  //    we filter defensively.
  const session = await tx.draftCheckoutSession.findFirst({
    where: { draftOrderId, tenantId, status: "ACTIVE" },
    select: {
      id: true,
      version: true,
      stripePaymentIntentId: true,
    },
  });
  if (!session) {
    return {
      unlinked: false,
      sessionId: null,
      releasedHoldExternalIds: [],
      stripePaymentIntentId: null,
    };
  }

  // 2. CAS-guarded session transition: ACTIVE → UNLINKED. Version-CAS
  //    on session.version catches concurrent unlinks (e.g. two admin
  //    mutations racing on the same INVOICED draft).
  const now = new Date();
  const updated = await tx.draftCheckoutSession.updateMany({
    where: { id: session.id, version: session.version },
    data: {
      status: "UNLINKED",
      unlinkedAt: now,
      unlinkReason: reason,
      version: { increment: 1 },
    },
  });
  if (updated.count === 0) {
    throw new VersionConflictError(DRAFT_ERRORS.VERSION_CONFLICT, {
      draftOrderId,
      tenantId,
      sessionId: session.id,
      sessionVersion: session.version,
    });
  }

  // 3. Find PLACED holds owned by the draft. We release every PLACED
  //    DraftReservation under the draft, not just the session's; per
  //    invariant 18 only ACTIVE sessions own PLACED holds, so by the
  //    time we're here (session is UNLINKED) any PLACED row is fair
  //    game for release.
  const placedReservations = await tx.draftReservation.findMany({
    where: { draftOrderId, holdState: "PLACED" },
    select: { id: true, holdExternalId: true },
  });

  // 4. Release each in a status-CAS pattern. updateMany with
  //    `holdState: "PLACED"` ensures we never double-release a row
  //    that was already moved (e.g. by a concurrent cron sweep).
  const releasedHoldExternalIds: string[] = [];
  for (const r of placedReservations) {
    const result = await tx.draftReservation.updateMany({
      where: { id: r.id, holdState: "PLACED" },
      data: {
        holdState: "RELEASED",
        holdReleaseReason: "session_unlinked",
      },
    });
    if (result.count > 0 && r.holdExternalId) {
      releasedHoldExternalIds.push(r.holdExternalId);
    }
  }

  // 5. Audit event. STATE_CHANGED is the canonical channel for
  //    cross-row state transitions; the metadata schema is permissive
  //    (see recon Summary 6), so we extend it with unlink-specific
  //    fields. `from` and `to` reference draft.status (unchanged by
  //    unlink itself — the session's status changed, not the draft's).
  const draft = await tx.draftOrder.findFirst({
    where: { id: draftOrderId, tenantId },
    select: { status: true },
  });
  await createDraftOrderEventInTx(tx, {
    tenantId,
    draftOrderId,
    type: "STATE_CHANGED",
    metadata: {
      from: draft?.status ?? null,
      to: draft?.status ?? null,
      unlinkedSessionId: session.id,
      unlinkReason: reason,
      releasedHoldExternalIds,
      stripePaymentIntentId: session.stripePaymentIntentId,
    } as Prisma.InputJsonValue,
    actorUserId: actor.userId ?? null,
    actorSource: actor.source,
  });

  return {
    unlinked: true,
    sessionId: session.id,
    releasedHoldExternalIds,
    stripePaymentIntentId: session.stripePaymentIntentId,
  };
}
