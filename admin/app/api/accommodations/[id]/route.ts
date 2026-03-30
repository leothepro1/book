export const dynamic = "force-dynamic";

/**
 * Single Accommodation API
 * ════════════════════════
 *
 * GET /api/accommodations/:id?tenantId=xxx
 *
 * Fetches a single accommodation by ID with full relations.
 * No auth required — same pattern as /api/availability.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { ACCOMMODATION_SELECT } from "@/app/_lib/accommodations/types";
import { resolveAccommodation } from "@/app/_lib/accommodations/resolve";
import type { AccommodationWithRelations } from "@/app/_lib/accommodations/types";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");

  if (!tenantId) {
    return NextResponse.json(
      { error: "INVALID_PARAMS", message: "tenantId krävs" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const row = await prisma.accommodation.findFirst({
      where: { id, tenantId, archivedAt: null },
      select: ACCOMMODATION_SELECT,
    });

    if (!row) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Boendet hittades inte" },
        { status: 404, headers: NO_STORE },
      );
    }

    const accommodation = resolveAccommodation(
      row as unknown as AccommodationWithRelations,
    );

    return NextResponse.json({ accommodation }, { headers: NO_STORE });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "api.accommodations.get_failed", { tenantId, id, error: msg });
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Kunde inte hämta boendet." },
      { status: 500, headers: NO_STORE },
    );
  }
}
