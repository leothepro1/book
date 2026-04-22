/**
 * CompanyEvent service — append-only audit trail för företagets tidslinje.
 *
 * Mirror av `createGuestAccountEvent` i `app/_lib/guests/events.ts` —
 * samma signatur, samma tenant-scope. Används både av servicelagrets
 * mutationer och av admin-kommentarsflödet.
 */

import { prisma } from "@/app/_lib/db/prisma";
import type { CompanyEventType, Prisma } from "@prisma/client";
import { log } from "@/app/_lib/logger";

export type { CompanyEventType };

export async function createCompanyEvent(params: {
  tenantId: string;
  companyId: string;
  type: CompanyEventType;
  message?: string | null;
  metadata?: Prisma.InputJsonValue;
  actorUserId?: string | null;
}): Promise<void> {
  try {
    await prisma.companyEvent.create({
      data: {
        tenantId: params.tenantId,
        companyId: params.companyId,
        type: params.type,
        message: params.message ?? null,
        metadata: params.metadata ?? undefined,
        actorUserId: params.actorUserId ?? null,
      },
    });
  } catch (err) {
    // Tidslinje-logging får aldrig blockera huvudflödet.
    log("error", "company_event.create_failed", {
      companyId: params.companyId,
      type: params.type,
      error: String(err),
    });
  }
}

/**
 * Hämta tidslinjens 50 senaste events för en företagsdetaljsida.
 * Tenant-scoped. Nyaste först.
 */
export async function listCompanyEvents(params: {
  tenantId: string;
  companyId: string;
  take?: number;
}) {
  const take = Math.min(params.take ?? 50, 200);
  return prisma.companyEvent.findMany({
    where: { tenantId: params.tenantId, companyId: params.companyId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      type: true,
      message: true,
      metadata: true,
      actorUserId: true,
      createdAt: true,
    },
  });
}
