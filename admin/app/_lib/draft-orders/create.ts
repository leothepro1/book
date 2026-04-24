/**
 * DraftOrder — createDraft service.
 *
 * Initializes a DraftOrder in OPEN status with a fresh display number
 * and a 7-day expiry. No line items are created here — those come via
 * `addLineItem`. Empty-draft totals are all 0n (calculator is NOT
 * invoked at create time).
 *
 * Transaction boundary:
 *   - `$transaction`: sequence bump → DraftOrder insert → CREATED event.
 *   - Platform webhook emission happens AFTER commit, fire-and-forget.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { emitPlatformEvent } from "@/app/_lib/apps/webhooks";
import { nextDraftDisplayNumber } from "./sequence";
import { createDraftOrderEventInTx } from "./events";
import {
  CreateDraftInputSchema,
  type CreateDraftArgs,
  type CreateDraftResult,
  type DraftOrder,
} from "./types";

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_TTL_MS = 1 * 24 * 60 * 60 * 1000;
const MAX_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Create a new DraftOrder.
 *
 * Buyer-kind → `taxesIncluded` default (operator Q2):
 *   - `GUEST` / `WALK_IN` → true (Swedish B2C convention: gross prices)
 *   - `COMPANY`           → false (Swedish B2B convention: net prices)
 * Caller-provided `taxesIncluded` wins.
 */
export async function createDraft(
  input: CreateDraftArgs,
): Promise<CreateDraftResult> {
  const params = CreateDraftInputSchema.parse(input);

  const taxesIncluded =
    params.taxesIncluded ?? (params.buyerKind !== "COMPANY");

  const now = Date.now();
  const defaultExpiresAt = new Date(now + DEFAULT_TTL_MS);
  const expiresAt = clampExpiresAt(params.expiresAt ?? defaultExpiresAt, now);

  const draft = await prisma.$transaction(async (tx) => {
    const displayNumber = await nextDraftDisplayNumber(params.tenantId, tx);

    const created = await tx.draftOrder.create({
      data: {
        tenantId: params.tenantId,
        displayNumber,
        status: "OPEN",
        buyerKind: params.buyerKind,

        guestAccountId: params.guestAccountId ?? null,
        companyLocationId: params.companyLocationId ?? null,
        companyContactId: params.companyContactId ?? null,

        contactEmail: params.contactEmail ?? null,
        contactPhone: params.contactPhone ?? null,
        contactFirstName: params.contactFirstName ?? null,
        contactLastName: params.contactLastName ?? null,

        poNumber: params.poNumber ?? null,

        currency: params.currency,
        taxesIncluded,

        shippingCents: params.shippingCents,

        internalNote: params.internalNote ?? null,
        customerNote: params.customerNote ?? null,
        tags: params.tags,
        metafields:
          params.metafields === undefined
            ? Prisma.JsonNull
            : (params.metafields as Prisma.InputJsonValue),

        expiresAt,

        createdByUserId: params.actorUserId ?? null,
      },
    });

    await createDraftOrderEventInTx(tx, {
      tenantId: params.tenantId,
      draftOrderId: created.id,
      type: "CREATED",
      metadata: {
        displayNumber,
        buyerKind: params.buyerKind,
      },
      actorUserId: params.actorUserId ?? null,
      actorSource: "admin_ui",
    });

    return created;
  });

  log("info", "draft_order.created", {
    tenantId: params.tenantId,
    draftOrderId: draft.id,
    displayNumber: draft.displayNumber,
    buyerKind: draft.buyerKind,
  });

  // Platform webhook — fire-and-forget after commit.
  emitPlatformEvent({
    type: "draft_order.created",
    tenantId: params.tenantId,
    payload: {
      draftOrderId: draft.id,
      tenantId: params.tenantId,
      displayNumber: draft.displayNumber,
      buyerKind: draft.buyerKind,
      companyLocationId: draft.companyLocationId,
      guestAccountId: draft.guestAccountId,
      createdAt: draft.createdAt.toISOString(),
      createdByUserId: draft.createdByUserId,
    },
  }).catch((err) => {
    log("error", "draft_order.webhook_emit_failed", {
      tenantId: params.tenantId,
      draftOrderId: draft.id,
      eventType: "draft_order.created",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return { draft: draft as DraftOrder };
}

function clampExpiresAt(candidate: Date, now: number): Date {
  const ms = candidate.getTime();
  if (ms < now + MIN_TTL_MS) return new Date(now + MIN_TTL_MS);
  if (ms > now + MAX_TTL_MS) return new Date(now + MAX_TTL_MS);
  return candidate;
}
