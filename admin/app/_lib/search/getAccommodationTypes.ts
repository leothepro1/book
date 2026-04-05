/**
 * getAccommodationTypes
 * ═════════════════════
 *
 * Returns the distinct AccommodationCategory titles that a tenant has
 * marked as visible in search (visibleInSearch: true on AccommodationCategory).
 *
 * Cached via unstable_cache — one DB query per tenant per 5 minutes.
 * If a tenant hides a category, it disappears from the search filter.
 *
 * This is the ONLY function that resolves available accommodation types
 * for the search form. Never hardcode type arrays in UI code.
 */

import { unstable_cache } from "next/cache";
import { prisma } from "@/app/_lib/db/prisma";

export type SearchAccommodationType = {
  id: string;
  title: string;
};

async function fetchAccommodationTypes(tenantId: string): Promise<SearchAccommodationType[]> {
  const categories = await prisma.accommodationCategory.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      visibleInSearch: true,
    },
    select: {
      id: true,
      title: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  return categories;
}

/**
 * Cached wrapper — revalidates every 5 minutes per tenant.
 * Tag-based invalidation: call revalidateTag(`accommodation-types:${tenantId}`)
 * after admin changes category visibility.
 */
export function getAccommodationTypes(tenantId: string): Promise<SearchAccommodationType[]> {
  return unstable_cache(
    () => fetchAccommodationTypes(tenantId),
    ["accommodation-types", tenantId],
    {
      revalidate: 300,
      tags: [`accommodation-types:${tenantId}`],
    },
  )();
}
