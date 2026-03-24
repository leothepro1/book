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

  return refreshOnboardingStatus(tenant.id);
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

  const result = await createOnboardingLink(
    tenant.id,
    `${baseUrl}/products#settings/payments`,
    `${baseUrl}/products#settings/payments`,
  );

  return result;
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
