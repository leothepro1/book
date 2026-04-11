/**
 * Spot Booking — Create Marker
 *
 * POST /api/apps/spot-booking/markers
 *
 * Creates a SpotMarker linked to an accommodation
 * to false atomically. Admin-only, tenant-scoped.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";

const bodySchema = z.object({
  spotMapId: z.string().min(1),
  accommodationId: z.string().min(1),
  accommodationUnitId: z.string().optional(),
  label: z.string().min(1).max(20),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantData = await getCurrentTenant();
  if (!tenantData) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tenantId = tenantData.tenant.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fields: parsed.error.issues },
      { status: 400 },
    );
  }

  const { spotMapId, accommodationId, accommodationUnitId, label, x, y } = parsed.data;

  // Verify SpotMap belongs to tenant
  const spotMap = await prisma.spotMap.findFirst({
    where: { id: spotMapId, tenantId },
    select: { id: true },
  });
  if (!spotMap) {
    return NextResponse.json({ error: "Kartan hittades inte" }, { status: 404 });
  }

  // Verify Accommodation belongs to tenant
  const accommodation = await prisma.accommodation.findFirst({
    where: { id: accommodationId, tenantId },
    select: { id: true, name: true, slug: true },
  });
  if (!accommodation) {
    return NextResponse.json(
      { error: "Boendet hittades inte" },
      { status: 404 },
    );
  }

  // Verify accommodation is assigned to this SpotMap
  const mapLink = await prisma.spotMapAccommodation.findFirst({
    where: { spotMapId, accommodationId },
    select: { id: true },
  });
  if (!mapLink) {
    return NextResponse.json(
      { error: "Boendet ar inte kopplat till denna karta" },
      { status: 400 },
    );
  }

  // Create marker + hide accommodation atomically
  try {
    const marker = await prisma.$transaction(async (tx) => {
      const created = await tx.spotMarker.create({
        data: {
          tenantId,
          spotMapId,
          accommodationId,
          accommodationUnitId: accommodationUnitId ?? null,
          label,
          x,
          y,
        },
      });

      return created;
    });

    log("info", "spot_booking.marker_created", {
      tenantId,
      markerId: marker.id,
      spotMapId,
      accommodationId,
    });

    return NextResponse.json({
      marker: {
        id: marker.id,
        label: marker.label,
        x: marker.x,
        y: marker.y,
        accommodationId: marker.accommodationId,
        accommodationName: accommodation.name,
        accommodationSlug: accommodation.slug,
      },
    });
  } catch (err) {
    // Handle unique constraint violation (accommodation already linked)
    if (
      err instanceof Error &&
      err.message.includes("Unique constraint")
    ) {
      return NextResponse.json(
        { error: "Denna plats ar redan utmarkerad" },
        { status: 409 },
      );
    }

    log("error", "spot_booking.marker_create_failed", {
      tenantId,
      spotMapId,
      accommodationId,
      error: err instanceof Error ? err.message : String(err),
    });

    return NextResponse.json(
      { error: "Kunde inte skapa markering" },
      { status: 500 },
    );
  }
}
