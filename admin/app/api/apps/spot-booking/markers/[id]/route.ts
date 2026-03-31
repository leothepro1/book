/**
 * Spot Booking — Update / Delete Marker
 *
 * PATCH /api/apps/spot-booking/markers/[id] — update label/position
 * DELETE /api/apps/spot-booking/markers/[id] — delete + restore visibleInSearch
 *
 * Admin-only, tenant-scoped.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";

type RouteCtx = { params: Promise<{ id: string }> };

// ── PATCH ───────────────────────────────────────────────────────

const patchSchema = z.object({
  label: z.string().min(1).max(20).optional(),
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).optional(),
});

export async function PATCH(req: Request, ctx: RouteCtx) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantData = await getCurrentTenant();
  if (!tenantData) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tenantId = tenantData.tenant.id;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fields: parsed.error.issues },
      { status: 400 },
    );
  }

  // Verify marker belongs to tenant
  const marker = await prisma.spotMarker.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  if (!marker) {
    return NextResponse.json({ error: "Markering hittades inte" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.label !== undefined) data.label = parsed.data.label;
  if (parsed.data.x !== undefined) data.x = parsed.data.x;
  if (parsed.data.y !== undefined) data.y = parsed.data.y;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Inget att uppdatera" }, { status: 400 });
  }

  const updated = await prisma.spotMarker.update({
    where: { id },
    data,
    include: {
      accommodation: {
        select: { id: true, name: true, slug: true },
      },
    },
  });

  return NextResponse.json({
    marker: {
      id: updated.id,
      label: updated.label,
      x: updated.x,
      y: updated.y,
      accommodationId: updated.accommodationId,
      accommodationName: updated.accommodation.name,
      accommodationSlug: updated.accommodation.slug,
    },
  });
}

// ── DELETE ───────────────────────────────────────────────────────

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantData = await getCurrentTenant();
  if (!tenantData) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tenantId = tenantData.tenant.id;
  const { id } = await ctx.params;

  // Load marker with tenant isolation
  const marker = await prisma.spotMarker.findFirst({
    where: { id, tenantId },
    select: { id: true, accommodationId: true, spotMapId: true },
  });
  if (!marker) {
    return NextResponse.json({ error: "Markering hittades inte" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    // Delete the marker
    await tx.spotMarker.delete({ where: { id: marker.id } });

    // Restore visibleInSearch only if this accommodation is not
    // used in any OTHER SpotMarker (across all maps for this tenant)
    const otherUsage = await tx.spotMarker.count({
      where: {
        accommodationId: marker.accommodationId,
        id: { not: marker.id },
      },
    });

    if (otherUsage === 0) {
      await tx.accommodation.update({
        where: { id: marker.accommodationId },
        data: { visibleInSearch: true },
      });
    }
  });

  log("info", "spot_booking.marker_deleted", {
    tenantId,
    markerId: marker.id,
    accommodationId: marker.accommodationId,
  });

  return NextResponse.json({ success: true });
}
