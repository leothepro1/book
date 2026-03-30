export const dynamic = "force-dynamic";

/**
 * Accommodation Addons API
 * ════════════════════════
 *
 * GET /api/accommodations/:id/addons?tenantId=...
 *
 * Returns all available addon products for an accommodation.
 * No auth — same pattern as /api/availability.
 */

import { NextResponse } from "next/server";
import { log } from "@/app/_lib/logger";
import { resolveAddonsForAccommodation } from "@/app/_lib/accommodations/addons";

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
    const addons = await resolveAddonsForAccommodation(id, tenantId);
    return NextResponse.json(
      { addons, total: addons.length },
      { headers: NO_STORE },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "api.accommodations.addons_failed", { tenantId, id, error: msg });
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Kunde inte hämta tilläggsprodukter." },
      { status: 500, headers: NO_STORE },
    );
  }
}
