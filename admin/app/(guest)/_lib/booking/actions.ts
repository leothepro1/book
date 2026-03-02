"use server";

import { prisma } from "../../../_lib/db/prisma";
import { BookingStatus } from "@prisma/client";
import { canCheckIn, canCheckOut, isCheckInTimeReached } from "./status";

export type ActionResult =
  | { ok: true; bookingId: string; already: boolean }
  | { ok: false; reason: "NOT_FOUND" | "NOT_ALLOWED"; message: string };

export async function performCheckIn(
  bookingId: string,
  checkInTime: string,
  now: Date = new Date(),
  signatureDataUrl?: string
): Promise<ActionResult> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return { ok: false, reason: "NOT_FOUND", message: "Ingen bokning hittades." };

    // Idempotens
    if (booking.status === BookingStatus.ACTIVE && booking.checkedInAt) {
      return { ok: true, bookingId: booking.id, already: true };
    }

    if (booking.status === BookingStatus.COMPLETED) {
      return { ok: false, reason: "NOT_ALLOWED", message: "Bokningen är redan avslutad." };
    }

    // Gate
    if (!canCheckIn(booking as any, now) || !isCheckInTimeReached(booking as any, checkInTime, now)) {
      return { ok: false, reason: "NOT_ALLOWED", message: "Check-in är inte tillgängligt ännu." };
    }

    // Race-safe update with signature
    const updateData: any = {
      status: BookingStatus.ACTIVE,
      checkedInAt: now,
    };

    if (signatureDataUrl) {
      updateData.signatureCapturedAt = now;
      updateData.signatureDataUrl = signatureDataUrl;
    }

    const updated = await tx.booking.updateMany({
      where: { id: booking.id, status: BookingStatus.PRE_CHECKIN, checkedInAt: null },
      data: updateData,
    });

    if (updated.count === 0) {
      const re = await tx.booking.findUnique({ where: { id: booking.id } });
      if (re?.status === BookingStatus.ACTIVE && re.checkedInAt) {
        return { ok: true, bookingId: booking.id, already: true };
      }
      return { ok: false, reason: "NOT_ALLOWED", message: "Kunde inte checka in (status ändrades)." };
    }

    return { ok: true, bookingId: booking.id, already: false };
  });
}

export async function performCheckOut(bookingId: string, now: Date = new Date()): Promise<ActionResult> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return { ok: false, reason: "NOT_FOUND", message: "Ingen bokning hittades." };

    // Idempotens
    if (booking.status === BookingStatus.COMPLETED && booking.checkedOutAt) {
      return { ok: true, bookingId: booking.id, already: true };
    }

    // Gate
    if (!canCheckOut(booking as any)) {
      return { ok: false, reason: "NOT_ALLOWED", message: "Check-out är inte tillgängligt." };
    }

    // Race-safe update
    const updated = await tx.booking.updateMany({
      where: { id: booking.id, status: BookingStatus.ACTIVE, checkedOutAt: null },
      data: { status: BookingStatus.COMPLETED, checkedOutAt: now },
    });

    if (updated.count === 0) {
      const re = await tx.booking.findUnique({ where: { id: booking.id } });
      if (re?.status === BookingStatus.COMPLETED && re.checkedOutAt) {
        return { ok: true, bookingId: booking.id, already: true };
      }
      return { ok: false, reason: "NOT_ALLOWED", message: "Kunde inte checka ut (status ändrades)." };
    }

    return { ok: true, bookingId: booking.id, already: false };
  });
}
