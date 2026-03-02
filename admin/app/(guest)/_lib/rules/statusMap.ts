import { BookingStatus } from "@prisma/client";
import type { RuleBookingStatus } from "./types";

/**
 * Map global Prisma BookingStatus -> legacy/rules RuleBookingStatus
 * (rules är kvar bara för visibility-rules)
 */
export function toRuleBookingStatus(s: BookingStatus): RuleBookingStatus | null {
  switch (s) {
    case BookingStatus.PRE_CHECKIN:
      return "booked";
    case BookingStatus.ACTIVE:
      return "checked_in";
    case BookingStatus.COMPLETED:
      return "checked_out";
    default:
      return null;
  }
}
