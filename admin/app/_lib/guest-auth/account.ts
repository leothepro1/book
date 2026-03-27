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

// ── Types ────────────────────────────────────────────────────

export interface GuestAccountProfile {
  firstName?: string;
  lastName?: string;
  phone?: string;
  locale?: string;
  source?: string; // "booking" | "checkout" | "checkin" | "sync" | "order"
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Emit ACCOUNT_CREATED event if the account was just created.
 * Non-blocking — never fails the main operation.
 */
function emitIfNewAccount(account: GuestAccount, source: string): void {
  if (account.createdAt.getTime() > Date.now() - 5000) {
    prisma.guestAccountEvent.create({
      data: {
        tenantId: account.tenantId,
        guestAccountId: account.id,
        type: "ACCOUNT_CREATED",
        message: "Gästkonto skapat automatiskt",
        metadata: { source },
      },
    }).catch(() => {});
  }
}

/**
 * Fill empty profile fields on an existing account (first write wins).
 * Only updates fields that are currently null/empty.
 */
async function fillProfileFields(
  account: GuestAccount,
  profile?: GuestAccountProfile,
): Promise<void> {
  if (!profile) return;

  const updates: Record<string, string> = {};
  if (profile.firstName && !account.firstName) updates.firstName = profile.firstName.trim();
  if (profile.lastName && !account.lastName) updates.lastName = profile.lastName.trim();
  if (profile.phone && !account.phone) updates.phone = profile.phone.trim();
  if (profile.locale && !account.locale) updates.locale = profile.locale;

  // Also fill legacy name field for backwards compat
  if ((profile.firstName || profile.lastName) && !account.name) {
    const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
    if (fullName) updates.name = fullName;
  }

  if (Object.keys(updates).length > 0) {
    await prisma.guestAccount.update({
      where: { id: account.id },
      data: updates,
    });
  }
}

// ── Public API ───────────────────────────────────────────────

/**
 * Upsert a guest account for the given tenant and email.
 *
 * - Email is normalized (trim + lowercase) before any DB operation.
 * - Idempotent: calling twice with the same tenantId+email returns the same row.
 * - Never throws on duplicate — upsert handles it atomically.
 * - Optional profile fields are applied on first-write-wins basis.
 */
export async function upsertGuestAccount(
  tenantId: string,
  email: string,
  profile?: GuestAccountProfile,
): Promise<GuestAccount> {
  const normalizedEmail = email.trim().toLowerCase();

  const account = await prisma.guestAccount.upsert({
    where: {
      tenantId_email: { tenantId, email: normalizedEmail },
    },
    create: {
      tenantId,
      email: normalizedEmail,
      firstName: profile?.firstName?.trim() || null,
      lastName: profile?.lastName?.trim() || null,
      phone: profile?.phone?.trim() || null,
      locale: profile?.locale || null,
      name: [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim() || null,
    },
    update: {},
  });

  await fillProfileFields(account, profile);
  emitIfNewAccount(account, profile?.source ?? "checkout");

  log("info", "guest-account.upserted", { accountId: account.id, tenantId });

  return account;
}

/**
 * Upsert a guest account from order data, then link the order.
 *
 * Called automatically when an order is paid (Stripe webhook).
 * Creates the account if it doesn't exist, populates name/phone
 * only if the account's fields are currently empty (first write wins).
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

  // Step 1: Ensure account exists with profile data
  const account = await upsertGuestAccount(tenantId, normalizedEmail, {
    firstName: trimmedName ?? undefined, // legacy: name goes to firstName
    phone: trimmedPhone ?? undefined,
    source: "order",
  });

  // Step 2: Link order to guest account (idempotent — safe to retry)
  const order = await prisma.order.update({
    where: { id: orderId },
    data: { guestAccountId: account.id },
    select: { orderNumber: true, totalAmount: true },
  });

  // Step 3: Emit ORDER_PLACED event (non-blocking)
  prisma.guestAccountEvent.create({
    data: {
      tenantId,
      guestAccountId: account.id,
      type: "ORDER_PLACED",
      message: `Order #${order.orderNumber} skapad`,
      metadata: { orderId, amount: order.totalAmount },
    },
  }).catch(() => {});

  log("info", "guest-account.order-linked", {
    accountId: account.id,
    orderId,
    tenantId,
  });

  return account;
}
