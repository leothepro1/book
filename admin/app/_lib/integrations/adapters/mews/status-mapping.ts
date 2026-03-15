/**
 * Mews State → NormalizedBookingStatus Mapping
 */

import type { MewsReservationState } from "./mews-types";
import type { NormalizedBookingStatus } from "../../types";

const STATE_MAP: Record<MewsReservationState, NormalizedBookingStatus> = {
  Confirmed: "upcoming",
  Inquired: "upcoming",
  Optional: "upcoming",
  Requested: "upcoming",
  Started: "active",
  Processed: "completed",
  Canceled: "cancelled",
};

export function mapMewsState(state: MewsReservationState): NormalizedBookingStatus {
  const mapped = STATE_MAP[state];
  if (!mapped) {
    throw new Error(`Unknown Mews reservation state: ${state}`);
  }
  return mapped;
}

/** Reverse map: NormalizedBookingStatus → Mews States (can be multiple). */
const REVERSE_MAP: Record<NormalizedBookingStatus, MewsReservationState[]> = {
  upcoming: ["Confirmed", "Inquired", "Optional", "Requested"],
  active: ["Started"],
  completed: ["Processed"],
  cancelled: ["Canceled"],
};

export function toMewsStates(status: NormalizedBookingStatus): MewsReservationState[] {
  return REVERSE_MAP[status];
}
