/**
 * Spot Booking — Map Data
 *
 * GET /api/apps/spot-booking/map?mapId=xxx
 *
 * Returns a specific SpotMap with all markers and available accommodations
 * for the map editor. Admin-only, tenant-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantData = await getCurrentTenant();
  if (!tenantData) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tenantId = tenantData.tenant.id;
  const mapId = request.nextUrl.searchParams.get("mapId");

  if (!mapId) {
    return NextResponse.json(
      { error: "mapId query parameter is required" },
      { status: 400 },
    );
  }

  // Load SpotMap by ID with tenant isolation
  const spotMap = await prisma.spotMap.findFirst({
    where: { id: mapId, tenantId },
    include: {
      markers: {
        include: {
          accommodation: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      accommodationCategory: {
        select: { id: true, title: true },
      },
    },
  });

  if (!spotMap) {
    log("warn", "spot_booking.map_not_found", { tenantId });
    return NextResponse.json({ error: "No map configured" }, { status: 404 });
  }

  // Load all tenant accommodations available for linking
  // (not archived, sorted by name)
  const accommodations = await prisma.accommodation.findMany({
    where: {
      tenantId,
      archivedAt: null,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      externalCode: true,
    },
    orderBy: { name: "asc" },
  });

  // Build set of already-linked accommodation IDs
  const linkedIds = new Set(spotMap.markers.map((m) => m.accommodationId));

  return NextResponse.json({
    spotMap: {
      id: spotMap.id,
      imageUrl: spotMap.imageUrl,
      imagePublicId: spotMap.imagePublicId,
      addonPrice: spotMap.addonPrice,
      currency: spotMap.currency,
      isActive: spotMap.isActive,
      category: spotMap.accommodationCategory,
    },
    markers: spotMap.markers.map((m) => ({
      id: m.id,
      label: m.label,
      x: m.x,
      y: m.y,
      accommodationId: m.accommodationId,
      accommodationName: m.accommodation.name,
      accommodationSlug: m.accommodation.slug,
      priceOverride: m.priceOverride ?? null,
      color: m.color ?? null,
    })),
    accommodations: accommodations.map((a) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      externalCode: a.externalCode,
      linked: linkedIds.has(a.id),
    })),
  });
}
