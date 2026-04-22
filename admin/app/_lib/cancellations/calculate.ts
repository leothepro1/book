/**
 * Cancellation preview — pure-function fee computation using a
 * booking's frozen policy snapshot.
 *
 * Two use sites:
 *   • Guest portal: "If you cancel now, you'll be refunded X."
 *   • Engine create step: lock in the fee + refund amounts that the
 *     saga will charge and refund. Once written to CancellationRequest
 *     these are immutable — a re-quote between guest preview and
 *     submit is explicitly disallowed so the final refund matches the
 *     amount the guest saw.
 */

import { calculateFee } from "./policy";
import { resolvePolicyForCancel } from "./policy-resolution";
import { RequestPolicySnapshotSchema, type RequestPolicySnapshot } from "./types";

export type CancellationCalcInput = {
  booking: {
    cancellationPolicySnapshot: unknown;
    checkIn: Date | null;
    arrival: Date; // legacy field — used when checkIn is null
  };
  orderTotalAmountOre: number;
  currency: string;
  now?: Date;
};

export type CancellationCalcResult = {
  feeAmountOre: number;
  refundAmountOre: number;
  currency: string;
  requestSnapshot: RequestPolicySnapshot;
};

/**
 * Select the check-in date the saga will reason about. Bookings made
 * through the new accommodation flow populate `checkIn`; legacy rows
 * only have `arrival`. The two fields mean the same thing — the first
 * day of the stay — so we prefer checkIn and fall back to arrival.
 */
function resolveCheckIn(booking: {
  checkIn: Date | null;
  arrival: Date;
}): Date {
  return booking.checkIn ?? booking.arrival;
}

export function calculateCancellation(
  input: CancellationCalcInput,
): CancellationCalcResult {
  const now = input.now ?? new Date();
  const snapshot = resolvePolicyForCancel(input.booking, now);
  const checkIn = resolveCheckIn(input.booking);

  const fee = calculateFee({
    originalAmountOre: input.orderTotalAmountOre,
    snapshot,
    checkIn,
    now,
  });

  const requestSnapshot = RequestPolicySnapshotSchema.parse({
    ...snapshot,
    appliedTier: fee.appliedTier,
    hoursBeforeCheckInAtRequest: fee.hoursBeforeCheckInAtRequest,
  });

  return {
    feeAmountOre: fee.feeAmountOre,
    refundAmountOre: fee.refundAmountOre,
    currency: input.currency,
    requestSnapshot,
  };
}
