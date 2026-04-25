/**
 * checkAvailability — read-only PMS peek.
 *
 * Returns Result-shape (never throws). Used pre-Save by /draft-orders/new
 * to flag conflicting lines, and pre-tx in createDraftWithLines as
 * race-defense before draft creation.
 *
 * Tenant-scope is mandatory: accommodation that doesn't belong to the
 * tenant returns TENANT_MISMATCH (treated as unavailable). Adapter
 * failures degrade to "PMS unreachable" — never throws to caller.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { DRAFT_ERRORS } from "./errors";

export type AvailabilityResult = {
  available: boolean;
  reason?: string;
  conflictingDates?: Date[];
};

export async function checkAvailability(
  tenantId: string,
  accommodationId: string,
  fromDate: Date,
  toDate: Date,
): Promise<AvailabilityResult> {
  // Date sanity (cheap before DB).
  if (toDate <= fromDate) {
    return { available: false, reason: DRAFT_ERRORS.INVALID_DATE_RANGE };
  }

  // Tenant-scope check on accommodation.
  const accommodation = await prisma.accommodation.findFirst({
    where: { id: accommodationId, tenantId },
    select: { externalId: true, status: true, archivedAt: true },
  });
  if (!accommodation) {
    return { available: false, reason: DRAFT_ERRORS.TENANT_MISMATCH };
  }
  if (accommodation.status !== "ACTIVE" || accommodation.archivedAt !== null) {
    return { available: false, reason: "Boendet är inte aktivt" };
  }
  if (!accommodation.externalId) {
    // No PMS-mapping → cannot verify. Default to available (fallback).
    return { available: true };
  }

  // Resolve adapter (cached 5min).
  let adapter;
  try {
    adapter = await resolveAdapter(tenantId);
  } catch {
    return { available: false, reason: "PMS unreachable" };
  }

  // PMS peek.
  try {
    const result = await adapter.getUnitAvailability(
      tenantId,
      [accommodation.externalId],
      fromDate,
      toDate,
    );
    const isAvailable = result.get(accommodation.externalId) ?? false;
    return isAvailable
      ? { available: true }
      : { available: false, reason: "Inte tillgängligt för valda datum" };
  } catch {
    return { available: false, reason: "PMS unreachable" };
  }
}
