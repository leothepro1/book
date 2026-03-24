/**
 * Order Number Sequence
 * ═════════════════════
 *
 * Atomic, race-safe sequential order numbers per tenant.
 * Starts at 1001 for new tenants. Never produces duplicates.
 *
 * Uses a single raw SQL statement with INSERT ... ON CONFLICT ... RETURNING
 * for true DB-level atomicity — no read-then-write race condition.
 */

import { prisma } from "@/app/_lib/db/prisma";

/**
 * Returns the next order number for a tenant.
 * Atomic at the DB level — safe under concurrent requests.
 *
 * First call for a tenant creates the sequence starting at 1001.
 * Subsequent calls increment by 1.
 */
export async function nextOrderNumber(tenantId: string): Promise<number> {
  const result = await prisma.$queryRaw<Array<{ lastNumber: number }>>`
    INSERT INTO "OrderNumberSequence" ("tenantId", "lastNumber", "updatedAt")
    VALUES (${tenantId}, 1001, NOW())
    ON CONFLICT ("tenantId")
    DO UPDATE SET "lastNumber" = "OrderNumberSequence"."lastNumber" + 1,
                  "updatedAt" = NOW()
    RETURNING "lastNumber"
  `;

  return result[0].lastNumber;
}
