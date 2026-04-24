/**
 * Draft Display-Number Sequence
 * ══════════════════════════════
 *
 * Atomic, race-safe sequential display numbers per tenant — formatted as
 * `D-${year}-${NNNN}` where NNNN is zero-padded. Per operator decision,
 * the counter never resets; year is display decoration only.
 *
 * Mirrors `orders/sequence.ts:21-32` verbatim pattern: INSERT ... ON
 * CONFLICT ... RETURNING. Thread-safe at the DB level.
 *
 * First call for a tenant returns `D-${year}-1001`. Subsequent calls
 * increment by 1.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";

/**
 * Returns the next draft display number for a tenant.
 *
 * When `tx` is provided, the sequence-bump runs within the caller's
 * transaction — which is important for `createDraft` where the display
 * number must be allocated and consumed atomically with the DraftOrder
 * insert (so a rollback on insert failure also releases the sequence
 * advance).
 */
export async function nextDraftDisplayNumber(
  tenantId: string,
  tx?: Prisma.TransactionClient,
): Promise<string> {
  const db = tx ?? prisma;
  const result = await db.$queryRaw<Array<{ lastNumber: number }>>`
    INSERT INTO "DraftOrderNumberSequence" ("tenantId", "lastNumber", "updatedAt")
    VALUES (${tenantId}, 1001, NOW())
    ON CONFLICT ("tenantId")
    DO UPDATE SET "lastNumber" = "DraftOrderNumberSequence"."lastNumber" + 1,
                  "updatedAt" = NOW()
    RETURNING "lastNumber"
  `;
  const n = result[0].lastNumber;
  const year = new Date().getUTCFullYear();
  return `D-${year}-${n.toString().padStart(4, "0")}`;
}
