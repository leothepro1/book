/**
 * Global Check-in Slot
 *
 * Central component for all check-in/check-out/open-door actions.
 * Contains all booking-status logic, labels, icons, and links.
 *
 * Themes render this via a `checkin-slot` section that controls
 * PLACEMENT only. The button appearance and logic is universal.
 *
 * Currently: always hidden (returns null).
 * When activated, renders the appropriate action button based on
 * booking status:
 *   - PRE_CHECKIN (time reached)  → "Checka in"  → /check-in?token=
 *   - PRE_CHECKIN (before time)   → "Check-in {time}" (disabled)
 *   - ACTIVE                      → "Öppna dörr"
 *   - COMPLETED                   → hidden
 */

import type { Booking } from "@prisma/client";
import type { BookingStatus } from "../_lib/booking";

export type CheckinSlotProps = {
  booking: Booking;
  bookingStatus: BookingStatus;
  token?: string;
  checkInTime?: string;
};

export function CheckinSlot(_props: CheckinSlotProps) {
  // Currently always hidden — will be activated when check-in flow is ready
  return null;
}
