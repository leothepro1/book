"use server";

import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { prisma } from "@/app/_lib/db/prisma";
import {
  searchAccommodations,
  checkAvailability,
  createDraftWithLines,
  searchCustomers,
  previewDraftTotals,
  type AccommodationSearchResult,
  type AvailabilityResult,
  type CreateDraftWithLinesInput,
  type CreateDraftWithLinesResult,
  type CustomerSearchResult,
  type PreviewInput,
  type PreviewResult,
} from "@/app/_lib/draft-orders";

export type PreviewDraftTotalsActionInput = Omit<PreviewInput, "tenantId">;

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

export async function searchCustomersAction(
  query: string,
): Promise<CustomerSearchResult[]> {
  const tenantId = await getTenantId();
  if (!tenantId) return [];
  return searchCustomers(tenantId, query);
}

export async function previewDraftTotalsAction(
  input: PreviewDraftTotalsActionInput,
): Promise<PreviewResult | null> {
  const tenantId = await getTenantId();
  if (!tenantId) return null;
  return previewDraftTotals({ ...input, tenantId });
}

// Pool-from-existing tag autocomplete. Reads distinct tag values across this
// tenant's existing DraftOrder.tags arrays — there is no central tag pool.
// Escapes LIKE wildcards in user input so a literal "%" types as "%", not as
// a match-anything operator.
export async function searchDraftTagsAction(query: string): Promise<string[]> {
  const tenantId = await getTenantId();
  if (!tenantId) return [];
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const escaped = trimmed.replace(/[\\%_]/g, (c) => `\\${c}`);
  const pattern = `${escaped}%`;
  const rows = await prisma.$queryRaw<Array<{ tag: string }>>`
    SELECT DISTINCT t.tag
    FROM "DraftOrder" d, unnest(d."tags") AS t(tag)
    WHERE d."tenantId" = ${tenantId}
      AND t.tag ILIKE ${pattern} ESCAPE '\'
    ORDER BY t.tag ASC
    LIMIT 10
  `;
  return rows.map((r) => r.tag);
}
