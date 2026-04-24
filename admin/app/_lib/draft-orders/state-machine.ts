/**
 * DraftOrder state machine.
 *
 * Single source of truth for lifecycle transitions. Mirrors the
 * `orders/types.ts` pattern (VALID_TRANSITIONS + canTransition).
 *
 * Transition ownership per FAS phase:
 *   6.5A  — createDraft writes OPEN only; no runtime transitions yet
 *   6.5B  — no transitions (freezePrices doesn't change status)
 *   6.5C  — no transitions
 *   6.5D  — sendInvoice (→ INVOICED), cancelDraft (→ CANCELLED),
 *           convertToOrder (INVOICED → PAID → COMPLETING → COMPLETED),
 *           transitionStatus (generic helper)
 *   Future — PENDING_APPROVAL / APPROVED / REJECTED (approval workflow),
 *            OVERDUE (billing cron)
 *
 * Per operator Q4: REJECTED and COMPLETED and CANCELLED are terminal.
 * Per operator Q1: PENDING_APPROVAL / APPROVED / REJECTED defined here
 * for future correctness; no service implements them in 6.5.
 */

import type { DraftHoldState, DraftOrderStatus } from "@prisma/client";

export const DRAFT_TRANSITIONS: Record<DraftOrderStatus, DraftOrderStatus[]> = {
  OPEN: ["INVOICED", "PENDING_APPROVAL", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["INVOICED", "CANCELLED"],
  REJECTED: [], // terminal
  INVOICED: ["PAID", "OVERDUE", "CANCELLED"],
  OVERDUE: ["PAID", "CANCELLED"],
  PAID: ["COMPLETING"],
  COMPLETING: ["COMPLETED"], // transient — only set inside convertToOrder tx
  COMPLETED: [], // terminal
  CANCELLED: [], // terminal
};

/**
 * Returns true if `to` is a valid successor of `from`.
 * Unknown/stale status values return false (fail closed).
 */
export function canTransition(
  from: DraftOrderStatus,
  to: DraftOrderStatus,
): boolean {
  return DRAFT_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── FAS 6.5C: DraftHoldState transitions ────────────────────────

/**
 * DraftReservation hold-state machine. Enforced by hold services
 * (FAS 6.5C: placeHoldForDraftLine, releaseHoldForDraftLine, the
 * release-expired-draft-holds cron, and convertToOrder in 6.5D).
 *
 * Semantics per FAS 6.5C audit §4:
 *   - NOT_PLACED → PLACING          start of 2-phase commit
 *   - PLACING    → PLACED | FAILED   Phase 3 resolves Phase 2 outcome
 *   - PLACED     → RELEASED          admin / cron / removeLine / cancelDraft
 *   - PLACED     → CONFIRMED         convertToOrder's confirmHold success
 *   - FAILED     → PLACING           admin retry (fresh attempt nonce)
 *   - FAILED     → RELEASED          cleanup path (no Mews state to clear)
 *   - RELEASED   → (terminal)
 *   - CONFIRMED  → (terminal)
 *
 * Stuck-PLACING recovery transitions (PLACING → PLACED | FAILED) go
 * through the same edges as the normal flow — the cron just uses the
 * idempotency cache to determine which side to resolve to.
 */
export const HOLD_TRANSITIONS: Record<DraftHoldState, DraftHoldState[]> = {
  NOT_PLACED: ["PLACING"],
  PLACING:    ["PLACED", "FAILED"],
  PLACED:     ["RELEASED", "CONFIRMED"],
  FAILED:     ["PLACING", "RELEASED"],
  RELEASED:   [], // terminal
  CONFIRMED:  [], // terminal
};

/**
 * Returns true if `to` is a valid successor of `from`.
 * Unknown/stale values fail closed.
 */
export function canHoldTransition(
  from: DraftHoldState,
  to: DraftHoldState,
): boolean {
  return HOLD_TRANSITIONS[from]?.includes(to) ?? false;
}
