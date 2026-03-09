/**
 * Check-in Slot Section — "pebble" variant
 *
 * Placement wrapper: renders the global CheckinSlot component
 * above the welcome heading in the Pebble theme.
 *
 * The button logic, labels, icons, and links are all managed
 * by the global CheckinSlot — this section only controls position.
 */

import { registerSection } from "../../registry";
import type { SectionProps } from "../../types";
import { CheckinSlot } from "../../../../_components/CheckinSlot";

function CheckinSlotPebble(_props: SectionProps) {
  // Currently hidden — will render CheckinSlot when activated
  return null;
}

registerSection("checkin-slot", "pebble", CheckinSlotPebble);

export default CheckinSlotPebble;
