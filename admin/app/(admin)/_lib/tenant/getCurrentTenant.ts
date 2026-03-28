"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { getAuth } from "../auth/devAuth";
import { setSentryTenantContext } from "@/app/_lib/observability/sentry";

/**
 * Get the current tenant for the authenticated admin user.
 *
 * Returns the full Tenant record (including settings, draftSettings,
 * settingsVersion, previousSettings) plus auth context.
 *
 * Returns null if not authenticated or tenant not found.
 */
export async function getCurrentTenant() {
  const { userId, orgId } = await getAuth();

  if (!userId || !orgId) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
  });

  if (!tenant) return null;

  try {
    setSentryTenantContext(tenant.id, tenant.portalSlug ?? undefined);
  } catch {
    // Sentry unavailable — safe to ignore
  }

  return {
    tenant,
    clerkUserId: userId,
    clerkOrgId: orgId,
  };
}
