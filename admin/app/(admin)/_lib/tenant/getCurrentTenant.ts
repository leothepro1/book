"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { getAuth } from "../auth/devAuth";

export async function getCurrentTenant() {
  const { userId, orgId } = await getAuth();

  if (!userId || !orgId) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
  });

  if (!tenant) return null;

  return {
    tenant,
    clerkUserId: userId,
    clerkOrgId: orgId,
  };
}

export async function getTenantConfig(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) throw new Error("Tenant not found");
  if (tenant.settings) return tenant.settings as any;
  return null;
}

export async function updateTenantSettings(tenantId: string, settings: any) {
  return await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings },
  });
}
