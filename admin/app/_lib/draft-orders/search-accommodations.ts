/**
 * Read-side service for draft-orders admin UI.
 * Returns Result<T,E> shape — matches existing orders/* read pattern.
 * Mutations in lifecycle.ts throw ServiceError — different convention by design.
 */

import { z } from "zod";
import type { AccommodationStatus, AccommodationType } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";

// TODO: trigram/GIN index when GuestAccount/Accommodation row counts exceed ~50k.
// Plain ILIKE %q% is acceptable at current scale.

// ── Types ──────────────────────────────────────────────────────

export type AccommodationSearchResult = {
  id: string;
  name: string;
  type: AccommodationType;
  status: AccommodationStatus;
  basePricePerNight: number;
  currency: string;
};

export const SearchAccommodationsOptionsSchema = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
    statusFilter: z
      .array(z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]))
      .optional(),
  })
  .optional();

export type SearchAccommodationsOptions = z.infer<
  typeof SearchAccommodationsOptionsSchema
>;

// ── searchAccommodations ───────────────────────────────────────

const DEFAULT_LIMIT = 10;
const DEFAULT_STATUS: AccommodationStatus[] = ["ACTIVE"];

export async function searchAccommodations(
  tenantId: string,
  q: string,
  rawOpts?: SearchAccommodationsOptions,
): Promise<AccommodationSearchResult[]> {
  const opts = SearchAccommodationsOptionsSchema.parse(rawOpts);
  const trimmed = q.trim();
  if (trimmed.length === 0) return [];

  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const statusFilter = opts?.statusFilter ?? DEFAULT_STATUS;

  const rows = await prisma.accommodation.findMany({
    where: {
      tenantId,
      archivedAt: null,
      status: { in: statusFilter },
      name: { contains: trimmed, mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      accommodationType: true,
      status: true,
      basePricePerNight: true,
      currency: true,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.accommodationType,
    status: row.status,
    basePricePerNight: row.basePricePerNight,
    currency: row.currency,
  }));
}
