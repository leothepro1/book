export const dynamic = "force-dynamic";

/**
 * GET /api/portal/spot-booking/map
 * ════════════════════════════════
 *
 * Guest portal endpoint — returns the SpotMap with markers
 * and availability status for the given dates.
 *
 * Calls adapter.getAvailability() ONCE for all markers.
 * Tenant resolved from Host header — never from body.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { log } from "@/app/_lib/logger";

const NO_STORE = { "Cache-Control": "no-store" };

const paramsSchema = z.object({
  accommodationCategoryId: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).max(99),
});

export async function GET(req: Request) {
  const tenant = await resolveTenantFromHost();
  if (!tenant) {
    return NextResponse.json({ spotMap: null }, { headers: NO_STORE });
  }

  const tenantId = tenant.id;
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams);

  const parsed = paramsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_PARAMS" },
      { status: 400, headers: NO_STORE },
    );
  }

  const { accommodationCategoryId, checkIn, checkOut, adults } = parsed.data;

  // Load active SpotMap for this category + tenant
  const spotMap = await prisma.spotMap.findFirst({
    where: {
      tenantId,
      accommodationCategoryId,
      isActive: true,
    },
    select: {
      id: true,
      imageUrl: true,
      addonPrice: true,
      currency: true,
      markers: {
        select: {
          id: true,
          label: true,
          x: true,
          y: true,
          accommodationId: true,
          accommodation: {
            select: { id: true, externalId: true, name: true },
          },
        },
      },
    },
  });

  if (!spotMap) {
    return NextResponse.json({ spotMap: null }, { headers: NO_STORE });
  }

  // Get availability from PMS — ONCE for all markers
  let availableExternalIds = new Set<string>();

  try {
    const adapter = await resolveAdapter(tenantId);
    const checkInDate = new Date(checkIn + "T00:00:00");
    const checkOutDate = new Date(checkOut + "T00:00:00");

    const result = await adapter.getAvailability(tenantId, {
      checkIn: checkInDate,
      checkOut: checkOutDate,
      guests: adults,
    });

    for (const entry of result.categories) {
      if (entry.availableUnits > 0 && entry.ratePlans.length > 0) {
        availableExternalIds.add(entry.category.externalId);
      }
    }
  } catch (err) {
    // Degrade gracefully — all markers shown as unavailable
    log("error", "spot_booking.portal_availability_failed", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json(
    {
      spotMap: {
        id: spotMap.id,
        imageUrl: spotMap.imageUrl,
        addonPrice: spotMap.addonPrice,
        currency: spotMap.currency,
        markers: spotMap.markers.map((m) => ({
          id: m.id,
          label: m.label,
          x: m.x,
          y: m.y,
          accommodationId: m.accommodationId,
          available: m.accommodation.externalId
            ? availableExternalIds.has(m.accommodation.externalId)
            : false,
        })),
      },
    },
    { headers: NO_STORE },
  );
}
