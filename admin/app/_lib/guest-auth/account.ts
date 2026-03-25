/**
 * GuestAccount — single owner of all GuestAccount read/write logic.
 *
 * No other file may call prisma.guestAccount directly.
 * Accounts are created lazily on order payment or booking sync.
 * One account per email per tenant.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
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

  log("info", "guest-account.upserted", { accountId: account.id, tenantId });

  return account;
}

/**
 * Upsert a guest account from order data, then link the order.
 *
 * Called automatically when an order is paid (Stripe webhook).
 * Creates the account if it doesn't exist, populates name/phone
 * only if the account's fields are currently empty (first write wins).
 *
 * Design decisions:
 * - Two separate queries (upsert + conditional update) instead of raw SQL
 *   because Prisma upsert doesn't support conditional field updates.
 * - No transaction wrapping — both operations are idempotent. If the
 *   order link fails, the account still exists and will be linked on
 *   retry or backfill. Avoids holding row locks under webhook load.
 * - Race safety: two concurrent upserts for the same email resolve to
 *   the same row via unique constraint. The conditional name/phone
 *   update may run twice but both writes are identical — no data loss.
 */
export async function upsertGuestAccountFromOrder(
  tenantId: string,
  orderId: string,
  email: string,
  name?: string | null,
  phone?: string | null,
): Promise<GuestAccount> {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name?.trim() || null;
  const trimmedPhone = phone?.trim() || null;

  // Step 1: Ensure account exists
  const account = await prisma.guestAccount.upsert({
    where: { tenantId_email: { tenantId, email: normalizedEmail } },
    create: {
      tenantId,
      email: normalizedEmail,
      name: trimmedName,
      phone: trimmedPhone,
    },
    update: {},
  });

  // Step 2: Fill empty profile fields (first write wins)
  const needsNameUpdate = trimmedName && !account.name;
  const needsPhoneUpdate = trimmedPhone && !account.phone;

  if (needsNameUpdate || needsPhoneUpdate) {
    await prisma.guestAccount.update({
      where: { id: account.id },
      data: {
        ...(needsNameUpdate ? { name: trimmedName } : {}),
        ...(needsPhoneUpdate ? { phone: trimmedPhone } : {}),
      },
    });
  }

  // Step 3: Link order to guest account (idempotent — safe to retry)
  await prisma.order.update({
    where: { id: orderId },
    data: { guestAccountId: account.id },
  });

  log("info", "guest-account.order-linked", {
    accountId: account.id,
    orderId,
    tenantId,
    created: !account.name && trimmedName ? true : false,
  });

  return account;
}
