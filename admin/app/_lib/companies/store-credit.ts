/**
 * Store credit — read-only ledger + balance accessors for admin views (FAS 4).
 *
 * Source of truth for the balance is the cached
 * `CompanyLocation.storeCreditBalanceCents` column; the ledger is append-only
 * history. We never re-sum the ledger on reads — that's a write-side
 * responsibility when transactions are issued.
 *
 * Writes (issue credit / refund / admin adjust) arrive in FAS 5.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import {
  NotFoundError,
  ValidationError,
} from "../errors/service-errors";
import type { StoreCreditTransaction, StoreCreditReason } from "@prisma/client";

export type { StoreCreditTransaction, StoreCreditReason };

/** Reasons an admin is allowed to issue credit for. Other reasons
 *  (ORDER_PAYMENT, EXPIRATION) are system-driven and must not be reachable
 *  via the admin UI — they are rejected at the service boundary. */
const ADMIN_ISSUABLE_REASONS = new Set<StoreCreditReason>([
  "ADMIN_ISSUE",
  "REFUND",
  "ADJUSTMENT",
]);

/**
 * Cached balance from CompanyLocation.storeCreditBalanceCents. Tenant-scoped
 * lookup; returns 0n if the location is not in the tenant (caller may prefer
 * to raise — use getLocation() first if the distinction matters).
 */
export async function getStoreCreditBalance(params: {
  tenantId: string;
  locationId: string;
}): Promise<bigint> {
  const loc = await prisma.companyLocation.findFirst({
    where: { id: params.locationId, tenantId: params.tenantId },
    select: { storeCreditBalanceCents: true },
  });
  if (!loc) {
    throw new NotFoundError("Location not found in tenant", {
      locationId: params.locationId,
      tenantId: params.tenantId,
    });
  }
  return loc.storeCreditBalanceCents;
}

/**
 * Paginated ledger for a location. Newest first. Cursor is a transaction id.
 * `take` is clamped to [1, 200]; default 50 matches the other list helpers.
 */
export async function listTransactionsForLocation(params: {
  tenantId: string;
  locationId: string;
  cursor?: string;
  take?: number;
}): Promise<{
  transactions: StoreCreditTransaction[];
  nextCursor: string | null;
}> {
  const take = Math.min(Math.max(params.take ?? 50, 1), 200);

  const rows = await prisma.storeCreditTransaction.findMany({
    where: {
      tenantId: params.tenantId,
      companyLocationId: params.locationId,
    },
    take: take + 1,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const transactions = hasMore ? rows.slice(0, take) : rows;
  return {
    transactions,
    nextCursor: hasMore ? transactions[transactions.length - 1].id : null,
  };
}

// ── Writes (FAS 5) ──────────────────────────────────────────────

/**
 * Issue store credit for a CompanyLocation. Admin entry point only —
 * ORDER_PAYMENT and EXPIRATION reasons are system-driven and rejected here.
 *
 * Atomicity: insert + balance increment run in a single $transaction. If the
 * location is not in the tenant, the transaction aborts before any write.
 *
 * Amount: must be strictly positive. Negative movements ("spends") travel
 * through the order flow, not through this function.
 */
export async function issueCredit(params: {
  tenantId: string;
  locationId: string;
  amountCents: bigint;
  reason: StoreCreditReason;
  note?: string | null;
  expiresAt?: Date | null;
  createdByStaffId?: string | null;
}): Promise<StoreCreditTransaction> {
  if (!ADMIN_ISSUABLE_REASONS.has(params.reason)) {
    throw new ValidationError(
      "Denna orsak styrs av systemet och kan inte utfärdas manuellt",
      { reason: params.reason, allowed: Array.from(ADMIN_ISSUABLE_REASONS).join(",") },
    );
  }
  if (params.amountCents <= BigInt(0)) {
    throw new ValidationError("Beloppet måste vara större än 0", {
      amountCents: params.amountCents.toString(),
    });
  }

  const transaction = await prisma.$transaction(async (tx) => {
    const loc = await tx.companyLocation.findFirst({
      where: { id: params.locationId, tenantId: params.tenantId },
      select: { id: true },
    });
    if (!loc) {
      throw new NotFoundError("Location not found in tenant", {
        locationId: params.locationId,
        tenantId: params.tenantId,
      });
    }

    const row = await tx.storeCreditTransaction.create({
      data: {
        tenantId: params.tenantId,
        companyLocationId: params.locationId,
        amountCents: params.amountCents,
        reason: params.reason,
        note: params.note ?? null,
        expiresAt: params.expiresAt ?? null,
        createdByStaffId: params.createdByStaffId ?? null,
      },
    });

    await tx.companyLocation.update({
      where: { id: params.locationId },
      data: {
        storeCreditBalanceCents: { increment: params.amountCents },
      },
    });

    return row;
  });

  log("info", "store_credit.issued", {
    tenantId: params.tenantId,
    locationId: params.locationId,
    transactionId: transaction.id,
    amountCents: transaction.amountCents.toString(),
    reason: transaction.reason,
    createdByStaffId: transaction.createdByStaffId,
  });

  return transaction;
}
