/**
 * Tenant-scoped database access for AccessPass.
 *
 * EVERY query in this module includes tenantId in its WHERE clause.
 * There are ZERO code paths that can leak data across tenants.
 *
 * Status filtering uses DB-level WHERE clauses for scalability.
 * We translate EffectiveStatus into SQL conditions rather than
 * fetching all rows and filtering in memory.
 */

import { prisma } from "@/app/_lib/db/prisma";
import type {
  AccessPass,
  AccessPassEvent,
  AccessPassType,
  Prisma,
} from "@prisma/client";
import type {
  ListPassesFilter,
  PassWithEvents,
  EffectiveStatus,
} from "./types";
import { computeEffectiveStatus } from "./core";

// ── Status → SQL translation ────────────────────────────────────────

/**
 * Translate an EffectiveStatus into a Prisma WHERE clause.
 *
 * This pushes filtering to the DB instead of loading all rows into memory.
 * Critical for tenants with thousands of passes.
 *
 * Priority matches computeEffectiveStatus:
 *  1. REVOKED: revokedAt IS NOT NULL
 *  2. EXPIRED: revokedAt IS NULL AND validTo <= now
 *  3. PENDING: revokedAt IS NULL AND validFrom > now (implicitly validTo > now)
 *  4. ACTIVE:  revokedAt IS NULL AND validFrom <= now AND validTo > now
 */
function statusToWhere(
  status: EffectiveStatus,
  now: Date,
): Prisma.AccessPassWhereInput {
  switch (status) {
    case "REVOKED":
      return { revokedAt: { not: null } };
    case "EXPIRED":
      return { revokedAt: null, validTo: { lte: now } };
    case "PENDING":
      return { revokedAt: null, validFrom: { gt: now } };
    case "ACTIVE":
      return { revokedAt: null, validFrom: { lte: now }, validTo: { gt: now } };
  }
}

// ── Single pass queries ─────────────────────────────────────────────

export async function findPassById(
  tenantId: string,
  passId: string,
): Promise<AccessPass | null> {
  return prisma.accessPass.findFirst({
    where: { id: passId, tenantId },
  });
}

export async function findPassByIdWithEvents(
  tenantId: string,
  passId: string,
): Promise<PassWithEvents | null> {
  return prisma.accessPass.findFirst({
    where: { id: passId, tenantId },
    include: {
      events: {
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function findPassByBookingAndType(
  tenantId: string,
  bookingId: string,
  type: AccessPassType,
): Promise<AccessPass | null> {
  return prisma.accessPass.findFirst({
    where: { tenantId, bookingId, type },
  });
}

// ── List queries ────────────────────────────────────────────────────

/**
 * List passes for a tenant with optional filters.
 *
 * Status filtering is done at the DB level for scalability.
 * The returned effectiveStatus is still computed in code to guarantee
 * consistency with computeEffectiveStatus (single source of truth).
 */
export async function listPasses(
  filter: ListPassesFilter,
): Promise<(AccessPass & { effectiveStatus: EffectiveStatus })[]> {
  const now = new Date();

  const where: Prisma.AccessPassWhereInput = {
    tenantId: filter.tenantId,
  };

  if (filter.bookingId) where.bookingId = filter.bookingId;
  if (filter.guestId) where.guestId = filter.guestId;
  if (filter.type) where.type = filter.type;
  if (filter.status) Object.assign(where, statusToWhere(filter.status, now));

  const passes = await prisma.accessPass.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return passes.map((p) => ({
    ...p,
    effectiveStatus: computeEffectiveStatus(p, now),
  }));
}

// ── Event queries ───────────────────────────────────────────────────

export async function listEventsForPass(
  tenantId: string,
  passId: string,
): Promise<AccessPassEvent[]> {
  return prisma.accessPassEvent.findMany({
    where: { tenantId, passId },
    orderBy: { createdAt: "desc" },
  });
}

// ── Aggregate queries ───────────────────────────────────────────────

export async function countPassesByBooking(
  tenantId: string,
  bookingId: string,
): Promise<number> {
  return prisma.accessPass.count({
    where: { tenantId, bookingId },
  });
}
