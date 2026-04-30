/**
 * guest_account_linked v0.1.0
 * ───────────────────────────
 *
 * Emitted when an existing operational resource (Order, future Booking)
 * gets its `guestAccountId` populated by linking to a GuestAccount row.
 * Today the only emit site is `upsertGuestAccountFromOrder` —
 * called from the Stripe webhook to wire a freshly-paid Order to the
 * guest's account row.
 *
 * Phase 5 use cases:
 *   - Conversion funnel: how many email-only bookings get linked to
 *     a real account post-hoc?
 *   - Account-level revenue rollup: aggregate paid orders per
 *     GuestAccount (which requires the account_linked event so we
 *     know which historical orders belong to which account).
 *
 * Triggered by: `upsertGuestAccountFromOrder` in
 * `app/_lib/guest-auth/account.ts`. Standalone emit, fire-and-forget.
 * The function is itself idempotent (upsert + dedup on ORDER_PLACED
 * event), and the analytics emit is fire-and-forget so re-runs don't
 * stack analytics.
 *
 * Idempotency key:
 *   `guest_account_linked:${guestAccountId}:${linkedResourceId}`.
 * One link per (account, resource); multiple resources for the same
 * account are distinct events.
 *
 * Operational ↔ analytics field mapping:
 *   guest_id              ← GuestAccount.id (CUID)
 *   email_hash            ← email_<sha256-16hex>(tenantId:email)
 *   linked_resource_type  ← "order" today (future: "booking" for direct
 *                           account-claims on standalone bookings)
 *   linked_resource_id    ← Order.id today
 *   link_method           ← "auto_via_email_match" today (future:
 *                           "magic_link_claim" / "manual_admin")
 *   linked_at             ← now() at emit time
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

export const GuestAccountLinkedPayloadSchema = z.object({
  guest_id: z.string().min(1),
  email_hash: z.string().min(1),
  linked_resource_type: z.enum(["order", "booking"]),
  linked_resource_id: z.string().min(1),
  link_method: z.enum(["auto_via_email_match", "magic_link_claim", "manual_admin"]),
  linked_at: z.union([z.string(), z.date()]),
});

export const GuestAccountLinkedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("guest_account_linked"),
    schema_version: z.literal("0.1.0"),
    payload: GuestAccountLinkedPayloadSchema,
  }),
);

export type GuestAccountLinkedPayload = z.infer<typeof GuestAccountLinkedPayloadSchema>;
export type GuestAccountLinkedEvent = z.infer<typeof GuestAccountLinkedSchema>;
