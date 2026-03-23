export const dynamic = "force-dynamic";

/**
 * Media API — Stats
 *
 * GET /api/media/stats
 * Returns total count and per-folder breakdown.
 */

import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getMediaStats } from "@/app/_lib/media";

export async function GET() {
  try {
    const tenantData = await getCurrentTenant();
    if (!tenantData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stats = await getMediaStats(tenantData.tenant.id);
    return NextResponse.json({ ...stats, tenantSlug: tenantData.tenant.slug });
  } catch (error) {
    console.error("[Media API] Stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
