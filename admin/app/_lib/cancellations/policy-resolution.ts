/**
 * Cancellation policy resolution.
 *
 * Policy snapshots live on Booking.cancellationPolicySnapshot and are
 * frozen at checkout/confirmation time. Rule changes apply only to
 * future bookings — an existing booking's policy never changes.
 *
 * This file is the ONLY reader of that JSON column in the engine
 * pipeline. Every other module that needs policy data loads it via
 * loadPolicySnapshot() so Zod validation happens in exactly one place.
 *
 * If a booking has no snapshot (legacy rows, or a tenant that hasn't
 * configured any policy) we fall back to an explicit non-refundable
 * policy. This is the safe default — a tenant without policies set up
 * is one that has not yet opted into self-service cancellation, and we
 * must never auto-refund on their behalf.
 */

import {
  CancellationPolicySnapshotSchema,
  type CancellationPolicySnapshot,
} from "./types";
import { CancellationError } from "./errors";

/**
 * Parse a stored snapshot. Returns null when the field is null/undefined
 * (meaning: not yet snapshotted). Throws when the shape is corrupt —
 * that's a bug we want surfaced, not a silent fallback.
 */
export function loadPolicySnapshot(
  raw: unknown,
): CancellationPolicySnapshot | null {
  if (raw === null || raw === undefined) return null;
  const result = CancellationPolicySnapshotSchema.safeParse(raw);
  if (!result.success) {
    throw new CancellationError(
      "POLICY_MISSING",
      `Stored cancellation policy snapshot is malformed: ${result.error.message}`,
    );
  }
  return result.data;
}

/**
 * The safe fallback when a booking has no snapshot. 100% fee, no refund
 * ever. Used for:
 *   • Legacy bookings created before the cancellation engine shipped.
 *   • Bookings made by tenants without a CancellationPolicy configured.
 *
 * This snapshot is deterministic — same inputs → identical JSON — so
 * it can be safely re-generated without introducing drift.
 */
export function defaultNonRefundableSnapshot(
  now: Date = new Date(),
): CancellationPolicySnapshot {
  return {
    policyId: "__default-non-refundable__",
    policyName: "Standard (non-refundable)",
    tiers: [{ hoursBeforeCheckIn: 0, feePercent: 100 }],
    requireApproval: true,
    autoExpireHours: 48,
    snapshottedAt: now.toISOString(),
  };
}

/**
 * Resolve the policy a cancellation should use for a given booking.
 * Returns the stored snapshot if present; otherwise the safe default.
 * Never looks at live CancellationPolicy rows — that would introduce
 * rule-change-leakage and break the "future bookings only" invariant.
 */
export function resolvePolicyForCancel(
  booking: { cancellationPolicySnapshot: unknown },
  now: Date = new Date(),
): CancellationPolicySnapshot {
  const stored = loadPolicySnapshot(booking.cancellationPolicySnapshot);
  return stored ?? defaultNonRefundableSnapshot(now);
}
