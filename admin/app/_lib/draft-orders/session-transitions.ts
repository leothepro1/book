/**
 * Phase H — `DraftCheckoutSession.status` transition validator.
 *
 * Spec: docs/architecture/draft-orders-invoice-flow.md v1.3 §4.2
 * (the session-status state machine) and §5 invariant 12 (a buyer
 * payment that arrives after `expiresAt` is honoured — money trumps
 * expiry, so EXPIRED → PAID is allowed).
 *
 * Mirrors `state-machine.ts:DRAFT_TRANSITIONS` for `DraftOrderStatus`
 * but one level deeper — the session's own lifecycle.
 *
 * First consumer: Phase H webhook handler, validating that an
 * incoming `payment_intent.succeeded` for a `DraftCheckoutSession`
 * may legally promote the row to PAID before tx1 runs.
 *
 * Second consumer (planned): Phase I expiry / cleanup crons.
 *
 * Why this is a map + helper rather than `if`s in the handler:
 *   - The transition matrix is the contract between Phase D
 *     (unlink, ACTIVE → UNLINKED), Phase E (lazy create + step 3/4/5
 *     compensation, ACTIVE → CANCELLED), Phase H (ACTIVE/EXPIRED →
 *     PAID), and Phase I (ACTIVE → EXPIRED, EXPIRED → CANCELLED).
 *     Pinning it once avoids drift across the four writers.
 *   - Terminal states (UNLINKED, PAID, CANCELLED) have empty
 *     outbound sets — any code that tries to transition out of one
 *     fails the validator and prevents bugs like a webhook
 *     re-paying a refunded session.
 */

import type { DraftCheckoutSessionStatus } from "@prisma/client";

export const SESSION_TRANSITIONS: Record<
  DraftCheckoutSessionStatus,
  ReadonlySet<DraftCheckoutSessionStatus>
> = {
  ACTIVE: new Set<DraftCheckoutSessionStatus>([
    "UNLINKED",
    "EXPIRED",
    "CANCELLED",
    "PAID",
  ]),
  // EXPIRED → PAID per v1.3 §5 invariant 12: money-moved-trumps-expiry.
  // EXPIRED → CANCELLED is the cleanup-cron path (Phase I).
  EXPIRED: new Set<DraftCheckoutSessionStatus>(["PAID", "CANCELLED"]),
  UNLINKED: new Set<DraftCheckoutSessionStatus>(),
  PAID: new Set<DraftCheckoutSessionStatus>(),
  CANCELLED: new Set<DraftCheckoutSessionStatus>(),
};

/**
 * Pure check: may a `DraftCheckoutSession` row in `from` legally be
 * written to `to`?
 *
 * The validator is advisory. The authoritative gate is the
 * `updateMany WHERE status IN (...)` CAS in the writer's
 * transaction. Use this helper for early-return guards, defensive
 * assertions inside transactions, and exhaustive-test generation.
 */
export function canSessionTransition(
  from: DraftCheckoutSessionStatus,
  to: DraftCheckoutSessionStatus,
): boolean {
  return SESSION_TRANSITIONS[from].has(to);
}
