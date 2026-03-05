"use server";

import { auth } from '@clerk/nextjs/server';
import { prisma } from "@/app/_lib/db/prisma";

export async function getCurrentTenant() {
  const { userId, orgId } = await auth();

  // Dev fallback — använd seed-tenant utan inloggning
  if (process.env.NODE_ENV === 'development' && !orgId) {
    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: 'org_3ARDCw7QTcQ0s1v0KCbF1DSrLip' },
    });
    if (tenant) {
      return {
        tenant,
        clerkUserId: userId ?? 'dev_user',
        clerkOrgId: 'org_3ARDCw7QTcQ0s1v0KCbF1DSrLip',
      };
    }
  }

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
