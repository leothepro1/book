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

import type { DraftOrderStatus } from "@prisma/client";

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
