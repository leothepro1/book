"use server";

import { auth } from '@clerk/nextjs/server';
import { prisma } from "@/app/_lib/db/prisma";

/**
 * Hämtar current tenant baserat på Clerk organization context.
 * 
 * I Clerk Organizations model:
 * - User kan vara medlem i flera organizations
 * - Vi kopplar Tenant 1:1 till Clerk Organization via clerkOrgId
 * - Clerk hanterar membership, roles, permissions
 */
export async function getCurrentTenant() {
  const { userId, orgId } = await auth();
  console.log("[getCurrentTenant] userId:", userId, "orgId:", orgId);

  if (!userId) {
    return null;
  }

  // Om user inte är i någon organization context
  if (!orgId) {
    return null;
  }

  // Hämta tenant baserat på Clerk Organization ID
  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
  });

  if (!tenant) {
    return null;
  }

  return {
    tenant,
    clerkUserId: userId,
    clerkOrgId: orgId,
  };
}

/**
 * Hämtar tenant config från settings JSON field.
 */
export async function getTenantConfig(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    throw new Error("Tenant not found");
  }

  // Om settings finns i DB, använd dem
  if (tenant.settings) {
    return tenant.settings as any; // TenantConfig type
  }

  return null;
}

/**
 * Uppdaterar tenant settings.
 */
export async function updateTenantSettings(tenantId: string, settings: any) {
  return await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings },
  });
}
