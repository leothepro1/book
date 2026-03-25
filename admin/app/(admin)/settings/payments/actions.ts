"use server";

import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { prisma } from "@/app/_lib/db/prisma";
import {
  createOnboardingLink,
  refreshOnboardingStatus,
  disconnectStripe,
} from "@/app/_lib/stripe/connect";
import type { ConnectStatus } from "@/app/_lib/stripe/connect";
import {
  fetchPayoutInfo,
  fetchRecentPayouts,
  updatePayoutScheduleOnStripe,
} from "@/app/_lib/stripe/payouts";
import type { PayoutInfo, PayoutItem, PayoutScheduleInput } from "@/app/_lib/stripe/payouts";
import type { PaymentMethodConfig, PaymentMethodId } from "@/app/_lib/payments/types";
import { DEFAULT_PAYMENT_METHOD_CONFIG } from "@/app/_lib/payments/defaults";
import { PAYMENT_METHOD_MAP } from "@/app/_lib/payments/registry";

/**
 * Get Stripe Connect status for the current tenant.
 */
export async function getPaymentStatus(): Promise<ConnectStatus> {
  const { orgId } = await getAuth();
  if (!orgId) return { connected: false, livemode: false, accountId: null, connectedAt: null };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return { connected: false, livemode: false, accountId: null, connectedAt: null };

  try {
    return await refreshOnboardingStatus(tenant.id);
  } catch {
    // Stripe API unavailable or account doesn't exist — return disconnected
    return { connected: false, livemode: false, accountId: null, connectedAt: null };
  }
}

/**
 * Start Stripe Connect onboarding — returns a URL to redirect the tenant to.
 */
export async function startOnboarding(): Promise<{ url: string } | { error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error };

  const { orgId } = await getAuth();
  if (!orgId) return { error: "Ingen organisation vald" };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return { error: "Organisationen hittades inte" };

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const result = await createOnboardingLink(
      tenant.id,
      `${baseUrl}/products#settings/payments`,
      `${baseUrl}/products#settings/payments`,
    );
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte starta anslutningen" };
  }
}

/**
 * Disconnect Stripe from the tenant.
 */
export async function disconnectPayments(): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error };

  const { orgId } = await getAuth();
  if (!orgId) return { error: "Ingen organisation vald" };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return { error: "Organisationen hittades inte" };

  return disconnectStripe(tenant.id);
}

/**
 * Check if the tenant has active products (for warning banner).
 */
export async function hasActiveProducts(): Promise<boolean> {
  const { orgId } = await getAuth();
  if (!orgId) return false;

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return false;

  const count = await prisma.product.count({
    where: { tenantId: tenant.id, status: "ACTIVE" },
  });
  return count > 0;
}

// ── Payout actions ──────────────────────────────────────────────

/**
 * Fetch payout info (bank account + schedule) from Stripe.
 */
export async function getPayoutInfo(): Promise<PayoutInfo | { error: string }> {
  const { orgId } = await getAuth();
  if (!orgId) return { error: "Ingen organisation vald" };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { stripeAccountId: true, stripeOnboardingComplete: true },
  });
  if (!tenant?.stripeAccountId || !tenant.stripeOnboardingComplete) {
    return { error: "Stripe är inte anslutet" };
  }

  try {
    return await fetchPayoutInfo(tenant.stripeAccountId);
  } catch {
    return { error: "Kunde inte hämta utbetalningsinformation" };
  }
}

/**
 * Update payout schedule on connected Stripe account.
 */
export async function updatePayoutSchedule(
  schedule: PayoutScheduleInput,
): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error };

  const { orgId } = await getAuth();
  if (!orgId) return { error: "Ingen organisation vald" };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { stripeAccountId: true, stripeOnboardingComplete: true },
  });
  if (!tenant?.stripeAccountId || !tenant.stripeOnboardingComplete) {
    return { error: "Stripe är inte anslutet" };
  }

  try {
    await updatePayoutScheduleOnStripe(tenant.stripeAccountId, schedule);
    return { ok: true };
  } catch {
    return { error: "Kunde inte uppdatera utbetalningsschema" };
  }
}

/**
 * Fetch recent payouts from Stripe.
 */
export async function getRecentPayouts(): Promise<PayoutItem[] | { error: string }> {
  const { orgId } = await getAuth();
  if (!orgId) return { error: "Ingen organisation vald" };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { stripeAccountId: true, stripeOnboardingComplete: true },
  });
  if (!tenant?.stripeAccountId || !tenant.stripeOnboardingComplete) {
    return { error: "Stripe är inte anslutet" };
  }

  try {
    return await fetchRecentPayouts(tenant.stripeAccountId);
  } catch {
    return { error: "Kunde inte hämta utbetalningar" };
  }
}

// ── Payment method config actions ───────────────────────────────

/**
 * Get the current payment method config for the tenant.
 * Returns merged config (stored values + defaults for missing).
 */
export async function getPaymentMethodConfig(): Promise<PaymentMethodConfig> {
  const { orgId } = await getAuth();
  if (!orgId) return DEFAULT_PAYMENT_METHOD_CONFIG;

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { paymentMethodConfig: true },
  });

  if (!tenant?.paymentMethodConfig) return DEFAULT_PAYMENT_METHOD_CONFIG;

  return tenant.paymentMethodConfig as PaymentMethodConfig;
}

/**
 * Toggle a payment method on/off for the tenant.
 * Validates against the registry — alwaysOn methods cannot be disabled.
 */
export async function togglePaymentMethod(
  methodId: PaymentMethodId,
  enabled: boolean,
): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error };

  // Validate method exists in registry
  const def = PAYMENT_METHOD_MAP.get(methodId);
  if (!def) return { error: "Okänd betalningsmetod" };

  // Cannot disable always-on methods
  if (def.alwaysOn && !enabled) {
    return { error: `${def.name} kan inte avaktiveras` };
  }

  const { orgId } = await getAuth();
  if (!orgId) return { error: "Ingen organisation vald" };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true, paymentMethodConfig: true },
  });
  if (!tenant) return { error: "Organisationen hittades inte" };

  // Merge into existing config
  const existing = (tenant.paymentMethodConfig as PaymentMethodConfig | null)
    ?? DEFAULT_PAYMENT_METHOD_CONFIG;

  const updated: PaymentMethodConfig = {
    ...existing,
    methods: {
      ...existing.methods,
      [methodId]: enabled,
    },
  };

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { paymentMethodConfig: updated },
  });

  return { ok: true };
}
