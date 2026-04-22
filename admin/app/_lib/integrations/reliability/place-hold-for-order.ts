/**
 * Place Availability Hold for a Checkout Order
 * ══════════════════════════════════════════════
 *
 * Called from the checkout route immediately after Order + Booking
 * are created, BEFORE any Stripe API call. The hold locks the unit
 * at the PMS for the checkout window; payment then confirms the
 * hold, or the expire cron releases it on abandonment.
 *
 * Flow:
 *   1. Load the freshly-created Booking and resolve its PMS category
 *   2. Resolve the adapter for the tenant
 *   3. Call adapter.holdAvailability
 *   4a. If adapter returns null (unsupported): no-op; caller proceeds
 *       without a hold. Existing post-payment createBooking logic
 *       handles the create then.
 *   4b. If adapter throws: propagate. Caller decides whether to
 *       cancel the Order or retry.
 *   4c. If adapter returns HoldResult: persist holdExternalId +
 *       holdExpiresAt on Booking. Also populate guest info if the
 *       PMS hold required it (already available in the guest data
 *       the caller passes us).
 *
 * Idempotency: if Booking already has holdExternalId set, we skip
 * the adapter call. A double-call from a retried checkout route is
 * a no-op rather than a duplicate PMS reservation.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { setSentryTenantContext } from "@/app/_lib/observability/sentry";
import { resolveAdapter } from "../resolve";
import type { HoldParams } from "../types";

// Platform-wide hold duration. 15 min balances guest completion time
// (most checkouts finish in < 3 min) against inventory lockup (what
// a hotel accepts to keep a unit held without charge).
export const DEFAULT_HOLD_DURATION_MS = 15 * 60 * 1000;

export type PlaceHoldResult =
  | { ok: true; holdExternalId: string; holdExpiresAt: Date; provider: "hold" }
  | { ok: true; holdExternalId: null; holdExpiresAt: null; provider: "not_supported" }
  | { ok: false; error: string };

export interface PlaceHoldArgs {
  orderId: string;
  tenantId: string;
  /** Override the default 15-min TTL if the tenant has a longer
   * checkout flow (e.g. group-booking forms). Clamped to [5 min, 60 min]. */
  holdDurationMs?: number;
}

export async function placeHoldForOrder(
  args: PlaceHoldArgs,
): Promise<PlaceHoldResult> {
  setSentryTenantContext(args.tenantId);

  const booking = await prisma.booking.findFirst({
    where: { orderId: args.orderId, tenantId: args.tenantId },
    select: {
      id: true,
      holdExternalId: true,
      accommodationId: true,
      ratePlanId: true,
      checkIn: true,
      checkOut: true,
      guestCount: true,
      firstName: true,
      lastName: true,
      guestEmail: true,
      phone: true,
    },
  });

  if (!booking) {
    return {
      ok: false,
      error: `No Booking linked to order ${args.orderId} — cannot place hold`,
    };
  }

  // Idempotent replay — already have a hold, caller is re-invoking.
  if (booking.holdExternalId) {
    const existing = await prisma.booking.findUnique({
      where: { id: booking.id },
      select: { holdExpiresAt: true },
    });
    return {
      ok: true,
      holdExternalId: booking.holdExternalId,
      holdExpiresAt: existing?.holdExpiresAt ?? new Date(),
      provider: "hold",
    };
  }

  if (!booking.accommodationId || !booking.ratePlanId) {
    return {
      ok: false,
      error: `Booking ${booking.id} missing accommodation or rate plan — cannot place hold`,
    };
  }
  if (!booking.checkIn || !booking.checkOut) {
    return {
      ok: false,
      error: `Booking ${booking.id} missing check-in/check-out dates`,
    };
  }

  const accommodation = await prisma.accommodation.findFirst({
    where: { id: booking.accommodationId, tenantId: args.tenantId },
    select: { externalId: true },
  });
  if (!accommodation?.externalId) {
    // Category hasn't been synced to an externalId yet — skip hold
    // (degrades to no-hold). This is a tenant-config issue, not an
    // adapter error, so we don't fail the checkout.
    log("warn", "pms.hold.no_external_category", {
      tenantId: args.tenantId,
      bookingId: booking.id,
      accommodationId: booking.accommodationId,
    });
    return {
      ok: true,
      holdExternalId: null,
      holdExpiresAt: null,
      provider: "not_supported",
    };
  }

  const adapter = await resolveAdapter(args.tenantId);

  const holdDurationMs = Math.max(
    5 * 60_000,
    Math.min(args.holdDurationMs ?? DEFAULT_HOLD_DURATION_MS, 60 * 60_000),
  );

  const isoDate = (d: Date) =>
    d.toISOString().slice(0, 10); // YYYY-MM-DD

  // Guest info for the hold — at this point we may not have the
  // guest's name/email yet (the update-guest route collects them
  // later). The adapter still needs *some* customer to attach the
  // reservation to; use placeholder values that are overwritten on
  // confirm. The PMS treats Optional reservations as provisional.
  const guestInfo: HoldParams["guestInfo"] = {
    firstName: booking.firstName || "Gäst",
    lastName: booking.lastName || "",
    email: booking.guestEmail || `pending-${booking.id}@placeholder.rutgr.com`,
    phone: booking.phone ?? null,
  };

  // Idempotency wrapper: a retried checkout for the same order
  // computes the same key, and the first call's result (externalId +
  // expiresAt) is returned instead of creating a duplicate hold.
  const { computeIdempotencyKey, withIdempotency } = await import(
    "./idempotency"
  );
  const idempotencyKey = computeIdempotencyKey({
    tenantId: args.tenantId,
    provider: adapter.provider,
    operation: "holdAvailability",
    inputs: {
      orderId: args.orderId,
      categoryId: accommodation.externalId,
      ratePlanId: booking.ratePlanId,
      checkIn: isoDate(booking.checkIn),
      checkOut: isoDate(booking.checkOut),
      guests: booking.guestCount ?? 1,
    },
  });

  const holdParams = {
    categoryId: accommodation.externalId,
    ratePlanId: booking.ratePlanId,
    checkIn: isoDate(booking.checkIn),
    checkOut: isoDate(booking.checkOut),
    guests: booking.guestCount ?? 1,
    guestInfo,
    holdDurationMs,
  };

  try {
    const holdResult = (await withIdempotency(
      idempotencyKey,
      {
        tenantId: args.tenantId,
        provider: adapter.provider,
        operation: "holdAvailability",
      },
      () => adapter.holdAvailability(args.tenantId, holdParams),
    )) as Awaited<ReturnType<typeof adapter.holdAvailability>>;

    if (holdResult === null) {
      // Adapter declines — not an error, just not supported.
      log("info", "pms.hold.not_supported", {
        tenantId: args.tenantId,
        orderId: args.orderId,
        provider: adapter.provider,
      });
      return {
        ok: true,
        holdExternalId: null,
        holdExpiresAt: null,
        provider: "not_supported",
      };
    }

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        holdExternalId: holdResult.externalId,
        holdExpiresAt: holdResult.expiresAt,
      },
    });

    log("info", "pms.hold.placed", {
      tenantId: args.tenantId,
      orderId: args.orderId,
      bookingId: booking.id,
      externalId: holdResult.externalId,
      expiresAt: holdResult.expiresAt.toISOString(),
    });

    return {
      ok: true,
      holdExternalId: holdResult.externalId,
      holdExpiresAt: holdResult.expiresAt,
      provider: "hold",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "pms.hold.failed", {
      tenantId: args.tenantId,
      orderId: args.orderId,
      bookingId: booking.id,
      error: msg,
    });
    return { ok: false, error: msg };
  }
}
