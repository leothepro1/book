/**
 * Phase H — auto-refund for a `payment_intent.succeeded` that arrives
 * against a `DraftCheckoutSession` whose status is no longer ACTIVE
 * or EXPIRED (i.e. UNLINKED or CANCELLED).
 *
 * Spec: docs/architecture/draft-orders-invoice-flow.md v1.3 §6.4
 * (UNLINKED-paid race window) and §5 invariant 9 (PI cancellation /
 * refund on unlink uses Connect-account context).
 *
 * Mirrors the post-tx side-effect shape of `unlink-side-effects.ts`:
 *
 *   - Pure side-effect module, no DB writes. The session row stays
 *     UNLINKED / CANCELLED — refund outcome is NOT stored on the
 *     row. Audit trail lives in `StripeWebhookEvent` (the dedup
 *     row), the structured log entry below, and the Stripe Refund
 *     object itself.
 *
 *   - Connect-context computation is inlined verbatim from
 *     `unlink-side-effects.ts:104-128`. A future chore commit can
 *     extract `computeConnectParams(tenant)` once a third call site
 *     is reached; doing so as part of Phase H is out of scope.
 *
 *   - Stripe idempotency key is stable across redeliveries:
 *     `draft_invoice:${sessionId}:auto_refund`. No attempt suffix —
 *     a Stripe webhook redelivery (network blip, our 500, replay)
 *     must hit the same key so Stripe returns the existing Refund
 *     rather than creating a second one.
 *
 *   - On Stripe error: log `error`, send urgent operator alert,
 *     RE-THROW. Route.ts's outer try/catch returns 200 anyway
 *     (matches existing handler error semantics); the throw
 *     surfaces in Sentry and unblocks manual recovery.
 */

import type { Tenant } from "@prisma/client";

import { log } from "@/app/_lib/logger";
import { sendOperatorAlert } from "@/app/_lib/integrations/reliability/alert-operator";

export type AutoRefundReasonCode =
  | "unlinked_session_paid"
  | "cancelled_session_paid";

export interface RunAutoRefundForPaidNonActiveSessionArgs {
  tenant: Pick<
    Tenant,
    "id" | "stripeAccountId" | "stripeOnboardingComplete"
  >;
  sessionId: string;
  paymentIntentId: string;
  amountCents: number;
  reasonCode: AutoRefundReasonCode;
}

export async function runAutoRefundForPaidNonActiveSession(
  args: RunAutoRefundForPaidNonActiveSessionArgs,
): Promise<void> {
  const { tenant, sessionId, paymentIntentId, amountCents, reasonCode } =
    args;

  // Connect-context: identical pattern to unlink-side-effects.ts:104-128.
  // dev/test bypass mirrors what Stripe Connect can't exercise locally.
  const devOrTest =
    process.env.NODE_ENV === "development" ||
    (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
  const connectParams =
    !devOrTest && tenant.stripeAccountId && tenant.stripeOnboardingComplete
      ? { stripeAccount: tenant.stripeAccountId }
      : undefined;

  const idempotencyKey = `draft_invoice:${sessionId}:auto_refund`;

  // Lazy-import the Stripe client so test environments without
  // STRIPE_SECRET_KEY can import this module freely (mirrors the
  // dynamic import in unlink-side-effects.ts).
  const { getStripe } = await import("@/app/_lib/stripe/client");
  const stripe = getStripe();

  let refundId: string;
  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        reason: "requested_by_customer",
      },
      {
        ...connectParams,
        idempotencyKey,
      },
    );
    refundId = refund.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", `draft_invoice.${reasonCode}_refund_failed`, {
      tenantId: tenant.id,
      sessionId,
      paymentIntentId,
      amountCents,
      reasonCode,
      error: message,
    });
    // Urgent alert: money is briefly out of buyer's account and our
    // refund attempt failed. Operator must verify Stripe state and
    // potentially refund manually.
    await sendOperatorAlert({
      subject: `auto-refund failed for ${reasonCode}`,
      body: [
        `Stripe refund attempt failed for a draft-checkout session.`,
        ``,
        `tenantId: ${tenant.id}`,
        `sessionId: ${sessionId}`,
        `paymentIntentId: ${paymentIntentId}`,
        `amountCents: ${amountCents}`,
        `reasonCode: ${reasonCode}`,
        `error: ${message}`,
        ``,
        `Verify in Stripe dashboard, refund manually if needed.`,
      ].join("\n"),
      tenantId: tenant.id,
      severity: "urgent",
    });
    throw err;
  }

  // TODO(buyer-email-phase): notify buyer of refund — spec §10
  // explicitly defers buyer-facing email work. When that phase
  // lands, fire a `DRAFT_PAYMENT_REFUNDED` (or similar) email
  // event from this site, including refundId + amountCents.

  log("warn", `draft_invoice.${reasonCode}_refunded`, {
    tenantId: tenant.id,
    sessionId,
    paymentIntentId,
    refundId,
    amountCents,
    reasonCode,
  });

  // Non-urgent operator alert: a session was paid that should not
  // have been (UNLINKED = merchant changed the draft mid-flight;
  // CANCELLED = compensation already ran). The refund succeeded but
  // operators should still review the upstream cause.
  await sendOperatorAlert({
    subject: `auto-refund issued for ${reasonCode}`,
    body: [
      `A draft-checkout session was paid against a non-ACTIVE state.`,
      `The PI was auto-refunded.`,
      ``,
      `tenantId: ${tenant.id}`,
      `sessionId: ${sessionId}`,
      `paymentIntentId: ${paymentIntentId}`,
      `refundId: ${refundId}`,
      `amountCents: ${amountCents}`,
      `reasonCode: ${reasonCode}`,
      ``,
      `Review the upstream cause (merchant unlink, compensation race) in admin logs.`,
    ].join("\n"),
    tenantId: tenant.id,
    severity: "warning",
  });
}
