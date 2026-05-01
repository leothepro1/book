/**
 * Stripe webhook bridge — draft-order PaymentIntent succeeded
 * (Phase H: session-aware routing).
 *
 * Spec: docs/architecture/draft-orders-invoice-flow.md v1.3 §5
 * invariants 7/9/12/16/17, §6.4 (UNLINKED-paid race window).
 *
 * Branches from `route.ts:handlePaymentIntentSucceeded` when
 * `pi.metadata.kind === "draft_order_invoice"`.
 *
 * Lookup is session-first: `findUnique` by
 * `DraftCheckoutSession.stripePaymentIntentId` (a `@unique` column —
 * see prisma/schema.prisma:5714). Metadata-cross-check guards against
 * a misrouted webhook tagged with the wrong tenant or session id.
 *
 * Routing on `session.status`:
 *
 *   - ACTIVE | EXPIRED → happy/late path: tx1 transition session +
 *     draft to PAID, then post-tx convertDraftToOrder + side-effects
 *     + platform webhook emit. EXPIRED is allowed per §5 invariant 12
 *     (money-moved-trumps-expiry); the validator in
 *     session-transitions.ts encodes it.
 *
 *   - PAID → idempotent replay. If `completedOrderId` is set, silent
 *     no-op. If null (partial-failure recovery state — tx1 succeeded
 *     but convert failed), log error + urgent operator alert. Manual
 *     recovery applies; webhook does NOT auto-retry convert.
 *
 *   - UNLINKED | CANCELLED → auto-refund + operator alert.
 *     `runAutoRefundForPaidNonActiveSession` issues a Connect-context
 *     refund with a stable Stripe idempotency key. No Order is
 *     created, no draft transitions, no session row update — refund
 *     audit trail lives in StripeWebhookEvent + structured log +
 *     Stripe Refund object (per spec §6.4).
 *
 * Tenant lookup is a separate `prisma.tenant.findUnique` after the
 * session lookup. The Prisma schema deliberately uses loose FKs on
 * `DraftCheckoutSession.tenantId` and `DraftOrder.tenantId` (no
 * `@relation` to Tenant) — the same pattern Phase D's
 * `unlink-side-effects.ts:114-117` uses.
 */

import type Stripe from "stripe";
import type { DraftCheckoutSessionStatus } from "@prisma/client";

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { sendOperatorAlert } from "@/app/_lib/integrations/reliability/alert-operator";
import { canSessionTransition } from "@/app/_lib/draft-orders/session-transitions";
import { runAutoRefundForPaidNonActiveSession } from "@/app/_lib/draft-orders/auto-refund-session";

interface SessionLookup {
  id: string;
  tenantId: string;
  status: DraftCheckoutSessionStatus;
  draftOrder: {
    id: string;
    status: string;
    completedOrderId: string | null;
    displayNumber: string;
  };
}

interface TenantLookup {
  id: string;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
}

export async function handleDraftOrderPaymentIntentSucceeded(
  pi: Stripe.PaymentIntent,
): Promise<void> {
  const sessionId = pi.metadata?.draftCheckoutSessionId;
  const tenantId = pi.metadata?.tenantId;
  if (!sessionId || !tenantId) {
    log("error", "stripe.draft_webhook.missing_metadata", {
      paymentIntentId: pi.id,
      hasSessionId: Boolean(sessionId),
      hasTenantId: Boolean(tenantId),
    });
    return;
  }

  // Session-first lookup. `stripePaymentIntentId` is @unique on
  // DraftCheckoutSession (Phase B).
  const session = await prisma.draftCheckoutSession.findUnique({
    where: { stripePaymentIntentId: pi.id },
    select: {
      id: true,
      tenantId: true,
      status: true,
      draftOrder: {
        select: {
          id: true,
          status: true,
          completedOrderId: true,
          displayNumber: true,
        },
      },
    },
  });

  if (!session) {
    log("error", "stripe.draft_webhook.session_not_found", {
      tenantId,
      sessionId,
      paymentIntentId: pi.id,
    });
    await sendOperatorAlert({
      subject: "draft_invoice webhook session not found",
      body: [
        `Stripe webhook payment_intent.succeeded arrived for a draft-order PI`,
        `but no DraftCheckoutSession row matches the PI id.`,
        ``,
        `tenantId: ${tenantId}`,
        `sessionId (from metadata): ${sessionId}`,
        `paymentIntentId: ${pi.id}`,
        ``,
        `Investigate: PI metadata drift, dropped Phase E persist, or Stripe redelivery against deleted row.`,
      ].join("\n"),
      tenantId,
      severity: "urgent",
    });
    return;
  }

  // Defensive cross-check: PI metadata must agree with the row we
  // looked up. A mismatch means either Stripe redelivered with stale
  // metadata, or our PI ID is somehow shared across tenants — both
  // pathological. Refuse to operate.
  if (session.id !== sessionId || session.tenantId !== tenantId) {
    log("error", "stripe.draft_webhook.metadata_session_mismatch", {
      paymentIntentId: pi.id,
      metadataSessionId: sessionId,
      foundSessionId: session.id,
      metadataTenantId: tenantId,
      foundTenantId: session.tenantId,
    });
    await sendOperatorAlert({
      subject: "draft_invoice webhook metadata mismatch",
      body: [
        `Stripe webhook payment_intent.succeeded metadata disagrees with`,
        `the DraftCheckoutSession row resolved by PI id.`,
        ``,
        `paymentIntentId: ${pi.id}`,
        `metadata.draftCheckoutSessionId: ${sessionId}`,
        `metadata.tenantId: ${tenantId}`,
        `row.id: ${session.id}`,
        `row.tenantId: ${session.tenantId}`,
        ``,
        `No state was changed. Investigate immediately.`,
      ].join("\n"),
      tenantId,
      severity: "urgent",
    });
    return;
  }

  // Tenant fields are needed for the auto-refund Connect-context
  // computation. Loose-FK pattern (no @relation) so this is a
  // separate query — matches unlink-side-effects.ts:114-117.
  const tenant: TenantLookup | null = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: {
      id: true,
      stripeAccountId: true,
      stripeOnboardingComplete: true,
    },
  });
  if (!tenant) {
    // Effectively impossible — we just resolved a session with this
    // tenantId. Log + alert + bail rather than crash on null deref.
    log("error", "stripe.draft_webhook.tenant_not_found", {
      tenantId: session.tenantId,
      sessionId: session.id,
      paymentIntentId: pi.id,
    });
    return;
  }

  switch (session.status) {
    case "ACTIVE":
    case "EXPIRED":
      await runHappyOrLatePath(pi, session);
      return;

    case "PAID":
      // Idempotent replay path. Stripe redelivered an event we already
      // processed, OR a parallel worker beat us on tx1.
      if (session.draftOrder.completedOrderId === null) {
        // Partial-failure recovery state: tx1 ran and flipped the
        // session to PAID, but convertDraftToOrder failed before
        // writing the Order. Surface to operators; manual recovery
        // applies (see plan "partial-failure recovery model" note).
        log(
          "error",
          "stripe.draft_webhook.paid_no_order_recovery_needed",
          {
            tenantId: session.tenantId,
            sessionId: session.id,
            draftOrderId: session.draftOrder.id,
            paymentIntentId: pi.id,
          },
        );
        await sendOperatorAlert({
          subject: "draft_invoice paid without converted Order — recovery needed",
          body: [
            `A DraftCheckoutSession row is in PAID status but its parent`,
            `DraftOrder has no completedOrderId. Tx1 succeeded, convert`,
            `failed, and Stripe redelivered. The webhook will NOT auto-retry`,
            `the conversion — manual admin recovery required.`,
            ``,
            `tenantId: ${session.tenantId}`,
            `sessionId: ${session.id}`,
            `draftOrderId: ${session.draftOrder.id}`,
            `paymentIntentId: ${pi.id}`,
            ``,
            `Action: trigger convertDraftToOrder with actorSource: "admin_manual_recovery".`,
          ].join("\n"),
          tenantId: session.tenantId,
          severity: "urgent",
        });
      } else {
        log("info", "stripe.draft_webhook.idempotent_replay_paid", {
          tenantId: session.tenantId,
          sessionId: session.id,
          completedOrderId: session.draftOrder.completedOrderId,
          paymentIntentId: pi.id,
        });
      }
      return;

    case "UNLINKED":
      await runAutoRefundForPaidNonActiveSession({
        tenant,
        sessionId: session.id,
        paymentIntentId: pi.id,
        amountCents: pi.amount,
        reasonCode: "unlinked_session_paid",
      });
      return;

    case "CANCELLED":
      await runAutoRefundForPaidNonActiveSession({
        tenant,
        sessionId: session.id,
        paymentIntentId: pi.id,
        amountCents: pi.amount,
        reasonCode: "cancelled_session_paid",
      });
      return;

    default: {
      // Exhaustive switch guard — `session.status` is a Prisma enum.
      // Any new variant must extend this switch.
      const _exhaustive: never = session.status;
      log("error", "stripe.draft_webhook.unknown_session_status", {
        tenantId: session.tenantId,
        sessionId: session.id,
        paymentIntentId: pi.id,
        status: String(_exhaustive),
      });
      return;
    }
  }
}

/**
 * Tx1 + convert + side-effects + platform webhook emit. Mirrors the
 * pre-Phase-H flow shape but routes through `DraftCheckoutSession`
 * first so the session row's status is the authoritative gate.
 *
 * Tx1 atomically transitions:
 *   - DraftCheckoutSession: ACTIVE|EXPIRED → PAID (CAS)
 *   - DraftOrder:           INVOICED|OVERDUE → PAID (CAS) + STATE_CHANGED event
 *
 * The `transitioned` flag is derived from the SESSION updateMany
 * count, NOT the draft count — a draft already in PAID with
 * `completedOrderId === null` (partial-failure recovery state)
 * should still proceed to convert if the session row was just
 * promoted.
 *
 * Post-tx ordering: convert → side-effects (try/catch) → emit
 * platform webhook (try/catch). convert re-throws on failure;
 * side-effects + emit swallow.
 */
async function runHappyOrLatePath(
  pi: Stripe.PaymentIntent,
  session: SessionLookup,
): Promise<void> {
  // L3 short-circuit: draft already converted on a previous delivery.
  if (session.draftOrder.completedOrderId !== null) {
    log("info", "stripe.draft_webhook.already_converted", {
      tenantId: session.tenantId,
      sessionId: session.id,
      draftOrderId: session.draftOrder.id,
      completedOrderId: session.draftOrder.completedOrderId,
      paymentIntentId: pi.id,
    });
    return;
  }

  // Defensive transition validator. The outer switch should have
  // already screened out non-(ACTIVE|EXPIRED), so reaching this
  // helper with a status that can't transition to PAID is a bug.
  if (!canSessionTransition(session.status, "PAID")) {
    throw new Error(
      `Phase H invariant: session ${session.id} status ${session.status} → PAID rejected by validator`,
    );
  }

  const transitioned = await prisma.$transaction(async (tx) => {
    const sessionRes = await tx.draftCheckoutSession.updateMany({
      where: {
        id: session.id,
        status: { in: ["ACTIVE", "EXPIRED"] },
      },
      data: {
        status: "PAID",
        paidAt: new Date(),
        version: { increment: 1 },
      },
    });

    if (sessionRes.count === 0) {
      // Race lost — another worker (or earlier delivery) already
      // promoted the session. Skip everything; the winner runs
      // convert + side-effects exactly once.
      return false;
    }

    const draftRes = await tx.draftOrder.updateMany({
      where: {
        id: session.draftOrder.id,
        tenantId: session.tenantId,
        status: { in: ["INVOICED", "OVERDUE"] },
      },
      data: { status: "PAID", version: { increment: 1 } },
    });

    if (draftRes.count > 0) {
      const { createDraftOrderEventInTx } = await import(
        "@/app/_lib/draft-orders"
      );
      await createDraftOrderEventInTx(tx, {
        tenantId: session.tenantId,
        draftOrderId: session.draftOrder.id,
        type: "STATE_CHANGED",
        metadata: {
          from: session.draftOrder.status,
          to: "PAID",
          stripePaymentIntentId: pi.id,
          stripeCheckoutSessionId: session.id,
          amount: pi.amount,
          currency: pi.currency,
        },
        actorSource: "webhook",
      });
    }

    return true;
  });

  if (!transitioned) {
    log("info", "stripe.draft_webhook.session_race_lost", {
      tenantId: session.tenantId,
      sessionId: session.id,
      paymentIntentId: pi.id,
    });
    return;
  }

  // convertDraftToOrder. Re-throws on failure → route.ts's outer
  // try/catch records processedAt=null (Stripe will redeliver).
  // Recovery details captured by the redelivery's PAID-no-order
  // alert path above.
  const { convertDraftToOrder } = await import("@/app/_lib/draft-orders");
  const result = await convertDraftToOrder({
    tenantId: session.tenantId,
    draftOrderId: session.draftOrder.id,
    stripePaymentIntentId: pi.id,
    actorSource: "webhook",
  });

  log("info", "stripe.draft_webhook.converted", {
    tenantId: session.tenantId,
    sessionId: session.id,
    draftOrderId: session.draftOrder.id,
    orderId: result.order.id,
    alreadyConverted: result.alreadyConverted,
    paymentIntentId: pi.id,
  });

  // Post-commit side-effects. Fire-and-forget — convert has
  // already committed; another retry would be a wasted no-op.
  try {
    const { processOrderPaidSideEffects } = await import(
      "@/app/_lib/orders/process-paid-side-effects"
    );
    await processOrderPaidSideEffects(result.order.id, pi.id);
  } catch (err) {
    log("error", "stripe.draft_webhook.side_effects_failed", {
      tenantId: session.tenantId,
      sessionId: session.id,
      draftOrderId: session.draftOrder.id,
      orderId: result.order.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Platform webhook emit. Same fire-and-forget contract.
  try {
    const { emitPlatformEvent } = await import("@/app/_lib/apps/webhooks");
    await emitPlatformEvent({
      type: "draft_order.paid",
      tenantId: session.tenantId,
      payload: {
        draftOrderId: session.draftOrder.id,
        tenantId: session.tenantId,
        displayNumber: session.draftOrder.displayNumber,
        stripePaymentIntentId: pi.id,
        amount: pi.amount,
        currency: pi.currency.toUpperCase(),
        paidAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    log("error", "stripe.draft_webhook.platform_emit_failed", {
      tenantId: session.tenantId,
      draftOrderId: session.draftOrder.id,
      eventType: "draft_order.paid",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
