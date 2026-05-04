/**
 * DraftOrder — `resendInvoice` service (FAS 7.4).
 *
 * Operator action that mints a fresh share-link token + Stripe
 * PaymentIntent for an already-INVOICED draft. Used when:
 *   - shareLinkExpiresAt has elapsed and the buyer still hasn't paid
 *   - the buyer claims they didn't receive the original mail
 *   - 7.5 cron has tipped the draft into OVERDUE
 *
 * This is a **sister service** to `sendInvoice` (FAS 6.5D). It does
 * NOT change DraftOrder.status — INVOICED → INVOICED is not a
 * transition. Instead it rotates the share-link artifacts and emits
 * an `INVOICE_RESENT` event so the timeline reflects the action.
 *
 * Idempotency: per Q6 (recon), no explicit key — UI prevents
 * double-click via disabled-button state, service relies on
 * optimistic locking (DraftOrder.version) inside the tx.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { emitPlatformEvent } from "@/app/_lib/apps/webhooks";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/app/_lib/errors/service-errors";
import { createDraftOrderEventInTx } from "./events";
import {
  assertTenantStripeReady,
  buildInvoiceUrl,
  clampShareLinkTtl,
  generateShareLinkToken,
  loadTenantForInvoice,
  mergeMetafields,
  tryCancelStripePaymentIntent,
} from "./lifecycle";
import {
  ResendInvoiceInputSchema,
  getDraftStripePaymentIntentId,
  type DraftOrder,
  type ResendInvoiceArgs,
  type ResendInvoiceInput,
  type ResendInvoiceResult,
} from "./types";

void ({} as ResendInvoiceInput);

// ── Helpers ──────────────────────────────────────────────────────

async function loadDraftForResend(
  tenantId: string,
  draftOrderId: string,
): Promise<DraftOrder> {
  const draft = (await prisma.draftOrder.findFirst({
    where: { id: draftOrderId, tenantId },
  })) as DraftOrder | null;
  if (!draft) {
    throw new NotFoundError("DraftOrder not found in tenant", {
      tenantId,
      draftOrderId,
    });
  }
  return draft;
}

function assertResendable(draft: DraftOrder): void {
  if (draft.status !== "INVOICED" && draft.status !== "OVERDUE") {
    throw new ValidationError(
      "Cannot resend invoice — draft is not in INVOICED or OVERDUE state",
      { draftOrderId: draft.id, status: draft.status },
    );
  }
  if (draft.pricesFrozenAt === null) {
    // Belt-and-braces: should be impossible in INVOICED state, but
    // catches corruption rather than silently re-sending unfrozen prices.
    throw new ValidationError(
      "Cannot resend invoice — prices are no longer frozen",
      { draftOrderId: draft.id },
    );
  }
  if (draft.totalCents <= BigInt(0)) {
    throw new ValidationError(
      "Cannot resend invoice — draft has zero total",
      { draftOrderId: draft.id },
    );
  }
}

type CancelPreviousResult = {
  /** True when we issued a Stripe.cancel call (regardless of outcome). */
  attemptedCancel: boolean;
  /** Best-effort cancel error message — null when cancel succeeded or wasn't attempted. */
  error: string | null;
};

/**
 * Inspect the existing PaymentIntent. Throws ConflictError when it has
 * already succeeded (operator should use mark-as-paid instead). Issues
 * a best-effort cancel for live PIs so the next `initiateOrderPayment`
 * call mints a fresh one.
 */
async function inspectAndCancelPreviousPi(
  tenantId: string,
  draftOrderId: string,
  paymentIntentId: string,
): Promise<CancelPreviousResult> {
  const { getStripe } = await import("@/app/_lib/stripe/client");
  const stripe = getStripe();

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeAccountId: true, stripeOnboardingComplete: true },
  });
  const devOrTest =
    process.env.NODE_ENV === "development" ||
    (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
  const connectParams =
    !devOrTest && tenant?.stripeAccountId && tenant.stripeOnboardingComplete
      ? { stripeAccount: tenant.stripeAccountId }
      : undefined;

  let status: string;
  try {
    const pi = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      connectParams,
    );
    status = pi.status;
  } catch (err) {
    // PI couldn't be retrieved — log and treat as cancellable. The
    // adapter will mint a new PI when initiateOrderPayment runs.
    const msg = err instanceof Error ? err.message : String(err);
    log("warn", "draft_order.resend.pi_retrieve_failed", {
      tenantId,
      draftOrderId,
      paymentIntentId,
      error: msg,
    });
    return { attemptedCancel: false, error: msg };
  }

  if (status === "succeeded") {
    throw new ConflictError(
      "Cannot resend invoice — previous PaymentIntent already succeeded; mark draft as paid instead",
      { draftOrderId, paymentIntentId },
    );
  }

  if (status === "canceled") {
    // Already canceled — no action needed; adapter will mint a new PI.
    return { attemptedCancel: false, error: null };
  }

  // Live PI — best-effort cancel.
  const cancelResult = await tryCancelStripePaymentIntent(
    tenantId,
    paymentIntentId,
  );
  return { attemptedCancel: true, error: cancelResult.error };
}

// ── Service ──────────────────────────────────────────────────────

export async function resendInvoice(
  input: ResendInvoiceArgs,
): Promise<ResendInvoiceResult> {
  const params = ResendInvoiceInputSchema.parse(input);

  // Pre-tx: load draft + tenant.
  const draft = await loadDraftForResend(params.tenantId, params.draftOrderId);
  assertResendable(draft);

  const tenant = await loadTenantForInvoice(draft.tenantId);
  await assertTenantStripeReady(tenant);
  const portalSlug = tenant.portalSlug as string;

  // Inspect existing PI — throws on succeeded, cancels on live.
  const previousPiId = getDraftStripePaymentIntentId(draft);
  let previousCancel: CancelPreviousResult = {
    attemptedCancel: false,
    error: null,
  };
  if (previousPiId !== null) {
    previousCancel = await inspectAndCancelPreviousPi(
      draft.tenantId,
      draft.id,
      previousPiId,
    );
  }

  // Mint new share-link artifacts.
  const shareLinkTtlMs = clampShareLinkTtl(params.shareLinkTtlMs);
  const shareLinkToken = generateShareLinkToken();
  const now = new Date();
  const shareLinkExpiresAt = new Date(now.getTime() + shareLinkTtlMs);
  const invoiceUrl = buildInvoiceUrl(portalSlug, shareLinkToken);

  // Initiate a NEW PaymentIntent. The bedfront-payments adapter
  // detects the canceled previous PI (via PaymentSession.externalSessionId
  // health check) and mints a fresh one — no manual session reset needed.
  const { getPlatformFeeBps } = await import(
    "@/app/_lib/payments/platform-fee"
  );
  const { initiateOrderPayment } = await import(
    "@/app/_lib/payments/providers"
  );
  const feeBps = getPlatformFeeBps(
    tenant.subscriptionPlan,
    tenant.platformFeeBps,
  );

  const init = await initiateOrderPayment({
    order: {
      id: draft.id,
      tenantId: draft.tenantId,
      totalAmount: Number(draft.totalCents),
      currency: draft.currency,
    },
    guest: {
      email: draft.contactEmail ?? "",
      name: `${draft.contactFirstName ?? ""} ${draft.contactLastName ?? ""}`.trim(),
    },
    locale: "sv-SE",
    returnUrl: `${invoiceUrl}/success`,
    cancelUrl: `${invoiceUrl}/cancelled`,
    platformFeeBps: feeBps,
    metadata: {
      draftOrderId: draft.id,
      tenantId: draft.tenantId,
      kind: "draft_order_invoice",
      draftDisplayNumber: draft.displayNumber,
    },
  });

  if (init.mode !== "embedded") {
    throw new ValidationError(
      "Payment adapter returned non-embedded mode for draft invoice resend",
      { draftOrderId: draft.id },
    );
  }
  if (!init.providerSessionId) {
    throw new ValidationError(
      "Payment adapter did not return providerSessionId for draft invoice resend",
      { draftOrderId: draft.id },
    );
  }
  const stripePaymentIntentId = init.providerSessionId;
  const clientSecret = init.clientSecret;
  const rotatedPaymentIntent =
    previousPiId === null || stripePaymentIntentId !== previousPiId;

  // Tx (fast): re-validate state + persist new artifacts + emit event.
  const result = await prisma.$transaction(async (tx) => {
    const fresh = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as DraftOrder | null;
    if (!fresh) {
      throw new NotFoundError("DraftOrder vanished during resend", {
        draftOrderId: draft.id,
      });
    }
    if (fresh.status !== "INVOICED" && fresh.status !== "OVERDUE") {
      throw new ConflictError(
        "Draft status changed between validation and resend",
        { draftOrderId: draft.id, status: fresh.status },
      );
    }
    if (fresh.version !== draft.version) {
      throw new ConflictError(
        "Draft was modified concurrently — retry resend",
        {
          draftOrderId: draft.id,
          expectedVersion: draft.version,
          actualVersion: fresh.version,
        },
      );
    }

    const mergedMetafields = mergeMetafields(fresh.metafields, {
      stripePaymentIntentId,
    });

    await tx.draftOrder.update({
      where: { id: draft.id, version: draft.version },
      data: {
        shareLinkToken,
        shareLinkExpiresAt,
        invoiceUrl,
        invoiceSentAt: now,
        invoiceEmailSubject:
          params.invoiceEmailSubject ?? fresh.invoiceEmailSubject,
        invoiceEmailMessage:
          params.invoiceEmailMessage ?? fresh.invoiceEmailMessage,
        metafields: mergedMetafields,
        version: { increment: 1 },
      },
    });

    // Prisma.InputJsonValue does not accept `null` in nested fields —
    // omit optional string fields when they have no value.
    const eventMetadata: Prisma.InputJsonValue = {
      invoiceUrl,
      stripePaymentIntentId,
      rotatedPaymentIntent,
      shareLinkExpiresAt: shareLinkExpiresAt.toISOString(),
      totalCents: draft.totalCents.toString(),
      currency: draft.currency,
      ...(previousPiId !== null
        ? { previousStripePaymentIntentId: previousPiId }
        : {}),
      ...(previousCancel.error !== null
        ? { previousPiCancelError: previousCancel.error }
        : {}),
    };

    await createDraftOrderEventInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      type: "INVOICE_RESENT",
      metadata: eventMetadata,
      actorUserId: params.actorUserId ?? null,
      actorSource: params.actorSource,
    });

    const refreshed = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as DraftOrder;
    return refreshed;
  });

  log("info", "draft_order.invoice_resent", {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    stripePaymentIntentId,
    previousStripePaymentIntentId: previousPiId,
    rotatedPaymentIntent,
    invoiceUrl,
  });

  emitPlatformEvent({
    type: "draft_order.invoice_resent",
    tenantId: draft.tenantId,
    payload: {
      draftOrderId: draft.id,
      tenantId: draft.tenantId,
      displayNumber: result.displayNumber,
      invoiceUrl,
      stripePaymentIntentId,
      previousStripePaymentIntentId: previousPiId,
      rotatedPaymentIntent,
      totalCents: draft.totalCents.toString(),
      currency: draft.currency,
      shareLinkExpiresAt: shareLinkExpiresAt.toISOString(),
      invoiceSentAt: now.toISOString(),
    },
  }).catch((err) => {
    log("error", "draft_order.webhook_emit_failed", {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      eventType: "draft_order.invoice_resent",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return {
    draft: result,
    invoiceUrl,
    shareLinkToken,
    shareLinkExpiresAt,
    clientSecret,
    stripePaymentIntentId,
    rotatedPaymentIntent,
    previousPiCancelError: previousCancel.error,
  };
}
