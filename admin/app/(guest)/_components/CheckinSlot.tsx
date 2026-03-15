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
 *   - upcoming (time reached)  → "Checka in"  → /check-in?token=
 *   - upcoming (before time)   → "Check-in {time}" (disabled)
 *   - active                   → "Öppna dörr"
 *   - completed                → hidden
 */

import type { NormalizedBooking, NormalizedBookingStatus } from "@/app/_lib/integrations/types";

export type CheckinSlotProps = {
  booking: NormalizedBooking;
  bookingStatus: NormalizedBookingStatus;
  token?: string;
  checkInTime?: string;
};

export function CheckinSlot(_props: CheckinSlotProps) {
  // Currently always hidden — will be activated when check-in flow is ready
  return null;
}
