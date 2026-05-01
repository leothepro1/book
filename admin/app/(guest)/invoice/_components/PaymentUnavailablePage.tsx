/**
 * Phase F — `/invoice/[token]` payment-unavailable fork.
 *
 * Single component for the three distinct Phase E failure kinds
 * that share the same buyer-facing UX:
 *
 *   - `stripe_unavailable` — Stripe API rejected `paymentIntents.
 *     create` or its persist racy CAS (v1.3 §7.3 steps 4 + 5).
 *     Buyer should retry in a moment.
 *   - `tenant_not_ready` — `assertTenantStripeReady` failed
 *     (charges disabled, embedded mode missing, account frozen
 *     per §13.4). Merchant configuration issue; buyer should
 *     contact the hotel.
 *   - `draft_not_payable` — defensive backstop. Should be
 *     unreachable because `classifyTokenState` filters status,
 *     expiry, and active-session shape upstream. Logged at
 *     `error` level by the route when it fires.
 *
 * Rationale for merging all three behind one component: the
 * buyer-facing copy is identical ("try again or contact the
 * hotel"); the discrimination matters only for operations and
 * Sentry breadcrumbs. The `reason` prop is accepted for log-side
 * tagging at the call site but **never rendered** — leaking
 * "stripe_unavailable" vs "tenant_not_ready" to a buyer would be
 * an implementation-detail leak and the buyer can't act on the
 * difference anyway.
 */

import {
  ContactBlock,
  buildPageStyles,
  minimalPageStyles,
  type TenantForStatusPage,
} from "./_shared";

export type PaymentUnavailableReason =
  | "stripe_unavailable"
  | "tenant_not_ready"
  | "draft_not_payable";

export async function PaymentUnavailablePage({
  tenant,
}: {
  tenant: TenantForStatusPage;
  /** Log-only — accepted but not rendered. */
  reason: PaymentUnavailableReason;
}) {
  const pageStyles = await buildPageStyles(tenant.id);

  return (
    <div style={{ ...minimalPageStyles.outer, ...pageStyles }}>
      <div style={minimalPageStyles.card}>
        <h1
          style={minimalPageStyles.title}
          data-i18n="invoice.payment_unavailable.title"
        >
          Det går inte att betala just nu
        </h1>
        <p
          style={minimalPageStyles.body}
          data-i18n="invoice.payment_unavailable.body"
        >
          Vi kan inte slutföra betalningen just nu. Försök igen om några
          minuter, eller kontakta hotellet om problemet kvarstår.
        </p>
        <ContactBlock tenant={tenant} />
      </div>
    </div>
  );
}
