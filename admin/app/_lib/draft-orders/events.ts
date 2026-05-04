/**
 * DraftOrderEvent helper — append-only audit trail for the draft timeline.
 *
 * Mirrors `orders/events.ts` + `companies/events.ts`:
 *   - Non-tx variant swallows DB errors (audit never blocks business ops).
 *   - InTx variant lets DB errors rollback the caller's tx (different
 *     semantics on purpose — inside a tx, a failed audit write means the
 *     mutation itself should also fail, matching the `commitDiscountApplication`
 *     pattern in FAS 6.3).
 *
 * `DraftOrderEvent.type` is a freeform String at the schema layer
 * (schema.prisma:5026 comment) so vocabulary extends without migrations.
 * This module defines the compile-time union so services get type safety.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";

export type DraftEventType =
  // FAS 6.5A
  | "CREATED"
  | "LINE_ADDED"
  | "LINE_UPDATED"
  | "LINE_REMOVED"
  // FAS 6.5B
  | "DISCOUNT_APPLIED"
  | "DISCOUNT_REMOVED"
  | "PRICES_FROZEN"
  // FAS 6.5C
  | "HOLD_PLACED"
  | "HOLD_RELEASED"
  | "HOLD_FAILED"
  // FAS 6.5D
  | "STATE_CHANGED"
  | "INVOICE_SENT"
  | "INVOICE_OVERDUE"
  | "CONVERTED"
  | "CANCELLED"
  // FAS 6.5E
  | "EXPIRED_CLEANUP"
  // FAS 7.0
  | "META_UPDATED"
  // FAS 7.2b.4b.1
  | "CUSTOMER_UPDATED"
  // FAS 7.4
  | "INVOICE_RESENT"
  // FAS 7.6-lite
  | "APPROVAL_REQUESTED"
  | "APPROVAL_GRANTED"
  | "APPROVAL_REJECTED";

/** Where the event originated — freeform but these are the known sources. */
export type DraftEventActorSource =
  | "admin_ui"
  | "admin_ui_bulk"
  | "cron"
  | "webhook"
  | "api";

export interface CreateDraftOrderEventInput {
  tenantId: string;
  draftOrderId: string;
  type: DraftEventType;
  metadata?: Prisma.InputJsonValue;
  actorUserId?: string | null;
  actorSource?: DraftEventActorSource;
}

/**
 * Non-transactional event write. Errors are swallowed and logged —
 * audit trail must never block the business operation. Matches
 * `companies/events.ts:13-42`.
 */
export async function createDraftOrderEvent(
  input: CreateDraftOrderEventInput,
): Promise<void> {
  try {
    await prisma.draftOrderEvent.create({
      data: {
        tenantId: input.tenantId,
        draftOrderId: input.draftOrderId,
        type: input.type,
        metadata: input.metadata ?? {},
        actorUserId: input.actorUserId ?? null,
        actorSource: input.actorSource ?? null,
      },
    });
  } catch (err) {
    log("error", "draft_order_event.create_failed", {
      tenantId: input.tenantId,
      draftOrderId: input.draftOrderId,
      type: input.type,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Transaction-scoped event write. Errors propagate (caller's tx rolls
 * back). Matches `orders/events.ts:49-64` + `commitDiscountApplication`
 * semantics: inside a tx, a failed audit write aborts the whole mutation.
 */
export async function createDraftOrderEventInTx(
  tx: Prisma.TransactionClient,
  input: CreateDraftOrderEventInput,
): Promise<void> {
  await tx.draftOrderEvent.create({
    data: {
      tenantId: input.tenantId,
      draftOrderId: input.draftOrderId,
      type: input.type,
      metadata: input.metadata ?? {},
      actorUserId: input.actorUserId ?? null,
      actorSource: input.actorSource ?? null,
    },
  });
}
