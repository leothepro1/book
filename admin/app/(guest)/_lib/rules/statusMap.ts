import type { NormalizedBookingStatus } from "@/app/_lib/integrations/types";
import type { RuleBookingStatus } from "./types";

/**
 * Map NormalizedBookingStatus -> legacy/rules RuleBookingStatus
 * (rules är kvar bara för visibility-rules)
 */
export function toRuleBookingStatus(s: NormalizedBookingStatus): RuleBookingStatus | null {
  switch (s) {
    case "upcoming":
      return "booked";
    case "active":
      return "checked_in";
    case "completed":
      return "checked_out";
    case "cancelled":
      return "cancelled";
    default:
      return null;
  }
}
