/**
 * Read-side service for draft-orders admin UI.
 * Returns Result<T,E> shape — matches existing orders/* read pattern.
 * Mutations in lifecycle.ts throw ServiceError — different convention by design.
 */

import { z } from "zod";
import type { DraftOrderStatus } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";

// ── Types ──────────────────────────────────────────────────────

export type DraftListSortField =
  | "expiresAt"
  | "createdAt"
  | "updatedAt"
  | "totalAmount";

export type DraftListSortDirection = "asc" | "desc";

export type DraftListFilters = {
  status?: DraftOrderStatus[];
  expiresAtFrom?: Date;
  expiresAtTo?: Date;
  customerEmail?: string;
  /** Free-text — matches displayNumber / contactEmail / first+last name. */
  search?: string;
};

export type DraftListSort = {
  by: DraftListSortField;
  direction: DraftListSortDirection;
};

export type DraftListItem = {
  id: string;
  displayNumber: string;
  status: DraftOrderStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  totalAmount: bigint;
  currency: string;
  customer: {
    id: string | null;
    email: string;
    name: string | null;
  } | null;
  /** Deterministic Swedish summary, e.g. "2× Stuga A, 1× Husvagnsplats". */
  accommodationSummary: string;
  lineCount: number;
};

export type DraftListPage = {
  items: DraftListItem[];
  totalCount: number;
  page: number;
  limit: number;
};

// ── Input validation ───────────────────────────────────────────

export const ListDraftsOptionsSchema = z
  .object({
    filters: z
      .object({
        status: z
          .array(
            z.enum([
              "OPEN",
              "PENDING_APPROVAL",
              "APPROVED",
              "REJECTED",
              "INVOICED",
              "PAID",
              "OVERDUE",
              "COMPLETING",
              "COMPLETED",
              "CANCELLED",
            ]),
          )
          .optional(),
        expiresAtFrom: z.date().optional(),
        expiresAtTo: z.date().optional(),
        customerEmail: z.string().optional(),
        search: z.string().optional(),
      })
      .optional(),
    sort: z
      .object({
        by: z.enum(["expiresAt", "createdAt", "updatedAt", "totalAmount"]),
        direction: z.enum(["asc", "desc"]),
      })
      .optional(),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .optional();

export type ListDraftsOptions = z.infer<typeof ListDraftsOptionsSchema>;

// ── accommodationSummary helper (E3 contract) ──────────────────

const MULTIPLY_SIGN = "×"; // ×

type SummaryLine = {
  lineType: string;
  accommodationId: string | null;
  accommodationName: string | null;
};

/**
 * Deterministic Swedish row-count summary.
 *
 * Format: `"2× Stuga A, 1× Husvagnsplats"`. Truncates after 3 distinct
 * names with `" +N till"` suffix. Lines whose accommodation can't be
 * resolved (orphaned) are excluded from the summary entirely. Empty
 * line set returns `"Inga rader"`.
 *
 * Sort: count desc, then name asc. Stable across runs.
 */
export function computeAccommodationSummary(lines: SummaryLine[]): string {
  if (lines.length === 0) return "Inga rader";

  const counts = new Map<string, number>();
  for (const line of lines) {
    const name = line.accommodationName;
    if (name === null || name.length === 0) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  if (counts.size === 0) return "Inga rader";

  const ordered = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0], "sv");
  });

  const visible = ordered.slice(0, 3);
  const overflow = ordered.length - visible.length;

  const head = visible
    .map(([name, count]) => `${count}${MULTIPLY_SIGN} ${name}`)
    .join(", ");

  return overflow > 0 ? `${head} +${overflow} till` : head;
}

// ── listDrafts ─────────────────────────────────────────────────

const DEFAULT_LIMIT = 25;
const DEFAULT_SORT: DraftListSort = { by: "expiresAt", direction: "asc" };

type DraftRow = {
  id: string;
  displayNumber: string;
  status: DraftOrderStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  totalCents: bigint;
  currency: string;
  guestAccountId: string | null;
  contactEmail: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  lineItems: Array<{
    lineType: string;
    accommodationId: string | null;
    title: string;
  }>;
};

type AccommodationLookup = {
  id: string;
  name: string;
};

function buildCustomerName(
  firstName: string | null,
  lastName: string | null,
): string | null {
  const composed = [firstName, lastName].filter(Boolean).join(" ");
  return composed.length > 0 ? composed : null;
}

export async function listDrafts(
  tenantId: string,
  rawOpts?: ListDraftsOptions,
): Promise<DraftListPage> {
  const opts = ListDraftsOptionsSchema.parse(rawOpts);
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const sort = opts?.sort ?? DEFAULT_SORT;
  const filters = opts?.filters ?? {};

  // Build WHERE — tenant scope is mandatory.
  const where: Record<string, unknown> = { tenantId };

  if (filters.status && filters.status.length > 0) {
    where.status = { in: filters.status };
  }

  if (filters.expiresAtFrom || filters.expiresAtTo) {
    const range: Record<string, Date> = {};
    if (filters.expiresAtFrom) range.gte = filters.expiresAtFrom;
    if (filters.expiresAtTo) range.lte = filters.expiresAtTo;
    where.expiresAt = range;
  }

  if (filters.customerEmail && filters.customerEmail.length > 0) {
    where.contactEmail = {
      contains: filters.customerEmail,
      mode: "insensitive",
    };
  }

  const search = filters.search?.trim();
  if (search && search.length > 0) {
    where.OR = [
      { displayNumber: { contains: search, mode: "insensitive" } },
      { contactEmail: { contains: search, mode: "insensitive" } },
      { contactFirstName: { contains: search, mode: "insensitive" } },
      { contactLastName: { contains: search, mode: "insensitive" } },
    ];
  }

  // Map our public sort field → Prisma column.
  const sortColumn = sort.by === "totalAmount" ? "totalCents" : sort.by;
  const orderBy = [
    { [sortColumn]: sort.direction },
    { id: sort.direction },
  ];

  const [rows, totalCount] = await Promise.all([
    prisma.draftOrder.findMany({
      where,
      select: {
        id: true,
        displayNumber: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        totalCents: true,
        currency: true,
        guestAccountId: true,
        contactEmail: true,
        contactFirstName: true,
        contactLastName: true,
        lineItems: {
          select: {
            lineType: true,
            accommodationId: true,
            title: true,
          },
          orderBy: { position: "asc" },
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.draftOrder.count({ where }),
  ]);

  const typedRows = rows as DraftRow[];

  // Hydrate accommodation names in a single batched query for the
  // whole page — avoids N+1 across the line items.
  const accommodationIds = new Set<string>();
  for (const row of typedRows) {
    for (const line of row.lineItems) {
      if (line.lineType === "ACCOMMODATION" && line.accommodationId) {
        accommodationIds.add(line.accommodationId);
      }
    }
  }

  let accommodationsById: Map<string, string>;
  if (accommodationIds.size > 0) {
    const accommodations = (await prisma.accommodation.findMany({
      where: { tenantId, id: { in: Array.from(accommodationIds) } },
      select: { id: true, name: true },
    })) as AccommodationLookup[];
    accommodationsById = new Map(accommodations.map((a) => [a.id, a.name]));
  } else {
    accommodationsById = new Map();
  }

  const items: DraftListItem[] = typedRows.map((row) => {
    const summaryLines = row.lineItems.map((line) => ({
      lineType: line.lineType,
      accommodationId: line.accommodationId,
      accommodationName:
        line.lineType === "ACCOMMODATION" && line.accommodationId
          ? (accommodationsById.get(line.accommodationId) ?? null)
          : line.title,
    }));

    return {
      id: row.id,
      displayNumber: row.displayNumber,
      status: row.status,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      totalAmount: row.totalCents,
      currency: row.currency,
      customer:
        row.contactEmail !== null
          ? {
              id: row.guestAccountId,
              email: row.contactEmail,
              name: buildCustomerName(
                row.contactFirstName,
                row.contactLastName,
              ),
            }
          : null,
      accommodationSummary: computeAccommodationSummary(summaryLines),
      lineCount: row.lineItems.length,
    };
  });

  return { items, totalCount, page, limit };
}
