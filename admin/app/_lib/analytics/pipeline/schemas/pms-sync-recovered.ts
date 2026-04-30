/**
 * pms_sync_recovered v0.1.0
 * ─────────────────────────
 *
 * Emitted when the circuit-breaker auto-closes — `consecutiveFailures`
 * was at or above the threshold and a successful sync resets it to 0.
 * Pairs with `pms_sync_failed` for time-to-recovery aggregations.
 *
 * Triggered by: `recordSuccess` in
 * `app/_lib/integrations/sync/circuit-breaker.ts`, only when the
 * `wasOverThreshold` flag is true. Standalone emit, fire-and-forget.
 *
 * NOT emitted on every successful sync — only on the
 * over-threshold → 0 transition. The "every successful sync" event
 * would be high-volume noise; aggregating it would defeat its purpose.
 *
 * Idempotency key:
 *   `pms_sync_recovered:${tenantId}:${provider}:${recovered_at.getTime()}`.
 * The recovery moment is unique per recovery; if the circuit re-opens
 * and re-closes, the next recovery has a new timestamp.
 *
 * Operational ↔ analytics field mapping:
 *   pms_provider          ← derivePMSAdapterType
 *   previous_failures     ← TenantIntegration.consecutiveFailures BEFORE
 *                            reset (>= FAILURE_THRESHOLD by definition)
 *   recovered_at          ← timestamp of the recordSuccess call
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

export const PmsSyncRecoveredPayloadSchema = z.object({
  pms_provider: z.enum(["mews", "fake", "manual", "other"]),
  previous_failures: z.number().int().positive(),
  recovered_at: z.union([z.string(), z.date()]),
});

export const PmsSyncRecoveredSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("pms_sync_recovered"),
    schema_version: z.literal("0.1.0"),
    payload: PmsSyncRecoveredPayloadSchema,
  }),
);

export type PmsSyncRecoveredPayload = z.infer<typeof PmsSyncRecoveredPayloadSchema>;
export type PmsSyncRecoveredEvent = z.infer<typeof PmsSyncRecoveredSchema>;
