/**
 * Cancellation policy resolution and fee calculation.
 *
 * Pure functions — no database, no side effects. All money is in
 * integer ören/cents; never floats.
 *
 * Invariant: rounding always favors the merchant (fee rounded UP,
 * refund rounded DOWN). Documented so that it survives refactoring.
 *
 * See admin/docs/cancellation-engine.md §7.
 */

import type {
  CancellationTier,
  CancellationTiers,
  CancellationPolicySnapshot,
  FeeResult,
} from "./types";

/**
 * Select the applicable tier given how many hours remain until check-in.
 *
 * Tiers are sorted most-advance-first; the first whose
 * `hoursBeforeCheckIn` is ≤ current lead time wins. If the booking's
 * check-in is in the past (negative lead time), or no tier matches,
 * the strictest tier (smallest threshold) applies — typically 100 %.
 *
 * Pure function. Does NOT mutate input array.
 */
export function applyTier(
  tiers: CancellationTiers,
  hoursUntilCheckIn: number,
): CancellationTier {
  const sorted = [...tiers].sort(
    (a, b) => b.hoursBeforeCheckIn - a.hoursBeforeCheckIn,
  );
  for (const tier of sorted) {
    if (hoursUntilCheckIn >= tier.hoursBeforeCheckIn) {
      return tier;
    }
  }
  // Past all thresholds — use the strictest (smallest-threshold) tier.
  // Guaranteed to exist: CancellationTiersSchema enforces non-empty.
  return sorted[sorted.length - 1];
}

/**
 * Compute hours between `now` and `checkIn`. May be negative if check-in
 * has passed. Uses integer math; partial hours round DOWN (so a guest
 * who cancels 3h59m before check-in is in the "3h before" band).
 */
export function hoursUntilCheckIn(
  checkIn: Date,
  now: Date = new Date(),
): number {
  return Math.floor((checkIn.getTime() - now.getTime()) / 3_600_000);
}

/**
 * Compute the cancellation fee and refund amount from a policy snapshot
 * and a booking's original total, given the moment of cancellation.
 *
 * Rounding: fee is rounded UP, refund = originalAmount − fee (so refund
 * rounds DOWN). This is the conventional merchant-favoring direction.
 * Documented invariant; do not change without product sign-off.
 *
 * All amounts in ören/cents (integers).
 */
export function calculateFee(params: {
  originalAmountOre: number;
  snapshot: CancellationPolicySnapshot;
  checkIn: Date;
  now?: Date;
}): FeeResult {
  if (!Number.isInteger(params.originalAmountOre)) {
    throw new Error("originalAmountOre must be an integer (ören)");
  }
  if (params.originalAmountOre < 0) {
    throw new Error("originalAmountOre must be non-negative");
  }

  const hoursBeforeCheckInAtRequest = hoursUntilCheckIn(
    params.checkIn,
    params.now ?? new Date(),
  );
  const appliedTier = applyTier(params.snapshot.tiers, hoursBeforeCheckInAtRequest);

  // Fee rounds UP: ceil(amount * percent / 100)
  const feeAmountOre = Math.ceil(
    (params.originalAmountOre * appliedTier.feePercent) / 100,
  );
  const refundAmountOre = Math.max(
    0,
    params.originalAmountOre - feeAmountOre,
  );

  return {
    feeAmountOre,
    refundAmountOre,
    appliedTier,
    hoursBeforeCheckInAtRequest,
  };
}
