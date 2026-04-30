/**
 * pms_sync_failed v0.1.0
 * ──────────────────────
 *
 * Emitted when a PMS sync attempt fails — the reliability engine's
 * circuit-breaker increments `TenantIntegration.consecutiveFailures`.
 * Phase 5 uses this for MTBF, error-rate-by-provider, and time-to-
 * recovery aggregations.
 *
 * Triggered by: `recordFailure` in
 * `app/_lib/integrations/sync/circuit-breaker.ts`. Standalone emit,
 * fire-and-forget — analytics failures must never block circuit-breaker
 * state updates.
 *
 * Idempotency note (per Q6):
 *   The natural key seems to be `pms_sync_failed:${tenantId}:${provider}`
 *   but that's NOT unique per failure occurrence — the same provider can
 *   fail repeatedly, and Phase 5 needs OCCURRENCE counts (not unique
 *   sessions) for MTBF / failure-rate aggregations. We append the
 *   `consecutive_failures` counter so each increment is a distinct
 *   analytics event.
 *   Comment block lives at the emit site in circuit-breaker.ts.
 *
 * Operational ↔ analytics field mapping:
 *   pms_provider          ← derivePMSAdapterType (mews / fake / manual / other)
 *   consecutive_failures  ← TenantIntegration.consecutiveFailures AFTER increment
 *   error_message         ← truncated to 500 chars
 *   failed_at             ← TenantIntegration.lastErrorAt (the timestamp
 *                            written by the same update)
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

export const PmsSyncFailedPayloadSchema = z.object({
  pms_provider: z.enum(["mews", "fake", "manual", "other"]),
  consecutive_failures: z.number().int().positive(),
  error_message: z.string(),
  failed_at: z.union([z.string(), z.date()]),
});

export const PmsSyncFailedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("pms_sync_failed"),
    schema_version: z.literal("0.1.0"),
    payload: PmsSyncFailedPayloadSchema,
  }),
);

export type PmsSyncFailedPayload = z.infer<typeof PmsSyncFailedPayloadSchema>;
export type PmsSyncFailedEvent = z.infer<typeof PmsSyncFailedSchema>;
