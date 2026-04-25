/**
 * Read-side service for draft-orders admin UI.
 * Returns Result<T,E> shape — matches existing orders/* read pattern.
 * Mutations in lifecycle.ts throw ServiceError — different convention by design.
 */

import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";

// TODO: trigram/GIN index when GuestAccount/Accommodation row counts exceed ~50k.
// Plain ILIKE %q% is acceptable at current scale.

// ── Types ──────────────────────────────────────────────────────

export type CustomerSearchResult = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  draftOrderCount: number;
  orderCount: number;
};

export const SearchCustomersOptionsSchema = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
  })
  .optional();

export type SearchCustomersOptions = z.infer<
  typeof SearchCustomersOptionsSchema
>;

// ── searchCustomers ────────────────────────────────────────────

const DEFAULT_LIMIT = 10;

type GuestRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  /** Deprecated column on GuestAccount, kept for backwards-compat. */
  name: string | null;
  phone: string | null;
  _count: { orders: number };
};

/**
 * Display-name resolution order:
 *   1. firstName + lastName (composed)
 *   2. deprecated `name` column (legacy rows from before split fields)
 *   3. null (caller falls back to email)
 *
 * Phone is returned for display but is NOT a search target — the
 * intent is name/email lookup. See `T-no-phone-search` test.
 */
function buildDisplayName(row: GuestRow): string | null {
  const composed = [row.firstName, row.lastName].filter(Boolean).join(" ");
  if (composed.length > 0) return composed;
  if (row.name && row.name.length > 0) return row.name;
  return null;
}

export async function searchCustomers(
  tenantId: string,
  q: string,
  rawOpts?: SearchCustomersOptions,
): Promise<CustomerSearchResult[]> {
  const opts = SearchCustomersOptionsSchema.parse(rawOpts);
  const trimmed = q.trim();
  if (trimmed.length === 0) return [];

  const limit = opts?.limit ?? DEFAULT_LIMIT;

  const rows = (await prisma.guestAccount.findMany({
    where: {
      tenantId,
      OR: [
        { email: { contains: trimmed, mode: "insensitive" } },
        { firstName: { contains: trimmed, mode: "insensitive" } },
        { lastName: { contains: trimmed, mode: "insensitive" } },
        { name: { contains: trimmed, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      name: true,
      phone: true,
      _count: { select: { orders: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: limit,
  })) as GuestRow[];

  if (rows.length === 0) return [];

  // DraftOrder count is a separate query because GuestAccount.draftOrders is
  // a loose FK (no @relation). One groupBy across all matched IDs.
  const guestIds = rows.map((r) => r.id);
  const draftCounts = await prisma.draftOrder.groupBy({
    by: ["guestAccountId"],
    where: { tenantId, guestAccountId: { in: guestIds } },
    _count: { _all: true },
  });
  const draftCountByGuest = new Map<string, number>();
  for (const row of draftCounts) {
    if (row.guestAccountId) {
      draftCountByGuest.set(row.guestAccountId, row._count._all);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: buildDisplayName(row),
    phone: row.phone,
    draftOrderCount: draftCountByGuest.get(row.id) ?? 0,
    orderCount: row._count.orders,
  }));
}
