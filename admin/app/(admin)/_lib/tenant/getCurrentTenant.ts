"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { getAuth } from "../auth/devAuth";

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

  // Dynamic import — prevents @sentry/nextjs from being bundled into
  // the server action client proxy (causes Turbopack module error)
  import("@/app/_lib/observability/sentry").then(({ setSentryTenantContext }) =>
    setSentryTenantContext(tenant.id, tenant.portalSlug ?? undefined),
  ).catch(() => {});

  return {
    tenant,
    clerkUserId: userId,
    clerkOrgId: orgId,
  };
}
