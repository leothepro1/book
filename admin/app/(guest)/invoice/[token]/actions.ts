/**
 * Server actions for the customer-facing invoice page.
 *
 * Per FAS 7.3 recon Q1: we do NOT persist the Stripe `clientSecret`
 * on the DraftOrder. Instead we retrieve the existing PaymentIntent
 * runtime via the Stripe SDK each time the customer loads the page.
 * The PI is created in `sendInvoice` and stored in
 * `DraftOrder.metafields.stripePaymentIntentId`.
 *
 * Tenant resolution comes from the host header — the only legitimate
 * way to land on this action is via `{portalSlug}.rutgr.com/invoice/...`.
 */

"use server";

import { log } from "@/app/_lib/logger";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { checkRateLimit } from "@/app/_lib/rate-limit/checkout";
import {
  getDraftByShareToken,
  getDraftStripePaymentIntentId,
} from "@/app/_lib/draft-orders";

export type GetInvoiceClientSecretResult =
  | { ok: true; clientSecret: string; paymentIntentId: string }
  | { ok: false; code: GetInvoiceClientSecretErrorCode; message: string };

export type GetInvoiceClientSecretErrorCode =
  | "RATE_LIMITED"
  | "TENANT_NOT_RESOLVED"
  | "NOT_FOUND"
  | "EXPIRED"
  | "ALREADY_PAID"
  | "INVALID_STATE"
  | "STRIPE_ERROR";

/**
 * Resolve a `clientSecret` for the embedded Stripe PaymentIntent
 * attached to the draft identified by `token`.
 *
 * Returns a discriminated Result — never throws to the caller. The
 * server-page receives the same shape so it can render an inline
 * error banner instead of bouncing to a 500.
 */
export async function getInvoiceClientSecretAction(
  token: string,
): Promise<GetInvoiceClientSecretResult> {
  // Cheap input guard before any IO.
  if (typeof token !== "string" || token.length === 0) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Invalid token",
    };
  }

  // Rate-limit per IP — protects against token-enumeration attacks
  // that try to harvest valid clientSecrets.
  const allowed = await checkRateLimit(
    "draft-invoice:client-secret",
    5,
    10 * 60 * 1000,
  );
  if (!allowed) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      message: "För många försök — vänta en stund och försök igen.",
    };
  }

  const tenant = await resolveTenantFromHost();
  if (!tenant) {
    return {
      ok: false,
      code: "TENANT_NOT_RESOLVED",
      message: "Kunde inte identifiera värd.",
    };
  }

  const result = await getDraftByShareToken(token, tenant.id);
  if (!result) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Faktura hittades inte.",
    };
  }

  if (result.expired) {
    return {
      ok: false,
      code: "EXPIRED",
      message: "Faktura-länken har gått ut.",
    };
  }

  if (result.draft.status === "PAID" || result.draft.status === "COMPLETED") {
    return {
      ok: false,
      code: "ALREADY_PAID",
      message: "Faktura är redan betald.",
    };
  }

  if (
    result.draft.status !== "INVOICED" &&
    result.draft.status !== "OVERDUE"
  ) {
    return {
      ok: false,
      code: "INVALID_STATE",
      message: "Faktura kan inte betalas just nu.",
    };
  }

  // Re-fetch the raw row so we can read metafields. The public DTO
  // intentionally redacts metafields, so we must hit the DB once more.
  // Cost: a single indexed lookup — acceptable.
  const raw = await prisma.draftOrder.findUnique({
    where: { id: result.draft.id },
    select: { metafields: true, tenantId: true },
  });
  if (!raw || raw.tenantId !== tenant.id) {
    return { ok: false, code: "NOT_FOUND", message: "Faktura hittades inte." };
  }

  const piId = getDraftStripePaymentIntentId(raw);
  if (!piId) {
    log("error", "draft_invoice.client_secret.missing_pi", {
      tenantId: tenant.id,
      draftOrderId: result.draft.id,
    });
    return {
      ok: false,
      code: "INVALID_STATE",
      message: "Faktura saknar betalningsinitiering.",
    };
  }

  // Connect: retrieve PI on the connected account.
  // Match the (admin) get.ts heuristic — skip Connect routing in
  // dev / test-key environments where PI was likely created on the
  // platform account.
  const tenantStripe = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { stripeAccountId: true, stripeOnboardingComplete: true },
  });
  const devOrTest =
    process.env.NODE_ENV === "development" ||
    (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
  const connectParams =
    !devOrTest &&
    tenantStripe?.stripeAccountId &&
    tenantStripe.stripeOnboardingComplete
      ? { stripeAccount: tenantStripe.stripeAccountId }
      : undefined;

  try {
    const { getStripe } = await import("@/app/_lib/stripe/client");
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.retrieve(piId, connectParams);

    // Terminal/race statuses come BEFORE the client_secret null-check —
    // Stripe returns `client_secret: null` for canceled PIs, so a
    // null-first guard would mask the real reason.
    if (pi.status === "succeeded") {
      // Webhook race — PI confirmed but DraftOrder hasn't been moved
      // to PAID yet. Same UX as ALREADY_PAID.
      return {
        ok: false,
        code: "ALREADY_PAID",
        message: "Faktura är redan betald.",
      };
    }

    if (pi.status === "canceled") {
      return {
        ok: false,
        code: "INVALID_STATE",
        message: "Betalning är avbruten — kontakta säljaren.",
      };
    }

    if (!pi.client_secret) {
      return {
        ok: false,
        code: "STRIPE_ERROR",
        message: "Betalningsleverantör returnerade inget client_secret.",
      };
    }

    return {
      ok: true,
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
    };
  } catch (err) {
    log("error", "draft_invoice.client_secret.stripe_error", {
      tenantId: tenant.id,
      draftOrderId: result.draft.id,
      paymentIntentId: piId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      code: "STRIPE_ERROR",
      message: "Kunde inte hämta betalningsdetaljer från Stripe.",
    };
  }
}

