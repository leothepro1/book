import type { BookingWithStatus, BookingStatus } from "./types";

/**
 * Get current booking status
 */
export function getBookingStatus(booking: BookingWithStatus): BookingStatus {
  return booking.status;
}

/**
 * Check if booking can check in
 */
export function canCheckIn(booking: BookingWithStatus, now: Date = new Date()): boolean {
  if (booking.status !== "upcoming") return false;
  if (booking.checkedInAt) return false;

  // Check if arrival date has passed (or is today)
  const arrivalDate = new Date(booking.arrival);
  arrivalDate.setHours(0, 0, 0, 0);
  const nowDate = new Date(now);
  nowDate.setHours(0, 0, 0, 0);

  return nowDate >= arrivalDate;
}

/**
 * Check if booking can check out
 */
export function canCheckOut(booking: BookingWithStatus): boolean {
  if (booking.status !== "active") return false;
  if (!booking.checkedInAt) return false;
  if (booking.checkedOutAt) return false;

  return true;
}

/**
 * Check if check-in time has arrived (e.g., 14:00)
 */
export function isCheckInTimeReached(
  booking: BookingWithStatus,
  checkInTime: string = "14:00",
  now: Date = new Date()
): boolean {
  const arrival = new Date(booking.arrival);
  const [hours, minutes] = checkInTime.split(":").map(Number);

  const checkInDateTime = new Date(
    arrival.getFullYear(),
    arrival.getMonth(),
    arrival.getDate(),
    hours,
    minutes,
    0,
    0
  );

  return now >= checkInDateTime;
}
