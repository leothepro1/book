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
import { resolveMarkerPrice } from "@/app/_lib/apps/spot-booking/pricing";
import { isAvailableForDates } from "@/app/_lib/integrations/adapters/fake";

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
      title: true,
      subtitle: true,
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
          priceOverride: true,
          color: true,
          accommodation: {
            select: {
              id: true,
              externalId: true,
              name: true,
              categoryItems: {
                select: {
                  category: { select: { pmsRef: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!spotMap) {
    return NextResponse.json({ spotMap: null }, { headers: NO_STORE });
  }

  // Resolve availability per marker using externalId as seed
  const checkInDate = new Date(checkIn + "T00:00:00");
  const checkOutDate = new Date(checkOut + "T00:00:00");

  return NextResponse.json(
    {
      spotMap: {
        id: spotMap.id,
        title: spotMap.title,
        subtitle: spotMap.subtitle,
        imageUrl: spotMap.imageUrl,
        addonPrice: spotMap.addonPrice,
        currency: spotMap.currency,
        markers: spotMap.markers.map((m) => ({
          id: m.id,
          label: m.label,
          x: m.x,
          y: m.y,
          accommodationId: m.accommodationId,
          accommodationName: m.accommodation.name,
          effectivePrice: resolveMarkerPrice(m.priceOverride, spotMap.addonPrice),
          color: m.color ?? null,
          available: m.accommodation.externalId
            ? isAvailableForDates(m.accommodation.externalId, checkInDate, checkOutDate)
            : true,
        })),
      },
    },
    { headers: NO_STORE },
  );
}
