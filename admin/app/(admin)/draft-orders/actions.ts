"use server";

import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { prisma } from "@/app/_lib/db/prisma";
import {
  listDrafts,
  type DraftListFilters,
  type DraftListSort,
  type DraftListItem,
} from "@/app/_lib/draft-orders";

// ── Types ──────────────────────────────────────────────────────

export type DraftTab = "alla" | "öppna" | "fakturerade" | "betalda" | "stängda";

export type GetDraftsParams = {
  tab?: string;
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: DraftListSort["by"];
  sortDirection?: DraftListSort["direction"];
};

export type GetDraftsResult = {
  items: DraftListItem[];
  total: number;
  page: number;
  limit: number;
};

const DEFAULT_LIMIT = 25;

// ── Tab → status filter ────────────────────────────────────────

function buildTabFilters(tab?: string): DraftListFilters {
  switch (tab) {
    case "öppna":
      return { status: ["OPEN", "PENDING_APPROVAL", "APPROVED"] };
    case "fakturerade":
      return { status: ["INVOICED", "OVERDUE"] };
    case "betalda":
      return { status: ["PAID"] };
    case "stängda":
      return { status: ["COMPLETED", "CANCELLED", "REJECTED"] };
    case "alla":
    default:
      return {};
  }
}

// ── Server action ──────────────────────────────────────────────

export async function getDrafts(
  params: GetDraftsParams,
): Promise<GetDraftsResult> {
  const limit = params.limit ?? DEFAULT_LIMIT;
  const page = params.page ?? 1;

  const { orgId } = await getAuth();
  if (!orgId) return { items: [], total: 0, page, limit };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return { items: [], total: 0, page, limit };

  const filters = buildTabFilters(params.tab);
  if (params.search && params.search.length > 0) {
    filters.search = params.search;
  }

  const sort: DraftListSort = {
    by: params.sortBy ?? "expiresAt",
    direction: params.sortDirection ?? "asc",
  };

  const result = await listDrafts(tenant.id, {
    filters,
    sort,
    page,
    limit,
  });

  return {
    items: result.items,
    total: result.totalCount,
    page: result.page,
    limit: result.limit,
  };
}
