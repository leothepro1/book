export const dynamic = "force-dynamic";

/**
 * Availability API
 * ════════════════
 *
 * Real-time availability search via PMS adapter.
 * GET /api/availability?tenantId=xxx&checkIn=2025-06-01&checkOut=2025-06-05&guests=2
 *
 * Never cached — availability is always fresh from PMS.
 *
 * Filtering:
 *   typeId — AccommodationType enum value (e.g. "HOTEL") OR legacy ProductCollection.id
 *   types  — comma-separated AccommodationType values (e.g. "CAMPING,HOTEL")
 *
 * Response enrichment:
 *   Each result entry includes accommodationId (FK to Accommodation table)
 *   for direct linking without a second lookup.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import type { AvailabilityEntry, Restriction } from "@/app/_lib/integrations/types";
import { prisma } from "@/app/_lib/db/prisma";
import { validateStayDates } from "@/app/_lib/validation/dates";
import { log } from "@/app/_lib/logger";
import { AccommodationType } from "@prisma/client";

const VALID_ACCOMMODATION_TYPES = new Set<string>(Object.values(AccommodationType));
const NO_STORE = { "Cache-Control": "no-store" };

const paramsSchema = z.object({
  tenantId: z.string().min(1, "tenantId krävs"),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ogiltigt datumformat (YYYY-MM-DD)"),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ogiltigt datumformat (YYYY-MM-DD)"),
  guests: z.coerce.number().int().min(1, "Minst 1 gäst").max(99),
  types: z.string().optional(), // comma-separated: "CAMPING,HOTEL"
  typeId: z.string().optional(), // AccommodationType value OR legacy collection ID
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
      { status: 400, headers: NO_STORE },
    );
  }

  const { tenantId, guests, types } = parsed.data;

  // Validate dates via shared utility
  const dateCheck = validateStayDates(parsed.data.checkIn, parsed.data.checkOut);
  if (!dateCheck.valid) {
    return NextResponse.json(
      { error: "INVALID_PARAMS", fields: [{ field: "checkIn", message: dateCheck.error }] },
      { status: 400, headers: NO_STORE },
    );
  }
  const { checkIn, checkOut, nights } = dateCheck;

  // ── Build type filter for adapter call ──────────────────────────
  const typeFilter = types ? types.split(",").filter(Boolean) : undefined;

  // ── Build externalId filter from typeId or types param ──────────
  let externalIdFilter: string[] | undefined;

  if (parsed.data.typeId) {
    const typeId = parsed.data.typeId;

    if (VALID_ACCOMMODATION_TYPES.has(typeId)) {
      // A) typeId is a valid AccommodationType — query Accommodation table
      const accommodations = await prisma.accommodation.findMany({
        where: {
          tenantId,
          status: "ACTIVE",
          visibleInSearch: true,
          accommodationType: typeId as AccommodationType,
        },
        select: { externalId: true },
      });
      externalIdFilter = accommodations
        .map((a) => a.externalId)
        .filter((id): id is string => id != null);
    } else {
      // Unknown typeId — not an AccommodationType, no longer falls back to ProductCollection
      log("warn", "availability.unknown_type_id", { tenantId, typeId });
      externalIdFilter = []; // empty = no results
    }
  } else if (typeFilter && typeFilter.length > 0) {
    // C) types param — validate and filter via Accommodation table
    const validTypes = typeFilter.filter((t) => VALID_ACCOMMODATION_TYPES.has(t));
    if (validTypes.length > 0) {
      const accommodations = await prisma.accommodation.findMany({
        where: {
          tenantId,
          status: "ACTIVE",
          visibleInSearch: true,
          accommodationType: { in: validTypes as AccommodationType[] },
        },
        select: { externalId: true },
      });
      externalIdFilter = accommodations
        .map((a) => a.externalId)
        .filter((id): id is string => id != null);
    }
  }
  // D) Neither typeId nor types — no filtering (all categories returned)

  // ── Resolve PMS adapter ─────────────────────────────────────────
  let adapter;
  try {
    adapter = await resolveAdapter(tenantId);
  } catch (err) {
    log("error", "availability.resolve_adapter_failed", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "PMS_UNAVAILABLE", message: "Bokningssystemet är tillfälligt otillgängligt." },
      { status: 503, headers: NO_STORE },
    );
  }

  // ── Fetch availability and restrictions in parallel ─────────────
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
    log("error", "availability.pms_query_failed", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "PMS_UNAVAILABLE", message: "Kunde inte hämta tillgänglighet. Försök igen." },
      { status: 503, headers: NO_STORE },
    );
  }

  // ── Apply externalId filtering ──────────────────────────────────
  const filteredCategories = externalIdFilter
    ? availabilityResult.categories.filter((entry: AvailabilityEntry) =>
        externalIdFilter.includes(entry.category.externalId),
      )
    : availabilityResult.categories;

  // ── Build restriction map ───────────────────────────────────────
  const restrictionMap = new Map<string, Restriction[]>();
  for (const r of restrictions) {
    const key = r.categoryExternalId ?? "__all";
    const list = restrictionMap.get(key) ?? [];
    list.push(r);
    restrictionMap.set(key, list);
  }

  // ── Batch lookup: externalId → Accommodation.id ─────────────────
  const categoryExternalIds = filteredCategories
    .map((entry: AvailabilityEntry) => entry.category.externalId)
    .filter(Boolean);

  const accommodationRows = categoryExternalIds.length > 0
    ? await prisma.accommodation.findMany({
        where: {
          tenantId,
          externalId: { in: categoryExternalIds },
          status: "ACTIVE",
          visibleInSearch: true,
        },
        select: { id: true, externalId: true },
      })
    : [];

  const accommodationIdMap = new Map<string, string>();
  for (const row of accommodationRows) {
    if (row.externalId) {
      accommodationIdMap.set(row.externalId, row.id);
    }
  }

  // ── Exclude hidden accommodations (visibleInSearch = false) ────
  // The batch lookup only returned visible accommodations. When no
  // externalIdFilter was applied, we also need to exclude entries
  // that map to hidden accommodations. We query for hidden ones and
  // remove them from the results.
  let hiddenExternalIds: Set<string> | null = null;
  if (!externalIdFilter && categoryExternalIds.length > 0) {
    const hiddenRows = await prisma.accommodation.findMany({
      where: {
        tenantId,
        externalId: { in: categoryExternalIds },
        status: "ACTIVE",
        visibleInSearch: false,
      },
      select: { externalId: true },
    });
    if (hiddenRows.length > 0) {
      hiddenExternalIds = new Set(
        hiddenRows.map((r) => r.externalId).filter((id): id is string => id != null),
      );
    }
  }

  const visibleCategories = hiddenExternalIds
    ? filteredCategories.filter(
        (entry: AvailabilityEntry) => !hiddenExternalIds!.has(entry.category.externalId),
      )
    : filteredCategories;

  // ── Build results ───────────────────────────────────────────────
  const results = visibleCategories.map((entry: AvailabilityEntry) => {
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
      accommodationId: accommodationIdMap.get(entry.category.externalId) ?? null,
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
    { headers: NO_STORE },
  );
}
