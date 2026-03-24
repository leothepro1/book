export const dynamic = "force-dynamic";

/**
 * Availability API
 * ════════════════
 *
 * Real-time availability search via PMS adapter.
 * GET /api/availability?tenantId=xxx&checkIn=2025-06-01&checkOut=2025-06-05&guests=2
 *
 * Never cached — availability is always fresh from PMS.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import type { AvailabilityEntry, Restriction } from "@/app/_lib/integrations/types";
import { prisma } from "@/app/_lib/db/prisma";
import { validateStayDates } from "@/app/_lib/validation/dates";

const paramsSchema = z.object({
  tenantId: z.string().min(1, "tenantId krävs"),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ogiltigt datumformat (YYYY-MM-DD)"),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ogiltigt datumformat (YYYY-MM-DD)"),
  guests: z.coerce.number().int().min(1, "Minst 1 gäst").max(99),
  types: z.string().optional(), // comma-separated: "CAMPING,HOTEL"
  typeId: z.string().optional(), // collection ID (isAccommodationType=true)
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams);

  const parsed = paramsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_PARAMS",
        fields: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { tenantId, guests, types } = parsed.data;

  // Validate dates via shared utility
  const dateCheck = validateStayDates(parsed.data.checkIn, parsed.data.checkOut);
  if (!dateCheck.valid) {
    return NextResponse.json(
      { error: "INVALID_PARAMS", fields: [{ field: "checkIn", message: dateCheck.error }] },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { checkIn, checkOut, nights } = dateCheck;
  const typeFilter = types ? types.split(",").filter(Boolean) : undefined;

  // typeId filter: collection-based → look up PMS source IDs
  let pmsSourceIdFilter: string[] | undefined;
  if (parsed.data.typeId) {
    const collectionProducts = await prisma.product.findMany({
      where: {
        tenantId,
        productType: "PMS_ACCOMMODATION",
        collectionItems: { some: { collectionId: parsed.data.typeId } },
      },
      select: { pmsSourceId: true },
    });
    pmsSourceIdFilter = collectionProducts
      .map((p) => p.pmsSourceId)
      .filter((id): id is string => id != null);
  }

  let adapter;
  try {
    adapter = await resolveAdapter(tenantId);
  } catch (err) {
    console.error("[availability] Failed to resolve adapter:", err);
    return NextResponse.json(
      { error: "PMS_UNAVAILABLE", message: "Bokningssystemet är tillfälligt otillgängligt." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Fetch availability and restrictions in parallel
  let availabilityResult;
  let restrictions: Restriction[];
  try {
    [availabilityResult, restrictions] = await Promise.all([
      adapter.getAvailability(tenantId, {
        checkIn,
        checkOut,
        guests,
        types: typeFilter,
      }),
      adapter.getRestrictions(tenantId, checkIn, checkOut),
    ]);
  } catch (err) {
    console.error("[availability] PMS query failed:", err);
    return NextResponse.json(
      { error: "PMS_UNAVAILABLE", message: "Kunde inte hämta tillgänglighet. Försök igen." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Build restriction map: categoryId → Restriction[]
  const restrictionMap = new Map<string, Restriction[]>();
  for (const r of restrictions) {
    const key = r.categoryExternalId ?? "__all";
    const list = restrictionMap.get(key) ?? [];
    list.push(r);
    restrictionMap.set(key, list);
  }

  // Apply restriction filtering
  // Filter by collection-based typeId if specified
  const filteredCategories = pmsSourceIdFilter
    ? availabilityResult.categories.filter((entry: AvailabilityEntry) =>
        pmsSourceIdFilter.includes(entry.category.externalId),
      )
    : availabilityResult.categories;

  const results = filteredCategories.map((entry: AvailabilityEntry) => {
    const catRestrictions = [
      ...(restrictionMap.get(entry.category.externalId) ?? []),
      ...(restrictionMap.get("__all") ?? []),
    ];

    const violations: string[] = [];
    let available = entry.availableUnits > 0 && entry.ratePlans.length > 0;

    for (const r of catRestrictions) {
      if (r.minStay != null && nights < r.minStay) {
        violations.push(`Minsta vistelse ${r.minStay} nätter`);
      }
      if (r.maxStay != null && nights > r.maxStay) {
        violations.push(`Maximalt ${r.maxStay} nätter`);
      }
      // CTA on check-in date
      const rDate = new Date(r.date);
      rDate.setHours(0, 0, 0, 0);
      if (r.closedToArrival && rDate.getTime() === checkIn.getTime()) {
        available = false;
        violations.push("Incheckning ej möjlig detta datum");
      }
      // CTD on check-out date
      if (r.closedToDeparture && rDate.getTime() === checkOut.getTime()) {
        available = false;
        violations.push("Utcheckning ej möjlig detta datum");
      }
    }

    // Hard restriction = unavailable
    if (violations.some((v) => v.includes("ej möjlig"))) {
      available = false;
    }

    return {
      category: entry.category,
      ratePlans: entry.ratePlans.map((rp) => ({
        ...rp,
        nightlyAmount: rp.pricePerNight,
        totalAmount: rp.totalPrice,
      })),
      availableUnits: entry.availableUnits,
      available,
      restrictionViolations: violations,
    };
  });

  return NextResponse.json(
    {
      results,
      searchParams: {
        checkIn: parsed.data.checkIn,
        checkOut: parsed.data.checkOut,
        guests,
        nights,
      },
      tenantId,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
