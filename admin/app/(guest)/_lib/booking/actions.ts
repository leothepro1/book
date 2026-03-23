"use server";

/**
 * Booking Actions — Booking Engine
 *
 * Guest portal check-in/check-out actions have been removed.
 * The booking engine handles bookings through PMS real-time queries.
 *
 * These exports are kept as no-ops so existing pages don't crash
 * while guest portal routes are being migrated.
 */

export type ActionResult =
  | { ok: true; bookingId: string; already: boolean }
  | { ok: false; reason: "NOT_FOUND" | "NOT_ALLOWED"; message: string };

export async function performCheckIn(
  _bookingId: string,
  _checkInTime: string,
  _now?: Date,
  _signatureDataUrl?: string,
): Promise<ActionResult> {
  return { ok: false, reason: "NOT_ALLOWED", message: "Check-in is not available in the booking engine." };
}

export async function performCheckOut(
  _bookingId: string,
  _now?: Date,
): Promise<ActionResult> {
  return { ok: false, reason: "NOT_ALLOWED", message: "Check-out is not available in the booking engine." };
}
