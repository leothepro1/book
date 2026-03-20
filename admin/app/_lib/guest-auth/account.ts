/**
 * GuestAccount — single owner of all GuestAccount read/write logic.
 *
 * No other file may call prisma.guestAccount directly.
 * Accounts are created lazily during booking sync when a valid
 * guest email exists. One account per email per tenant.
 */

import { prisma } from "@/app/_lib/db/prisma";
import type { GuestAccount } from "@prisma/client";

/**
 * Upsert a guest account for the given tenant and email.
 *
 * - Email is normalized (trim + lowercase) before any DB operation.
 * - Idempotent: calling twice with the same tenantId+email returns the same row.
 * - Never throws on duplicate — upsert handles it atomically.
 */
export async function upsertGuestAccount(
  tenantId: string,
  email: string,
): Promise<GuestAccount> {
  const normalizedEmail = email.trim().toLowerCase();

  const account = await prisma.guestAccount.upsert({
    where: {
      tenantId_email: { tenantId, email: normalizedEmail },
    },
    create: {
      tenantId,
      email: normalizedEmail,
    },
    update: {},
  });

  console.log(`[guest-account] upserted account=${account.id} for tenant=${tenantId}`);

  return account;
}
