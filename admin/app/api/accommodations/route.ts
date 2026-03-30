export const dynamic = "force-dynamic";

/**
 * Accommodations List API
 * ═══════════════════════
 *
 * GET /api/accommodations?tenantId=xxx&type=HOTEL,CABIN&status=ACTIVE
 *
 * Canonical read endpoint for accommodations. Used by admin UI and guest portal.
 * No auth required — same pattern as /api/availability.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { ACCOMMODATION_SELECT } from "@/app/_lib/accommodations/types";
import { resolveAccommodation } from "@/app/_lib/accommodations/resolve";
import type { AccommodationWithRelations } from "@/app/_lib/accommodations/types";
import { AccommodationType, AccommodationStatus } from "@prisma/client";

const VALID_TYPES = new Set<string>(Object.values(AccommodationType));
const VALID_STATUSES = new Set<string>(Object.values(AccommodationStatus));
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");

  if (!tenantId) {
    return NextResponse.json(
      { error: "INVALID_PARAMS", message: "tenantId krävs" },
      { status: 400, headers: NO_STORE },
    );
  }

  // Validate tenant exists
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) {
    return NextResponse.json(
      { error: "INVALID_PARAMS", message: "Tenant hittades inte" },
      { status: 400, headers: NO_STORE },
    );
  }

  // Parse type filter
  const typeParam = url.searchParams.get("type");
  let typeFilter: AccommodationType[] | undefined;
  if (typeParam) {
    const types = typeParam.split(",").filter(Boolean);
    for (const t of types) {
      if (!VALID_TYPES.has(t)) {
        return NextResponse.json(
          { error: "INVALID_PARAMS", message: `Ogiltig boendetyp: "${t}". Giltiga: ${[...VALID_TYPES].join(", ")}` },
          { status: 400, headers: NO_STORE },
        );
      }
    }
    typeFilter = types as AccommodationType[];
  }

  // Parse status filter
  const statusParam = url.searchParams.get("status") ?? "ACTIVE";
  if (!VALID_STATUSES.has(statusParam)) {
    return NextResponse.json(
      { error: "INVALID_PARAMS", message: `Ogiltig status: "${statusParam}"` },
      { status: 400, headers: NO_STORE },
    );
  }
  const statusFilter = statusParam as AccommodationStatus;

  // Parse includeArchived
  const includeArchived = url.searchParams.get("includeArchived") === "true";

  // Build where clause
  const where: Record<string, unknown> = {
    tenantId,
    status: statusFilter,
  };
  if (!includeArchived) {
    where.archivedAt = null;
  }
  if (typeFilter && typeFilter.length > 0) {
    where.accommodationType = { in: typeFilter };
  }

  try {
    const rows = await prisma.accommodation.findMany({
      where,
      select: ACCOMMODATION_SELECT,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    const accommodations = rows.map((row) =>
      resolveAccommodation(row as unknown as AccommodationWithRelations),
    );

    return NextResponse.json(
      { accommodations, total: accommodations.length },
      { headers: NO_STORE },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "api.accommodations.list_failed", { tenantId, error: msg });
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Kunde inte hämta boenden." },
      { status: 500, headers: NO_STORE },
    );
  }
}
