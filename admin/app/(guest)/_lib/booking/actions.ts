"use server";

import { prisma } from "../../../_lib/db/prisma";
import { mapPrismaStatus } from "@/app/_lib/integrations/types";
import { toPrismaBookingStatus } from "@/app/_lib/integrations/prisma-mapping";
import { canCheckIn, canCheckOut, isCheckInTimeReached } from "./status";
import {
  triggerCheckInConfirmed,
  triggerCheckOutConfirmed,
} from "@/app/_lib/integrations/sync/email-triggers";
import type { BookingWithStatus } from "./types";

export type ActionResult =
  | { ok: true; bookingId: string; already: boolean }
  | { ok: false; reason: "NOT_FOUND" | "NOT_ALLOWED"; message: string };

/** Map a Prisma Booking row to the shape canCheckIn/canCheckOut expect. */
function toBookingWithStatus(b: {
  id: string;
  status: string;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  arrival: Date;
  departure: Date;
}): BookingWithStatus {
  return {
    externalId: b.id,
    status: mapPrismaStatus(b.status as Parameters<typeof mapPrismaStatus>[0]),
    checkedInAt: b.checkedInAt,
    checkedOutAt: b.checkedOutAt,
    arrival: b.arrival,
    departure: b.departure,
  };
}

export async function performCheckIn(
  bookingId: string,
  checkInTime: string,
  now: Date = new Date(),
  signatureDataUrl?: string
): Promise<ActionResult> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return { ok: false, reason: "NOT_FOUND", message: "Ingen bokning hittades." };

    const normalized = toBookingWithStatus(booking);

    // Idempotens
    if (normalized.status === "active" && booking.checkedInAt) {
      return { ok: true, bookingId: booking.id, already: true };
    }

    if (normalized.status === "completed") {
      return { ok: false, reason: "NOT_ALLOWED", message: "Bokningen är redan avslutad." };
    }

    // Gate
    if (!canCheckIn(normalized, now) || !isCheckInTimeReached(normalized, checkInTime, now)) {
      return { ok: false, reason: "NOT_ALLOWED", message: "Check-in är inte tillgängligt ännu." };
    }

    // Race-safe update with signature
    const updateData: Record<string, unknown> = {
      status: toPrismaBookingStatus("active"),
      checkedInAt: now,
    };

    if (signatureDataUrl) {
      updateData.signatureCapturedAt = now;
      updateData.signatureDataUrl = signatureDataUrl;
    }

    const updated = await tx.booking.updateMany({
      where: { id: booking.id, status: toPrismaBookingStatus("upcoming"), checkedInAt: null },
      data: updateData,
    });

    if (updated.count === 0) {
      const re = await tx.booking.findUnique({ where: { id: booking.id } });
      if (re && toBookingWithStatus(re).status === "active" && re.checkedInAt) {
        return { ok: true, bookingId: booking.id, already: true };
      }
      return { ok: false, reason: "NOT_ALLOWED", message: "Kunde inte checka in (status ändrades)." };
    }

    // Send check-in email (dedup + fire-and-forget via safeSend)
    if (!booking.checkedInEmailSentAt) {
      await tx.booking.update({
        where: { id: booking.id },
        data: { checkedInEmailSentAt: now },
      });
      const withTenant = await tx.booking.findUnique({
        where: { id: booking.id },
        include: { tenant: true },
      });
      if (withTenant) {
        // Fire outside transaction — email must not block or rollback check-in
        triggerCheckInConfirmed(withTenant).catch(() => {});
      }
    }

    return { ok: true, bookingId: booking.id, already: false };
  });
}

export async function performCheckOut(bookingId: string, now: Date = new Date()): Promise<ActionResult> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return { ok: false, reason: "NOT_FOUND", message: "Ingen bokning hittades." };

    const normalized = toBookingWithStatus(booking);

    // Idempotens
    if (normalized.status === "completed" && booking.checkedOutAt) {
      return { ok: true, bookingId: booking.id, already: true };
    }

    // Gate
    if (!canCheckOut(normalized)) {
      return { ok: false, reason: "NOT_ALLOWED", message: "Check-out är inte tillgängligt." };
    }

    // Race-safe update
    const updated = await tx.booking.updateMany({
      where: { id: booking.id, status: toPrismaBookingStatus("active"), checkedOutAt: null },
      data: { status: toPrismaBookingStatus("completed"), checkedOutAt: now },
    });

    if (updated.count === 0) {
      const re = await tx.booking.findUnique({ where: { id: booking.id } });
      if (re && toBookingWithStatus(re).status === "completed" && re.checkedOutAt) {
        return { ok: true, bookingId: booking.id, already: true };
      }
      return { ok: false, reason: "NOT_ALLOWED", message: "Kunde inte checka ut (status ändrades)." };
    }

    // Send check-out email (dedup + fire-and-forget via safeSend)
    if (!booking.checkedOutEmailSentAt) {
      await tx.booking.update({
        where: { id: booking.id },
        data: { checkedOutEmailSentAt: now },
      });
      const withTenant = await tx.booking.findUnique({
        where: { id: booking.id },
        include: { tenant: true },
      });
      if (withTenant) {
        // Fire outside transaction — email must not block or rollback check-out
        triggerCheckOutConfirmed(withTenant).catch(() => {});
      }
    }

    return { ok: true, bookingId: booking.id, already: false };
  });
}
