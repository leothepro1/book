/**
 * Spot Booking — Units for a SpotMap
 *
 * GET /api/apps/spot-booking/[mapId]/units
 *
 * Returns AccommodationUnit rows for the accommodations linked to this SpotMap.
 * Used by the editor to refresh units after accommodation changes.
 * Admin-only, tenant-scoped.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { prisma } from "@/app/_lib/db/prisma";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ mapId: string }> };

export async function GET(_req: Request, ctx: RouteCtx) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantData = await getCurrentTenant();
  if (!tenantData) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tenantId = tenantData.tenant.id;
  const { mapId } = await ctx.params;

  // Verify SpotMap belongs to tenant
  const spotMap = await prisma.spotMap.findFirst({
    where: { id: mapId, tenantId },
    select: {
      id: true,
      accommodationItems: {
        select: { accommodationId: true },
      },
      markers: {
        select: { accommodationUnitId: true },
      },
    },
  });

  if (!spotMap) {
    return NextResponse.json({ error: "Kartan hittades inte" }, { status: 404 });
  }

  const linkedAccommodationIds = spotMap.accommodationItems.map((ai) => ai.accommodationId);

  if (linkedAccommodationIds.length === 0) {
    return NextResponse.json({ units: [] });
  }

  const accommodationUnits = await prisma.accommodationUnit.findMany({
    where: {
      tenantId,
      accommodationId: { in: linkedAccommodationIds },
      status: "AVAILABLE",
    },
    select: {
      id: true,
      name: true,
      externalId: true,
      accommodationId: true,
      accommodation: { select: { name: true } },
    },
    orderBy: [{ accommodationId: "asc" }, { name: "asc" }],
  });

  const assignedUnitIds = new Set(
    spotMap.markers.map((m) => m.accommodationUnitId).filter(Boolean),
  );

  return NextResponse.json({
    units: accommodationUnits.map((u) => ({
      id: u.id,
      name: u.name,
      externalId: u.externalId,
      accommodationId: u.accommodationId,
      accommodationName: u.accommodation.name,
      assigned: assignedUnitIds.has(u.id),
    })),
  });
}
