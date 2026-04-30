/**
 * GuestAccount — single owner of all GuestAccount read/write logic.
 *
 * No other file may call prisma.guestAccount directly.
 * Accounts are created on registration, order payment, or booking sync.
 * One account per email per tenant.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { createGuestAccountEventInTx } from "@/app/_lib/guests/events";
import type { GuestAccount } from "@prisma/client";

// ── Types ────────────────────────────────────────────────────

export interface GuestAccountProfile {
  firstName?: string;
  lastName?: string;
  phone?: string;
  locale?: string;
  source?: string; // "booking" | "checkout" | "checkin" | "sync" | "order"
  address1?: string;
  address2?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Emit ACCOUNT_CREATED event if the account was just created.
 * Non-blocking — never fails the main operation.
 */
function emitIfNewAccount(account: GuestAccount, source: string): void {
  if (account.createdAt.getTime() > Date.now() - 5000) {
    import("@/app/_lib/guests/events").then(({ createGuestAccountEvent }) =>
      createGuestAccountEvent({
        tenantId: account.tenantId,
        guestAccountId: account.id,
        type: "ACCOUNT_CREATED",
        message: "Gästkonto skapat automatiskt",
        metadata: { source },
      }),
    ).catch((err) => log("error", "guest.account_created_event.failed", { guestAccountId: account.id, error: String(err) }));

    // Enroll in GUEST_CREATED automations — fire and forget
    import("@/app/_lib/email/enrollInAutomations").then(({ enrollInAutomations }) =>
      enrollInAutomations({
        tenantId: account.tenantId,
        guestId: account.id,
        trigger: "GUEST_CREATED",
      }),
    ).catch((err) => log("error", "guest.automation_enroll.failed", { guestAccountId: account.id, error: String(err) }));

    // New analytics pipeline emit — guest_account_created (Phase 2)
    Promise.all([
      import("@/app/_lib/analytics/pipeline/emitter"),
      import("@/app/_lib/analytics/pipeline/integrations"),
    ])
      .then(async ([{ emitAnalyticsEventStandalone }, { deriveGuestId }]) => {
        const emailHash = deriveGuestId({
          tenantId: account.tenantId,
          guestAccountId: null,
          guestEmail: account.email,
        });
        const validatedSource: "checkout" | "order" | "magic_link" | "import" | "other" =
          source === "checkout" ||
          source === "order" ||
          source === "magic_link" ||
          source === "import"
            ? source
            : "other";
        await emitAnalyticsEventStandalone({
          tenantId: account.tenantId,
          eventName: "guest_account_created",
          schemaVersion: "0.1.0",
          occurredAt: account.createdAt,
          actor: { actor_type: "guest", actor_id: account.id },
          payload: {
            guest_id: account.id,
            email_hash: emailHash,
            source: validatedSource,
            created_at: account.createdAt,
          },
          idempotencyKey: `guest_account_created:${account.id}`,
        });
      })
      .catch((err) =>
        log("error", "analytics.pipeline.guest_account_created.failed", {
          guestAccountId: account.id,
          error: String(err),
        }),
      );
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
  // First-write-wins: fill null OR empty-string fields
  if (profile.firstName && (!account.firstName || account.firstName === "")) updates.firstName = profile.firstName.trim();
  if (profile.lastName && (!account.lastName || account.lastName === "")) updates.lastName = profile.lastName.trim();
  if (profile.phone && !account.phone) updates.phone = profile.phone.trim();
  if (profile.locale && !account.locale) updates.locale = profile.locale;

  // Address fields — first-write-wins
  if (profile.address1 && !account.address1) updates.address1 = profile.address1.trim();
  if (profile.address2 && !account.address2) updates.address2 = profile.address2.trim();
  if (profile.city && !account.city) updates.city = profile.city.trim();
  if (profile.postalCode && !account.postalCode) updates.postalCode = profile.postalCode.trim();
  if (profile.country && !account.country) updates.country = profile.country.trim();

  // Also fill legacy name field for backwards compat
  if ((profile.firstName || profile.lastName) && (!account.name || account.name === "")) {
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
      address1: profile?.address1?.trim() || null,
      address2: profile?.address2?.trim() || null,
      city: profile?.city?.trim() || null,
      postalCode: profile?.postalCode?.trim() || null,
      country: profile?.country?.trim() || null,
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
  billingAddress?: { address1?: string; address2?: string; city?: string; postalCode?: string; country?: string } | null,
): Promise<GuestAccount> {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name?.trim() || null;
  const trimmedPhone = phone?.trim() || null;

  // Split name into first/last if possible
  const nameParts = trimmedName?.split(" ") ?? [];
  const firstName = nameParts[0] ?? undefined;
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined;

  // Step 1: Ensure account exists with profile data
  const account = await upsertGuestAccount(tenantId, normalizedEmail, {
    firstName,
    lastName,
    phone: trimmedPhone ?? undefined,
    source: "order",
    address1: billingAddress?.address1 ?? undefined,
    address2: billingAddress?.address2 ?? undefined,
    city: billingAddress?.city ?? undefined,
    postalCode: billingAddress?.postalCode ?? undefined,
    country: billingAddress?.country ?? undefined,
  });

  // Step 2+3: Link order + emit ORDER_PLACED atomically (idempotent)
  const order = await prisma.$transaction(async (tx) => {
    const o = await tx.order.update({
      where: { id: orderId },
      data: { guestAccountId: account.id },
      select: { orderNumber: true, totalAmount: true },
    });

    // Dedup: only create ORDER_PLACED if one doesn't already exist for this orderId
    const existing = await tx.guestAccountEvent.findFirst({
      where: { guestAccountId: account.id, type: "ORDER_PLACED", orderId },
      select: { id: true },
    });

    if (!existing) {
      await createGuestAccountEventInTx(tx, {
        guestAccountId: account.id,
        tenantId,
        type: "ORDER_PLACED",
        message: `Bokning #${o.orderNumber} skapad`,
        metadata: { orderId, orderNumber: o.orderNumber, amount: o.totalAmount },
        orderId,
      });
    }

    return o;
  });

  log("info", "guest-account.order-linked", {
    accountId: account.id,
    orderId,
    tenantId,
  });

  // New analytics pipeline emit — guest_account_linked (Phase 2).
  // The Order's guestAccountId was just populated; analytics interest is
  // in the link itself (one event per account ↔ order pair).
  Promise.all([
    import("@/app/_lib/analytics/pipeline/emitter"),
    import("@/app/_lib/analytics/pipeline/integrations"),
  ])
    .then(async ([{ emitAnalyticsEventStandalone }, { deriveGuestId }]) => {
      const emailHash = deriveGuestId({
        tenantId,
        guestAccountId: null,
        guestEmail: normalizedEmail,
      });
      await emitAnalyticsEventStandalone({
        tenantId,
        eventName: "guest_account_linked",
        schemaVersion: "0.1.0",
        occurredAt: new Date(),
        actor: { actor_type: "guest", actor_id: account.id },
        payload: {
          guest_id: account.id,
          email_hash: emailHash,
          linked_resource_type: "order",
          linked_resource_id: orderId,
          link_method: "auto_via_email_match",
          linked_at: new Date(),
        },
        idempotencyKey: `guest_account_linked:${account.id}:${orderId}`,
      });
    })
    .catch((err) =>
      log("error", "analytics.pipeline.guest_account_linked.failed", {
        accountId: account.id,
        orderId,
        error: String(err),
      }),
    );

  return account;
}
