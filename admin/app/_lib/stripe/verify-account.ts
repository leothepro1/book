/**
 * Stripe Connect Account Verification (cached) + tenant readiness gate.
 * ════════════════════════════════════════════════════════════════════
 *
 * Two layers of checks against a tenant's connected Stripe account:
 *
 * 1. `verifyChargesEnabled` — the account can accept charges at all
 *    (`account.charges_enabled === true`). Cached 60s.
 *
 * 2. `verifyEmbeddedModeReady` — the account can host embedded
 *    PaymentIntents (`capabilities.card_payments === "active"` AND
 *    `requirements.disabled_reason` is null/undefined). Cached 60s.
 *    Capability inspection is the Stripe-idiomatic way to detect
 *    post-onboarding capability loss; the second condition catches
 *    administratively-frozen accounts (e.g.
 *    `requirements.disabled_reason: "rejected.fraud"`) where the
 *    capability is still listed as active but charges will be
 *    rejected. Required by `draft-orders-invoice-flow.md` v1.3 §13.4.
 *
 * 3. `assertTenantStripeReady` — composes both helpers plus the
 *    structural checks (account id present, onboarding complete,
 *    portalSlug present so a buyer URL can be built). Throws
 *    `ValidationError` on any failure. Phase E lazy-creation catches
 *    and translates to a typed `tenant_not_ready` result; throwing
 *    callers (e.g. future admin-side preflight) get the original
 *    `ValidationError` shape. Per v1.3 §7.3 this lives here, not in
 *    `lifecycle.ts`, so all Stripe-readiness checks colocate.
 */

import { ValidationError } from "@/app/_lib/errors/service-errors";
import { getStripe } from "./client";

const TTL = 60_000; // 60 seconds

const chargesCache = new Map<string, { chargesEnabled: boolean; ts: number }>();
const embeddedCache = new Map<string, { ready: boolean; ts: number }>();

/** Tenant shape required by `assertTenantStripeReady`. Kept narrow so callers
 *  don't need to over-load. */
export interface TenantForStripeReadiness {
  id: string;
  portalSlug: string | null;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
}

export async function verifyChargesEnabled(
  stripeAccountId: string,
): Promise<boolean> {
  // DEV: skip Stripe verification — always allow charges
  if (process.env.NODE_ENV === "development") return true;

  const cached = chargesCache.get(stripeAccountId);
  if (cached && Date.now() - cached.ts < TTL) {
    return cached.chargesEnabled;
  }

  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(stripeAccountId);
  const chargesEnabled = account.charges_enabled === true;

  chargesCache.set(stripeAccountId, { chargesEnabled, ts: Date.now() });
  return chargesEnabled;
}

/**
 * Returns true iff the connected Stripe account can host an embedded
 * PaymentIntent right now. Two conditions, both required:
 *
 *   (a) `capabilities.card_payments === "active"`
 *   (b) `requirements.disabled_reason` is null or undefined
 *
 * 60s in-process cache. Mirrors `verifyChargesEnabled` so a Phase E
 * pipeline that calls both helpers makes at most one round-trip per
 * minute per tenant under normal operation.
 */
export async function verifyEmbeddedModeReady(
  stripeAccountId: string,
): Promise<boolean> {
  // DEV: skip Stripe verification — match `verifyChargesEnabled`
  if (process.env.NODE_ENV === "development") return true;

  const cached = embeddedCache.get(stripeAccountId);
  if (cached && Date.now() - cached.ts < TTL) {
    return cached.ready;
  }

  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(stripeAccountId);

  const cardPaymentsActive =
    account.capabilities?.card_payments === "active";
  const disabledReason = account.requirements?.disabled_reason;
  const notFrozen = disabledReason === null || disabledReason === undefined;

  const ready = cardPaymentsActive && notFrozen;
  embeddedCache.set(stripeAccountId, { ready, ts: Date.now() });
  return ready;
}

/**
 * Tenant Stripe-readiness gate (v1.3 §7.3). Throws `ValidationError`
 * with a precise `context.reason` on the first failing check; callers
 * that need typed results catch and translate. Composition order:
 *
 *   structural → `verifyChargesEnabled` → `verifyEmbeddedModeReady`
 *
 * The two cached helpers never run if structural checks fail, so this
 * is also cheap on the misconfigured-tenant path.
 */
export async function assertTenantStripeReady(
  tenant: TenantForStripeReadiness,
): Promise<void> {
  if (!tenant.stripeAccountId) {
    throw new ValidationError("Tenant has no Stripe Connect account", {
      tenantId: tenant.id,
      reason: "no_stripe_account",
    });
  }
  if (!tenant.stripeOnboardingComplete) {
    throw new ValidationError("Tenant Stripe onboarding is not complete", {
      tenantId: tenant.id,
      reason: "onboarding_incomplete",
    });
  }
  if (!tenant.portalSlug) {
    throw new ValidationError(
      "Tenant has no portalSlug — cannot build buyer URL",
      { tenantId: tenant.id, reason: "no_portal_slug" },
    );
  }

  const chargesOk = await verifyChargesEnabled(tenant.stripeAccountId);
  if (!chargesOk) {
    throw new ValidationError(
      "Tenant Stripe account cannot accept charges",
      { tenantId: tenant.id, reason: "charges_disabled" },
    );
  }

  const embeddedOk = await verifyEmbeddedModeReady(tenant.stripeAccountId);
  if (!embeddedOk) {
    throw new ValidationError(
      "Tenant Stripe account is not embedded-mode ready",
      { tenantId: tenant.id, reason: "embedded_mode_not_ready" },
    );
  }
}
