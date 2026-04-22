/**
 * CancellationRequest state machine.
 *
 * `canTransitionCancellation(from, to)` is the ONLY guard for status
 * mutations. No route, no engine function, no admin action may inline
 * its own status check — every transition goes through this table.
 *
 * Mirrors the discipline established by `canTransition()` in
 * admin/app/_lib/orders/types.ts.
 *
 * See admin/docs/cancellation-engine.md §4 for the state diagram.
 */

import type { CancellationStatus } from "@prisma/client";

/**
 * Valid transitions. Empty array = terminal state.
 *
 * - REQUESTED: new request, awaiting approval or expiry
 * - OPEN: approved; saga in flight
 * - DECLINED: staff declined OR saga hit permanent failure (restartable)
 * - CANCELED: guest/staff withdrew before saga started (terminal)
 * - CLOSED: saga completed successfully (terminal)
 * - EXPIRED: REQUESTED aged past expiresAt (restartable)
 */
const VALID_TRANSITIONS: Record<CancellationStatus, CancellationStatus[]> = {
  REQUESTED: ["OPEN", "DECLINED", "CANCELED", "EXPIRED"],
  OPEN: ["CLOSED", "DECLINED"],
  DECLINED: [],
  CANCELED: [],
  CLOSED: [],
  EXPIRED: [],
};

export function canTransitionCancellation(
  from: CancellationStatus,
  to: CancellationStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/** A status that cannot change further. Used by the UI to hide action buttons. */
export function isTerminalCancellationStatus(status: CancellationStatus): boolean {
  return VALID_TRANSITIONS[status]?.length === 0;
}

/**
 * DECLINED and EXPIRED allow a *new* CancellationRequest to be created
 * for the same booking — they're "terminal-but-restartable". Used by
 * create-path to decide whether an existing terminal row blocks a new
 * request or not.
 */
export function allowsRestart(status: CancellationStatus): boolean {
  return status === "DECLINED" || status === "EXPIRED";
}
