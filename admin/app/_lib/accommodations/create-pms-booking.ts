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

  // 1. Load Order with linked Booking and line items
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
      lineItems: {
        select: {
          productId: true,
          variantId: true,
          title: true,
          quantity: true,
          totalAmount: true,
          currency: true,
        },
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

  // 4. Resolve spot marker for unit-level PMS assignment (if guest selected a specific spot)
  //    requestedResourceId must be a Mews Resource.Id (physical unit), NOT a ResourceCategory.Id.
  //    AccommodationUnit.externalId stores the correct Resource.Id from PMS sync.
  let requestedResourceId: string | undefined;
  const spotLineItem = order.lineItems.find((li) => li.productId.startsWith("spot-map:"));
  if (spotLineItem?.variantId) {
    try {
      const spotMarker = await prisma.spotMarker.findUnique({
        where: { id: spotLineItem.variantId },
        select: {
          id: true,
          accommodationUnitId: true,
          unit: { select: { externalId: true, name: true } },
        },
      });

      if (!spotMarker) {
        log("warn", "create_pms_booking.spot_marker_not_found", {
          orderId,
          bookingId: booking.id,
          variantId: spotLineItem.variantId,
        });
      } else if (!spotMarker.accommodationUnitId) {
        log("warn", "create_pms_booking.spot_marker_no_unit", {
          orderId,
          bookingId: booking.id,
          markerId: spotMarker.id,
        });
      } else if (!spotMarker.unit?.externalId) {
        log("warn", "create_pms_booking.spot_unit_no_external_id", {
          orderId,
          bookingId: booking.id,
          markerId: spotMarker.id,
          unitName: spotMarker.unit?.name ?? null,
        });
      } else {
        requestedResourceId = spotMarker.unit.externalId;
        log("info", "create_pms_booking.spot_unit_resolved", {
          orderId,
          bookingId: booking.id,
          markerId: spotMarker.id,
          unitExternalId: spotMarker.unit.externalId,
        });
      }
    } catch (err) {
      log("warn", "create_pms_booking.spot_marker_lookup_failed", {
        orderId,
        bookingId: booking.id,
        spotMarkerId: spotLineItem.variantId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 5. Re-validate spot availability immediately before PMS booking
  //    If unavailable: clear requestedResourceId so Mews auto-assigns from the category.
  //    Never cancel — guest has already paid.
  const adapter = await resolveAdapter(tenantId);

  if (requestedResourceId && booking.checkIn && booking.checkOut) {
    try {
      const unitAvailability = await adapter.getUnitAvailability(
        tenantId,
        [requestedResourceId],
        booking.checkIn,
        booking.checkOut,
      );

      const isAvailable = unitAvailability.get(requestedResourceId) ?? false;

      if (!isAvailable) {
        log("warn", "spot_booking.unit_unavailable_at_pms_sync", {
          orderId,
          markerId: spotLineItem?.variantId ?? null,
          requestedResourceId,
          checkIn: booking.checkIn.toISOString(),
          checkOut: booking.checkOut.toISOString(),
        });
        requestedResourceId = undefined;
      }
    } catch (err) {
      log("warn", "spot_booking.availability_recheck_failed", {
        orderId,
        requestedResourceId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Proceed without specific unit — let Mews auto-assign
      requestedResourceId = undefined;
    }
  }

  // 6. Call PMS adapter
  //
  // Add-on flow: every Order line item must be reflected in the PMS.
  // The first line item is the accommodation (already on the reservation).
  // Spot-map items (productId starts with "spot-map:") drive unit assignment,
  // not PMS order items. Everything else is an add-on that gets attached
  // as an arbitrary order item on the reservation (Mews orders/add).
  //
  // Example — booking #1419:
  //   Line 1: Stuga Havsutsikt (700 SEK) → reservation (700 SEK in Mews)
  //   Line 2: Platsbokning     (400 SEK) → order item on reservation (400 SEK)
  //   Mews total: 1100 SEK ✓  — matches what the guest paid.

  const [firstName, ...lastParts] = (order.guestName || "Guest").split(" ");
  const lastName = lastParts.join(" ") || "-";

  // Filter add-on line items:
  // - Skip the accommodation line item (first, productId === accommodationId)
  // - Skip spot-map line items (drive unit assignment, not PMS charges)
  const addonLineItems = order.lineItems
    .filter((li) =>
      li.productId !== booking.accommodationId &&
      !li.productId.startsWith("spot-map:"),
    )
    .map((li) => ({
      title: li.title,
      quantity: li.quantity,
      totalAmount: li.totalAmount,
      currency: li.currency,
    }));

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
      addonLineItems,
      specialRequests: booking.specialRequests ?? undefined,
      requestedResourceId,
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

  // 7. Update Booking with PMS confirmation and create OrderEvent
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
