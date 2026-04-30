/**
 * guest_otp_sent v0.1.0
 * ─────────────────────
 *
 * Emitted when a magic-link OTP is sent (or attempted to be sent) to a
 * guest email. Used by Phase 5 to compute send rate, delivery success,
 * and authentication-funnel conversion (otp_sent → guest_authenticated
 * pair).
 *
 * Triggered by: `requestMagicLink` in `app/_lib/magic-link/request.ts`,
 * after a `MagicLinkToken` row is created. Standalone emit. Fires only
 * when the token is actually persisted — rate-limited / invalid-email
 * paths short-circuit before persist and don't emit.
 *
 * Privacy / security: the actual token is NEVER included in the event.
 * `token_id` is a SHA-256 prefix of the token string so we can correlate
 * the sent event with the matching `guest_authenticated` event without
 * leaking the secret.
 *
 * Idempotency key: `guest_otp_sent:${token_id}`. One token per send.
 *
 * Operational ↔ analytics field mapping:
 *   email_hash      ← email_<sha256-16hex>(tenantId:email)
 *   token_id        ← sha256(token).slice(0, 16) — correlation key only,
 *                     not a credential
 *   expires_at      ← MagicLinkToken.expiresAt
 *   sent_at         ← now() at emit time (Stripe-style — token row's
 *                     createdAt would also work; both are seconds apart)
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

export const GuestOtpSentPayloadSchema = z.object({
  email_hash: z.string().min(1),
  token_id: z.string().min(1),
  expires_at: z.coerce.date(),
  sent_at: z.coerce.date(),
});

export const GuestOtpSentSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("guest_otp_sent"),
    schema_version: z.literal("0.1.0"),
    payload: GuestOtpSentPayloadSchema,
  }),
);

export type GuestOtpSentPayload = z.infer<typeof GuestOtpSentPayloadSchema>;
export type GuestOtpSentEvent = z.infer<typeof GuestOtpSentSchema>;
