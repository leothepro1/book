"use server";

import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { prisma } from "@/app/_lib/db/prisma";
import { getDraft, type DraftDetail } from "@/app/_lib/draft-orders/get";

async function getTenantId(): Promise<string | null> {
  const { orgId } = await getAuth();
  if (!orgId) return null;
  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  return tenant?.id ?? null;
}

export async function getDraftAction(
  draftId: string,
): Promise<DraftDetail | null> {
  const tenantId = await getTenantId();
  if (!tenantId) return null;
  return getDraft(draftId, tenantId);
}
