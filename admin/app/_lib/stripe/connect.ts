/**
 * Stripe Connect — tenant onboarding
 * ════════════════════════════════════
 *
 * Each tenant connects their OWN Stripe account via Stripe Connect (Standard).
 * The platform creates Account Links for onboarding and retrieves account status.
 */

"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";
import { getStripe } from "./client";
import { DEFAULT_PAYMENT_METHOD_CONFIG } from "@/app/_lib/payments/defaults";

// ── Types ──────────────────────────────────────────────────────

export type ConnectStatus = {
  connected: boolean;
  livemode: boolean;
  accountId: string | null;
  connectedAt: string | null; // ISO string
};

// ── Onboarding ─────────────────────────────────────────────────

/**
 * Creates a Stripe Connect onboarding link for the tenant.
 * If the tenant doesn't have a Stripe account yet, creates one first.
 */
export async function createOnboardingLink(
  tenantId: string,
  returnUrl: string,
  refreshUrl: string,
): Promise<{ url: string }> {
  const stripe = getStripe();
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { stripeAccountId: true, name: true },
  });

  let accountId = tenant.stripeAccountId;

  // Create a connected account if one doesn't exist yet
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "standard",
      business_profile: {
        name: tenant.name,
      },
    });
    accountId = account.id;

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { stripeAccountId: accountId },
    });
  }

  // Create an account link for onboarding
  const link = await stripe.accountLinks.create({
    account: accountId,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    type: "account_onboarding",
  });

  return { url: link.url };
}

/**
 * Checks the connected Stripe account status and updates onboarding state.
 * Called after the tenant returns from Stripe onboarding.
 */
export async function refreshOnboardingStatus(
  tenantId: string,
): Promise<ConnectStatus> {
  const stripe = getStripe();
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      stripeAccountId: true,
      stripeOnboardingComplete: true,
      stripeLivemode: true,
      stripeConnectedAt: true,
    },
  });

  if (!tenant.stripeAccountId) {
    return {
      connected: false,
      livemode: false,
      accountId: null,
      connectedAt: null,
    };
  }

  // Retrieve account to check if onboarding is complete
  const account = await stripe.accounts.retrieve(tenant.stripeAccountId);

  const chargesEnabled = account.charges_enabled ?? false;
  const detailsSubmitted = account.details_submitted ?? false;
  const isComplete = chargesEnabled && detailsSubmitted;
  // Stripe v20+ doesn't expose livemode on Account — infer from the secret key prefix
  const livemode = env.STRIPE_SECRET_KEY.startsWith("sk_live_");

  // Update tenant if status changed
  if (
    isComplete !== tenant.stripeOnboardingComplete ||
    livemode !== tenant.stripeLivemode
  ) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        stripeOnboardingComplete: isComplete,
        stripeLivemode: livemode,
        ...(isComplete && !tenant.stripeConnectedAt
          ? { stripeConnectedAt: new Date() }
          : {}),
        // Seed default payment method config on first-time completion
        ...(isComplete && !tenant.stripeOnboardingComplete
          ? { paymentMethodConfig: DEFAULT_PAYMENT_METHOD_CONFIG }
          : {}),
      },
    });
  }

  return {
    connected: isComplete,
    livemode,
    accountId: tenant.stripeAccountId,
    connectedAt: (
      tenant.stripeConnectedAt ?? (isComplete ? new Date() : null)
    )?.toISOString() ?? null,
  };
}

// ── Status ─────────────────────────────────────────────────────

/**
 * Returns current Stripe Connect status for a tenant.
 */
export async function getConnectStatus(
  tenantId: string,
): Promise<ConnectStatus> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      stripeAccountId: true,
      stripeOnboardingComplete: true,
      stripeLivemode: true,
      stripeConnectedAt: true,
    },
  });

  return {
    connected: tenant.stripeOnboardingComplete,
    livemode: tenant.stripeLivemode,
    accountId: tenant.stripeAccountId,
    connectedAt: tenant.stripeConnectedAt?.toISOString() ?? null,
  };
}

// ── Disconnect ─────────────────────────────────────────────────

/**
 * Disconnects the Stripe account from the tenant.
 * Deauthorizes the connected account on Stripe first, then clears the DB record.
 */
export async function disconnectStripe(
  tenantId: string,
): Promise<{ ok: true }> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { stripeAccountId: true },
  });

  // Deauthorize on Stripe first — prevents the connected account from
  // continuing to process payments on our behalf
  if (tenant.stripeAccountId) {
    const stripe = getStripe();
    try {
      await stripe.accounts.del(tenant.stripeAccountId);
    } catch {
      // If the account is already deauthorized or doesn't exist, proceed anyway
    }
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      stripeLivemode: false,
      stripeConnectedAt: null,
      paymentMethodConfig: Prisma.DbNull,
    },
  });

  return { ok: true };
}
