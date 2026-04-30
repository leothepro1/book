/**
 * guest_authenticated v0.1.0
 * ──────────────────────────
 *
 * Emitted when a guest successfully verifies their magic-link OTP.
 * Pairs with `guest_otp_sent` via the `token_id` correlation key —
 * Phase 5 computes the authentication-funnel conversion rate from
 * (sent → authenticated) pairs.
 *
 * Triggered by: `validateMagicLink` in `app/_lib/magic-link/validate.ts`,
 * after the token is atomically marked as used. Standalone emit.
 * Fires only on `valid: true` results — expired / used / not-found
 * branches don't emit (those would be a separate `guest_otp_failed`
 * event, deferred to v0.2.0).
 *
 * Idempotency key: `guest_authenticated:${token_id}`. A token is consumed
 * exactly once (the validate path is atomic) — if Stripe-style retries
 * caused this code to run twice, the second pass would short-circuit at
 * "used" and not reach this emit. Including token_id keeps the key
 * stable even in pathological double-call scenarios.
 *
 * Privacy / security: same as guest_otp_sent — `token_id` is a hash of
 * the token, never the token itself.
 *
 * Operational ↔ analytics field mapping:
 *   guest_id          ← GuestAccount.id if linked, else email-hash form
 *                       (deriveGuestId pattern). v0.1.0 emits `null` for
 *                       guest_id when no account exists yet (the
 *                       account.created event will fire separately if
 *                       creation happens later in the auth flow).
 *   email_hash        ← email_<sha256-16hex>(tenantId:email)
 *   token_id          ← sha256(token).slice(0, 16) — must match the
 *                       guest_otp_sent event's token_id for funnel
 *                       correlation
 *   authenticated_at  ← MagicLinkToken.usedAt (set atomically during validate)
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

export const GuestAuthenticatedPayloadSchema = z.object({
  guest_id: z.string().min(1).nullable(),
  email_hash: z.string().min(1),
  token_id: z.string().min(1),
  authenticated_at: z.coerce.date(),
});

export const GuestAuthenticatedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("guest_authenticated"),
    schema_version: z.literal("0.1.0"),
    payload: GuestAuthenticatedPayloadSchema,
  }),
);

export type GuestAuthenticatedPayload = z.infer<typeof GuestAuthenticatedPayloadSchema>;
export type GuestAuthenticatedEvent = z.infer<typeof GuestAuthenticatedSchema>;
