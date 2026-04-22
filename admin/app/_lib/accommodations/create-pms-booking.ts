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
import { Prisma } from "@prisma/client";
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
          holdExternalId: true,
          holdExpiresAt: true,
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

  // 2b. Hold confirmation path — if the checkout flow placed an
  //     availability hold at the PMS, promote it to Confirmed rather
  //     than creating a fresh reservation (which would either create
  //     a duplicate or race with the expiring hold). This is the
  //     happy path for tenants on PMSes that support holds (Mews).
  if (booking.holdExternalId) {
    const { resolveAdapter } = await import("@/app/_lib/integrations/resolve");
    const adapter = await resolveAdapter(tenantId);

    // 2b-i. Hold-expired recovery path — if our local clock says
    //       the hold's TTL has passed, CONSULT the PMS before
    //       giving up. In practice the hold might have been
    //       confirmed before expiration (microsecond-near-edge race,
    //       or Mews actually holding open longer than ReleasedUtc).
    //       If PMS reports a valid confirmed reservation → recover
    //       and complete normally instead of triggering a refund
    //       for a booking that's in fact alive at the hotel.
    if (booking.holdExpiresAt && booking.holdExpiresAt.getTime() < Date.now()) {
      try {
        const pmsState = await adapter.lookupBooking(
          tenantId,
          booking.holdExternalId,
        );
        if (
          pmsState &&
          (pmsState.status === "confirmed" ||
            pmsState.status === "checked_in" ||
            pmsState.status === "checked_out")
        ) {
          // Recovery — PMS has it confirmed despite our clock. Save
          // the ref, skip compensation. Without this, a refund would
          // go out and the hotel would have an unpaid reservation.
          await prisma.booking.update({
            where: { id: booking.id },
            data: {
              pmsBookingRef: booking.holdExternalId,
              externalId: booking.holdExternalId,
              externalSource: adapter.provider,
              lastSyncedAt: new Date(),
            },
          });
          log("warn", "create_pms_booking.hold_expired_but_confirmed_at_pms", {
            orderId,
            bookingId: booking.id,
            holdExternalId: booking.holdExternalId,
            holdExpiresAt: booking.holdExpiresAt.toISOString(),
            pmsStatus: pmsState.status,
          });
          return {
            ok: true,
            pmsBookingRef: booking.holdExternalId,
            bookingId: booking.id,
          };
        }
      } catch (err) {
        // Adapter failure during the recovery check — we can't tell
        // whether PMS confirmed or not. Safer to treat as retryable
        // so the outbound cron tries once more before proceeding to
        // compensation.
        const msg = err instanceof Error ? err.message : String(err);
        log("warn", "create_pms_booking.hold_expired_recovery_adapter_error", {
          orderId,
          bookingId: booking.id,
          holdExternalId: booking.holdExternalId,
          error: msg,
        });
        return { ok: false, error: msg, retryable: true };
      }

      // PMS confirms the hold is truly gone. Now safe to proceed
      // with compensation via the outbound engine's retryable=false
      // path.
      log("warn", "create_pms_booking.hold_already_expired", {
        orderId,
        bookingId: booking.id,
        holdExternalId: booking.holdExternalId,
        holdExpiresAt: booking.holdExpiresAt.toISOString(),
      });
      return {
        ok: false,
        error: `Hold ${booking.holdExternalId} expired before confirmation`,
        retryable: false,
      };
    }

    try {
      const confirmedId = await adapter.confirmHold(
        tenantId,
        booking.holdExternalId,
      );

      // Persist the PMS ref and clear hold fields (confirmation is
      // terminal — no more "this booking is provisional" semantics).
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          pmsBookingRef: confirmedId,
          externalId: confirmedId,
          externalSource: adapter.provider,
          lastSyncedAt: new Date(),
        },
      });

      // Read-your-write verification — fetch the reservation back
      // from the PMS and compare fields. Non-blocking: the booking
      // is already created; mismatches surface via Booking.integrityFlag
      // for operator review in the health endpoint. Without this,
      // timezone-drift, field-truncation and eventual-consistency
      // bugs silently produce divergent state between us and PMS.
      if (booking.checkIn && booking.checkOut) {
        const { verifyPmsState } = await import(
          "@/app/_lib/integrations/reliability/verify-pms-state"
        );
        const verify = await verifyPmsState({
          adapter,
          tenantId,
          externalId: confirmedId,
          expected: {
            checkIn: booking.checkIn.toISOString().slice(0, 10),
            checkOut: booking.checkOut.toISOString().slice(0, 10),
            guests: booking.guestCount ?? 1,
            email: order.guestEmail,
          },
        });
        if (!verify.matches) {
          await prisma.booking.update({
            where: { id: booking.id },
            data: {
              integrityFlag:
                verify.reason === "pms_not_found"
                  ? "PMS_NOT_FOUND"
                  : verify.reason === "state_mismatch"
                    ? "STATE_MISMATCH"
                    : verify.reason === "adapter_unreachable"
                      ? null // unverifiable, don't flag
                      : "MISMATCH",
              integrityMismatchFields:
                verify.reason !== "adapter_unreachable"
                  ? ((verify.mismatches ?? []) as unknown as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
              integrityDetectedAt:
                verify.reason !== "adapter_unreachable"
                  ? new Date()
                  : null,
            },
          });
          if (verify.reason !== "adapter_unreachable") {
            log("error", "pms.integrity.mismatch_detected", {
              orderId,
              bookingId: booking.id,
              pmsBookingRef: confirmedId,
              reason: verify.reason,
              mismatches: JSON.stringify(verify.mismatches ?? []),
              source: "hold_confirm",
            });
          }
        }
      }

      log("info", "create_pms_booking.hold_confirmed", {
        orderId,
        bookingId: booking.id,
        pmsBookingRef: confirmedId,
      });
      return { ok: true, pmsBookingRef: confirmedId, bookingId: booking.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("error", "create_pms_booking.hold_confirm_failed", {
        orderId,
        bookingId: booking.id,
        holdExternalId: booking.holdExternalId,
        error: msg,
      });
      // Treat as retryable — transient network errors or PMS 5xx
      // are worth another attempt. The outbound engine's retry
      // ladder applies.
      return { ok: false, error: msg, retryable: true };
    }
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

  const createParams = {
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
    addons: [] as Array<{ addonId: string; quantity: number }>,
    addonLineItems,
    specialRequests: booking.specialRequests ?? undefined,
    requestedResourceId,
  };

  // Idempotency guard — if this outbound-job retry already hit the
  // PMS on a previous attempt whose response we lost (network
  // timeout, Vercel lambda kill), the key's cached result is
  // returned here instead of creating a duplicate reservation. The
  // key is derived from the orderId + essential params so the same
  // logical operation always resolves to the same key across all
  // retries.
  const { computeIdempotencyKey, withIdempotency } = await import(
    "@/app/_lib/integrations/reliability/idempotency"
  );
  const idempotencyKey = computeIdempotencyKey({
    tenantId,
    provider: adapter.provider,
    operation: "createBooking",
    inputs: {
      orderId: order.id,
      categoryId: createParams.categoryId,
      ratePlanId: createParams.ratePlanId,
      checkIn: createParams.checkIn,
      checkOut: createParams.checkOut,
      guests: createParams.guests,
      requestedResourceId: createParams.requestedResourceId ?? null,
    },
  });

  let confirmation;
  try {
    confirmation = (await withIdempotency(
      idempotencyKey,
      {
        tenantId,
        provider: adapter.provider,
        operation: "createBooking",
      },
      () => adapter.createBooking(tenantId, createParams),
    )) as Awaited<ReturnType<typeof adapter.createBooking>>;
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

  // Read-your-write verification — fetch the just-created booking
  // back from the PMS and compare against what we sent. Non-blocking:
  // mismatches set Booking.integrityFlag for operator review via
  // the health endpoint. Catches timezone/truncation/eventual-
  // consistency silently-wrong-data bugs that otherwise only
  // surface when the guest shows up at the hotel.
  try {
    const { verifyPmsState } = await import(
      "@/app/_lib/integrations/reliability/verify-pms-state"
    );
    const verify = await verifyPmsState({
      adapter,
      tenantId,
      externalId: confirmation.externalId,
      expected: {
        checkIn: createParams.checkIn,
        checkOut: createParams.checkOut,
        guests: createParams.guests,
        email: order.guestEmail,
      },
    });
    if (!verify.matches && verify.reason !== "adapter_unreachable") {
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          integrityFlag:
            verify.reason === "pms_not_found"
              ? "PMS_NOT_FOUND"
              : verify.reason === "state_mismatch"
                ? "STATE_MISMATCH"
                : "MISMATCH",
          integrityMismatchFields: verify.mismatches ?? [],
          integrityDetectedAt: new Date(),
        },
      });
      log("error", "pms.integrity.mismatch_detected", {
        orderId,
        bookingId: booking.id,
        pmsBookingRef: confirmation.confirmationNumber,
        reason: verify.reason,
        mismatches: JSON.stringify(verify.mismatches ?? []),
        source: "create_booking",
      });
    }
  } catch (err) {
    // Verification itself blew up — just log, don't block the
    // booking (it was created successfully at PMS).
    log("warn", "pms.integrity.verify_threw", {
      orderId,
      bookingId: booking.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

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
