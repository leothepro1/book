/**
 * PMS Booking Creation — Post-Payment
 * ════════════════════════════════════
 *
 * Called after payment confirmation (Stripe webhook → PAID).
 * Creates the PMS booking and links it to the Bedfront Order and Booking.
 *
 * Idempotent: safe to call multiple times — checks pmsBookingRef before calling PMS.
 *
 * Never call this from an HTTP route handler directly.
 * Only call from the payment confirmation webhook handler.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { createOrderEventInTx } from "@/app/_lib/orders/events";
import { log } from "@/app/_lib/logger";

// ── Types ──────────────────────────────────────────────────────

export type CreatePmsBookingParams = {
  orderId: string;
  tenantId: string;
};

export type CreatePmsBookingResult =
  | { ok: true; pmsBookingRef: string; bookingId: string }
  | { ok: false; error: string; retryable: boolean };

// ── Main function ──────────────────────────────────────────────

export async function createPmsBookingAfterPayment(
  params: CreatePmsBookingParams,
): Promise<CreatePmsBookingResult> {
  const { orderId, tenantId } = params;

  // 1. Load Order with linked Booking
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId, orderType: "ACCOMMODATION" },
    select: {
      id: true,
      tenantId: true,
      guestEmail: true,
      guestName: true,
      guestPhone: true,
      bookings: {
        select: {
          id: true,
          accommodationId: true,
          pmsBookingRef: true,
          checkIn: true,
          checkOut: true,
          guestCount: true,
          ratePlanId: true,
          specialRequests: true,
          externalId: true,
        },
        take: 1,
      },
    },
  });

  if (!order) {
    return { ok: false, error: `Order ${orderId} not found`, retryable: false };
  }

  const booking = order.bookings[0];
  if (!booking) {
    log("warn", "create_pms_booking.no_booking_linked", { orderId, tenantId });
    return {
      ok: false,
      error: "No Booking linked to Order — may need to create Booking first",
      retryable: true,
    };
  }

  // 2. Idempotency check — if pmsBookingRef already set, we already called PMS
  if (booking.pmsBookingRef) {
    log("info", "create_pms_booking.already_confirmed", {
      orderId,
      bookingId: booking.id,
      pmsBookingRef: booking.pmsBookingRef,
    });
    return { ok: true, pmsBookingRef: booking.pmsBookingRef, bookingId: booking.id };
  }

  // 3. Load Accommodation for externalId
  if (!booking.accommodationId) {
    return {
      ok: false,
      error: "Booking has no accommodationId — cannot determine PMS category",
      retryable: false,
    };
  }

  const accommodation = await prisma.accommodation.findFirst({
    where: { id: booking.accommodationId, tenantId },
    select: { externalId: true },
  });

  if (!accommodation?.externalId) {
    return {
      ok: false,
      error: `Accommodation ${booking.accommodationId} has no externalId`,
      retryable: false,
    };
  }

  // 4. Call PMS adapter
  const adapter = await resolveAdapter(tenantId);

  const [firstName, ...lastParts] = (order.guestName || "Guest").split(" ");
  const lastName = lastParts.join(" ") || "-";

  let confirmation;
  try {
    confirmation = await adapter.createBooking(tenantId, {
      categoryId: accommodation.externalId,
      ratePlanId: booking.ratePlanId ?? accommodation.externalId,
      checkIn: booking.checkIn?.toISOString().split("T")[0] ?? "",
      checkOut: booking.checkOut?.toISOString().split("T")[0] ?? "",
      guests: booking.guestCount ?? 1,
      guestInfo: {
        firstName: firstName ?? "Guest",
        lastName,
        email: order.guestEmail,
        phone: order.guestPhone ?? null,
      },
      addons: [],
      specialRequests: booking.specialRequests ?? undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "create_pms_booking.adapter_failed", {
      orderId,
      bookingId: booking.id,
      error: msg,
    });
    return { ok: false, error: msg, retryable: true };
  }

  // 6. Update Booking with PMS confirmation and create OrderEvent
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        pmsBookingRef: confirmation.confirmationNumber,
        externalId: confirmation.externalId,
        status: confirmation.status === "CONFIRMED" ? "ACTIVE" : "PRE_CHECKIN",
      },
    });

    await createOrderEventInTx(tx, {
      orderId,
      tenantId,
      type: "ORDER_CONFIRMED",
      message: `PMS-bokning bekräftad: ${confirmation.confirmationNumber}`,
      metadata: {
        pmsBookingRef: confirmation.confirmationNumber,
        pmsExternalId: confirmation.externalId,
        pmsStatus: confirmation.status,
      },
    });
  });

  log("info", "create_pms_booking.success", {
    orderId,
    bookingId: booking.id,
    pmsBookingRef: confirmation.confirmationNumber,
  });

  return {
    ok: true,
    pmsBookingRef: confirmation.confirmationNumber,
    bookingId: booking.id,
  };
}
