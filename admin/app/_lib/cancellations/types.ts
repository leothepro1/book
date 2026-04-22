/**
 * Cancellation engine — shared types and Zod schemas.
 *
 * All runtime-validated JSON shapes (CancellationPolicy.tiers,
 * CancellationRequest.policySnapshot, CancellationEvent.metadata) live here.
 * Every code path that reads or writes these fields goes through these
 * schemas — never `as any`, never raw JSON trust.
 *
 * See admin/docs/cancellation-engine.md for the architectural spec.
 */

import { z } from "zod";
import type {
  CancellationStatus,
  CancellationInitiator,
  CancellationDeclineReason,
  CancellationRefundStatus,
  CancellationEventType,
} from "@prisma/client";

// Re-export Prisma enums so callers don't need to import from two places.
export type {
  CancellationStatus,
  CancellationInitiator,
  CancellationDeclineReason,
  CancellationRefundStatus,
  CancellationEventType,
};

// ─── Tier definition ───────────────────────────────────────────────
// A tier is one step of a cancellation-fee schedule:
//   "If the guest cancels at least `hoursBeforeCheckIn` before check-in,
//    charge `feePercent`% of the booking total."
//
// Tiers are applied most-advance-first. See policy.ts#applyTier.

export const CancellationTierSchema = z
  .object({
    /** Hours of lead time before check-in at which this tier becomes the applicable one. */
    hoursBeforeCheckIn: z.number().int().nonnegative().max(8760 /* one year */),
    /** Fee as an integer percent (0–100) of the booking total. */
    feePercent: z.number().int().min(0).max(100),
  })
  .strict();

export type CancellationTier = z.infer<typeof CancellationTierSchema>;

/** Full tier schedule. Must be non-empty; may be in any order. */
export const CancellationTiersSchema = z
  .array(CancellationTierSchema)
  .min(1, "policy must have at least one tier")
  .max(10, "policies with more than 10 tiers are rejected as misconfiguration")
  .superRefine((tiers, ctx) => {
    const seen = new Set<number>();
    for (const t of tiers) {
      if (seen.has(t.hoursBeforeCheckIn)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate tier threshold: hoursBeforeCheckIn=${t.hoursBeforeCheckIn}`,
        });
      }
      seen.add(t.hoursBeforeCheckIn);
    }
  });

export type CancellationTiers = z.infer<typeof CancellationTiersSchema>;

// ─── Policy snapshot (stored on Booking + CancellationRequest) ────
// Frozen at booking time. Rule changes never apply retroactively.

export const CancellationPolicySnapshotSchema = z
  .object({
    /** ID of the source CancellationPolicy row. Informational; may be stale/deleted. */
    policyId: z.string().min(1),
    /** Display name at snapshot time — shown in guest/admin UI. */
    policyName: z.string().min(1).max(200),
    tiers: CancellationTiersSchema,
    requireApproval: z.boolean(),
    autoExpireHours: z.number().int().positive().max(720 /* 30 days */),
    /** ISO timestamp when the snapshot was taken. Included for forensic debugging. */
    snapshottedAt: z.string().datetime(),
  })
  .strict();

export type CancellationPolicySnapshot = z.infer<
  typeof CancellationPolicySnapshotSchema
>;

// ─── Request-level snapshot (stored on CancellationRequest) ───────
// Extends the policy snapshot with the tier that was actually applied
// and the derived hours-until-check-in at request time.

export const RequestPolicySnapshotSchema = CancellationPolicySnapshotSchema.extend({
  appliedTier: CancellationTierSchema,
  hoursBeforeCheckInAtRequest: z.number().int(),
}).strict();

export type RequestPolicySnapshot = z.infer<typeof RequestPolicySnapshotSchema>;

// ─── Fee calculation result ───────────────────────────────────────

export const FeeResultSchema = z
  .object({
    feeAmountOre: z.number().int().nonnegative(),
    refundAmountOre: z.number().int().nonnegative(),
    appliedTier: CancellationTierSchema,
    hoursBeforeCheckInAtRequest: z.number().int(),
  })
  .strict();

export type FeeResult = z.infer<typeof FeeResultSchema>;

// ─── Event metadata (loose — each event type may attach its own) ──
// We validate that it's at least plain JSON; per-type shape is enforced
// where each event is emitted.

export const CancellationEventMetadataSchema = z
  .record(z.string(), z.unknown())
  .optional();

export type CancellationEventMetadata = z.infer<
  typeof CancellationEventMetadataSchema
>;

// ─── Note-length constants (Shopify parity) ───────────────────────
export const GUEST_NOTE_MAX_LENGTH = 300;
export const DECLINE_NOTE_MAX_LENGTH = 500;

// ─── Saga constants ───────────────────────────────────────────────
/** Beyond this, the saga escalates (PMS-stuck → DECLINE, refund-stuck → admin alert). */
export const MAX_SAGA_ATTEMPTS = 5;

/** Idempotency lock TTL. Any saga that can't complete in this window releases the lock. */
export const CANCELLATION_LOCK_TTL_MS = 120_000;
