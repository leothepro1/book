/**
 * guest_account_created v0.1.0
 * ────────────────────────────
 *
 * Emitted when a new GuestAccount row is inserted into the operational
 * database. The trigger today is `upsertGuestAccount` (called from
 * checkout / order linking) when the row was actually created (not a
 * second-call upsert no-op).
 *
 * Triggered by: `emitIfNewAccount` in `app/_lib/guest-auth/account.ts`
 * (called from `upsertGuestAccount`). Standalone emit, fire-and-forget.
 *
 * Idempotency key: `guest_account_created:${account.id}`. The account row
 * is created exactly once; subsequent upserts skip via the unique
 * (tenantId, email) constraint and the `emitIfNewAccount` guard.
 *
 * Operational ↔ analytics field mapping:
 *   guest_id          ← GuestAccount.id (CUID, no prefix)
 *   email_hash        ← email_<sha256-16hex>(tenantId:email) for cross-event correlation
 *   source            ← creation source: "checkout" / "order" / "magic_link" / "import" / "other"
 *   created_at        ← GuestAccount.createdAt
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

export const GuestAccountCreatedPayloadSchema = z.object({
  guest_id: z.string().min(1),
  email_hash: z.string().min(1),
  source: z.enum(["checkout", "order", "magic_link", "import", "other"]),
  created_at: z.union([z.string(), z.date()]),
});

export const GuestAccountCreatedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("guest_account_created"),
    schema_version: z.literal("0.1.0"),
    payload: GuestAccountCreatedPayloadSchema,
  }),
);

export type GuestAccountCreatedPayload = z.infer<typeof GuestAccountCreatedPayloadSchema>;
export type GuestAccountCreatedEvent = z.infer<typeof GuestAccountCreatedSchema>;
