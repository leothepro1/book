"use server";

import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { prisma } from "@/app/_lib/db/prisma";
import {
  searchAccommodations,
  checkAvailability,
  createDraftWithLines,
  type AccommodationSearchResult,
  type AvailabilityResult,
  type CreateDraftWithLinesInput,
  type CreateDraftWithLinesResult,
} from "@/app/_lib/draft-orders";

async function getTenantId(): Promise<string | null> {
  const { orgId } = await getAuth();
  if (!orgId) return null;
  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  return tenant?.id ?? null;
}

export async function searchAccommodationsAction(
  query: string,
): Promise<AccommodationSearchResult[]> {
  const tenantId = await getTenantId();
  if (!tenantId) return [];
  return searchAccommodations(tenantId, query, { limit: 20 });
}

export async function checkAvailabilityAction(
  accommodationId: string,
  fromDate: Date,
  toDate: Date,
): Promise<AvailabilityResult> {
  const tenantId = await getTenantId();
  if (!tenantId) return { available: false, reason: "Ingen tenant" };
  return checkAvailability(tenantId, accommodationId, fromDate, toDate);
}

export async function createDraftWithLinesAction(
  input: Omit<CreateDraftWithLinesInput, "tenantId">,
): Promise<CreateDraftWithLinesResult> {
  const tenantId = await getTenantId();
  if (!tenantId) return { ok: false, error: "Ingen tenant" };
  return createDraftWithLines({ ...input, tenantId });
}
