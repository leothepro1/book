/**
 * Operational ↔ analytics translation helpers.
 *
 * The emitter is the translation boundary between operational types
 * (Booking, Order, PaymentMethod, …) and analytics-domain types
 * (`source_channel`, `provider`, `payment_instrument`, branded actor
 * union, hashed guest_id, ISO date). These helpers live here so each
 * mapping has one canonical implementation that's unit-tested across
 * every operational enum value and every NULL fallback path.
 *
 * Exported helpers:
 *   deriveActor(order)           — guest|merchant|system|anonymous
 *   deriveGuestId(order)         — GuestAccount.id or `email_<sha256-16hex>`
 *   deriveSourceChannel(booking) — direct|pms_import|third_party_ota|unknown
 *   deriveProvider(order)        — stripe|swedbankpay|manual|other
 *   deriveInstrument(order)      — card|bank_transfer|wallet|other
 *   formatAnalyticsDate(date)    — YYYY-MM-DD (UTC)
 */

import { createHash } from "node:crypto";

import type { Booking, Order, PaymentMethod } from "@prisma/client";

// ── Types (mirror analytics schema enums) ────────────────────────────────

export type Actor =
  | { actor_type: "guest"; actor_id: string }
  | { actor_type: "merchant"; actor_id: string }
  | { actor_type: "system"; actor_id: null }
  | { actor_type: "anonymous"; actor_id: null };

export type SourceChannel = "direct" | "pms_import" | "third_party_ota" | "unknown";
export type Provider = "stripe" | "swedbankpay" | "manual" | "other";
export type Instrument = "card" | "bank_transfer" | "wallet" | "other";

// ── Actor ────────────────────────────────────────────────────────────────

/**
 * Derives the actor for events triggered by an Order. Phase 1B's emit
 * call sites (booking_completed, payment_succeeded) both run after a
 * paid order — the actor is the guest who placed the order, or
 * "anonymous" when the order has no GuestAccount link (e.g. magic-link
 * checkout where the guest never completed account creation).
 */
export function deriveActor(order: Pick<Order, "guestAccountId">): Actor {
  if (order.guestAccountId) {
    return { actor_type: "guest", actor_id: order.guestAccountId };
  }
  return { actor_type: "anonymous", actor_id: null };
}

// ── Guest ID ─────────────────────────────────────────────────────────────

/**
 * Derives the analytics-domain guest_id (Q3 resolution).
 *
 *   - GuestAccount linked → return `GuestAccount.id` directly (CUID, no prefix).
 *   - Email-only           → return `email_<first 16 hex chars of SHA-256(
 *                              `${tenantId}:${email.toLowerCase().trim()}`
 *                            )>`. The `email_` prefix marks it as a pseudonym
 *                            during debugging; lowercase + trim canonicalize
 *                            so trailing-space / case-variant emails produce
 *                            the same id.
 *
 * Tenant id is part of the hash input so the same email across tenants
 * produces different pseudonyms — the analytics schema is per-tenant,
 * and we don't want a guest's identity to be linkable across tenants
 * via their email.
 */
export function deriveGuestId(
  order: Pick<Order, "tenantId" | "guestAccountId" | "guestEmail">,
): string {
  if (order.guestAccountId) return order.guestAccountId;
  const normalizedEmail = order.guestEmail.trim().toLowerCase();
  const hash = createHash("sha256")
    .update(`${order.tenantId}:${normalizedEmail}`)
    .digest("hex");
  return `email_${hash.slice(0, 16)}`;
}

// ── Source Channel ───────────────────────────────────────────────────────

/**
 * Derives the booking's source_channel (Q4 resolution).
 *
 *   - direct          — booking originated AT Bedfront (came in through
 *                       checkout / Order). Discriminator: `orderId !== null`.
 *   - pms_import      — booking originated AT the PMS, ingested via the
 *                       reliability engine. Discriminator: `orderId === null
 *                       && externalSource !== null`.
 *   - third_party_ota — reserved for future booking.com / Expedia ingestion.
 *                       Not currently produced; documented for forward
 *                       compatibility.
 *   - unknown         — defensive fallback. Catches bookings with neither
 *                       orderId nor externalSource (shouldn't happen in
 *                       production, but the emitter must never throw on a
 *                       new shape mid-transaction).
 *
 * Phase 1B: only direct bookings emit `booking_completed` (PMS-imported
 * bookings get their own event in Phase 2 — see
 * docs/analytics/event-catalog.md). At today's only call site this
 * helper always returns "direct"; the full mapping is here so Phase 2
 * doesn't have to refactor.
 *
 * Note: `fake` adapter's bookings (test/dev) flow through the same
 * orderId discriminator and map to "direct" — filtering test noise is
 * a Phase 5 aggregation concern (likely an `is_test` flag).
 */
export function deriveSourceChannel(
  booking: Pick<Booking, "orderId" | "externalSource">,
): SourceChannel {
  if (booking.orderId) return "direct";
  if (booking.externalSource) return "pms_import";
  return "unknown";
}

// ── Provider ─────────────────────────────────────────────────────────────

/**
 * Derives the payment provider from Order.paymentMethod.
 *
 * Bedfront's operational PaymentMethod enum has 7 values mapping to
 * 4 analytics-domain providers:
 *   STRIPE_CHECKOUT, STRIPE_ELEMENTS,
 *   BEDFRONT_PAYMENTS_CHECKOUT, BEDFRONT_PAYMENTS_ELEMENTS → "stripe"
 *   SWEDBANK_PAY                                             → "swedbankpay"
 *   NETS                                                     → "other"  (see below)
 *   INVOICE                                                  → "manual"
 */
export function deriveProvider(order: Pick<Order, "paymentMethod">): Provider {
  const method: PaymentMethod = order.paymentMethod;
  switch (method) {
    case "STRIPE_CHECKOUT":
    case "STRIPE_ELEMENTS":
    case "BEDFRONT_PAYMENTS_CHECKOUT":
    case "BEDFRONT_PAYMENTS_ELEMENTS":
      return "stripe";
    case "SWEDBANK_PAY":
      return "swedbankpay";
    case "NETS":
      // NETS → "other" intentionally for v0.1.0.
      // NETS is a KNOWN provider, not an unknown one — but Bedfront does
      // not yet have NETS active in production. When NETS is enabled
      // (v0.2.0 schema), bump payment_succeeded to v0.2.0 with "nets"
      // added as an additive enum value, and update this mapping. DO
      // NOT use "other" as a permanent home for NETS — that loses
      // dimensional clarity in Phase 5 aggregations (e.g. "revenue per
      // provider").
      return "other";
    case "INVOICE":
      return "manual";
    default: {
      // Exhaustiveness check: TS errors here if a new PaymentMethod
      // enum value is added without updating this switch. Runtime
      // fallback to "other" so an unmapped value never throws inside
      // the emitter mid-transaction.
      const _exhaustive: never = method;
      void _exhaustive;
      return "other";
    }
  }
}

// ── Payment Instrument ───────────────────────────────────────────────────

/**
 * Derives the payment instrument from Order.paymentMethod.
 *
 * For v0.1.0 we use the operational PaymentMethod as a proxy. Card-
 * primary methods default to "card"; INVOICE is bank-transfer; NETS
 * (currently inactive) defaults to "other".
 *
 * Phase 2+ may opt to query Stripe's payment_method object for the
 * exact instrument (card vs apple_pay vs klarna etc.), at which point
 * this helper takes a richer input and dispatches accordingly.
 */
export function deriveInstrument(order: Pick<Order, "paymentMethod">): Instrument {
  const method: PaymentMethod = order.paymentMethod;
  switch (method) {
    case "STRIPE_CHECKOUT":
    case "STRIPE_ELEMENTS":
    case "BEDFRONT_PAYMENTS_CHECKOUT":
    case "BEDFRONT_PAYMENTS_ELEMENTS":
    case "SWEDBANK_PAY":
      return "card";
    case "INVOICE":
      return "bank_transfer";
    case "NETS":
      return "other";
    default: {
      const _exhaustive: never = method;
      void _exhaustive;
      return "other";
    }
  }
}

// ── Date Format ──────────────────────────────────────────────────────────

/**
 * Formats a Date as `YYYY-MM-DD` in UTC. Matches the
 * `BookingCompletedPayloadSchema.check_in_date` regex
 * (`/^\d{4}-\d{2}-\d{2}$/`).
 */
export function formatAnalyticsDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
