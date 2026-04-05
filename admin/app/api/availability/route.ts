export const dynamic = "force-dynamic";

/**
 * Availability API
 * ════════════════
 *
 * Real-time availability search via PMS adapter.
 * GET /api/availability?checkIn=2025-06-01&checkOut=2025-06-05&guests=2
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
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
const NO_STORE = { "Cache-Control": "no-store" };

/** Strip HTML tags for plain-text display. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}
const PMS_TIMEOUT_MS = 8_000;

const paramsSchema = z.object({
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ogiltigt datumformat (YYYY-MM-DD)"),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ogiltigt datumformat (YYYY-MM-DD)"),
  guests: z.coerce.number().int().min(1, "Minst 1 gäst").max(99),
  categories: z.string().optional(), // comma-separated AccommodationCategory IDs
  types: z.string().optional(), // legacy: comma-separated AccommodationType enums
  typeId: z.string().optional(), // legacy: AccommodationType value
});

export async function GET(req: Request) {
  // ── Resolve tenant from Host header — never from query params ──
  const resolvedTenant = await resolveTenantFromHost();
  if (!resolvedTenant) {
    return NextResponse.json(
      { error: "TENANT_NOT_FOUND", message: "Okänd tenant." },
      { status: 401, headers: NO_STORE },
    );
  }
  const tenantId = resolvedTenant.id;

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

  const { guests } = parsed.data;

  // Validate dates via shared utility
  const dateCheck = validateStayDates(parsed.data.checkIn, parsed.data.checkOut);
  if (!dateCheck.valid) {
    return NextResponse.json(
      { error: "INVALID_PARAMS", fields: [{ field: "checkIn", message: dateCheck.error }] },
      { status: 400, headers: NO_STORE },
    );
  }
  const { checkIn, checkOut, nights } = dateCheck;

  // ── Build accommodation filter from visible categories ─────────
  // Only accommodations belonging to visible categories are shown.
  // If specific category IDs are passed, further narrow to those.
  const categoryIds = parsed.data.categories
    ? parsed.data.categories.split(",").filter(Boolean)
    : undefined;

  // Query visible categories (optionally filtered to specific IDs)
  const visibleCategories = await prisma.accommodationCategory.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      visibleInSearch: true,
      ...(categoryIds && categoryIds.length > 0 ? { id: { in: categoryIds } } : {}),
    },
    select: {
      items: {
        select: { accommodation: { select: { externalId: true, status: true } } },
      },
    },
  });

  // Collect externalIds of active accommodations in visible categories
  const visibleExternalIds = new Set<string>();
  for (const cat of visibleCategories) {
    for (const item of cat.items) {
      if (item.accommodation.status === "ACTIVE" && item.accommodation.externalId) {
        visibleExternalIds.add(item.accommodation.externalId);
      }
    }
  }

  // When no visible accommodations exist, use empty array to block all results.
  // undefined would bypass filtering and show everything — never allow that.
  const externalIdFilter = Array.from(visibleExternalIds);

  // Legacy type filter for PMS adapter call
  const typeFilter = parsed.data.types
    ? parsed.data.types.split(",").filter(Boolean)
    : undefined;

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

  // ── Fetch availability and restrictions in parallel (with timeout) ──
  let availabilityResult;
  let restrictions: Restriction[];
  try {
    const pmsPromise = Promise.all([
      adapter.getAvailability(tenantId, {
        checkIn,
        checkOut,
        guests,
        types: typeFilter,
      }),
      adapter.getRestrictions(tenantId, checkIn, checkOut),
    ]);

    const timeoutPromise = new Promise<never>((_, reject) => {
      globalThis.setTimeout(() => reject(new Error("PMS_TIMEOUT")), PMS_TIMEOUT_MS);
    });

    [availabilityResult, restrictions] = await Promise.race([pmsPromise, timeoutPromise]);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg === "PMS_TIMEOUT") {
      log("error", "availability.pms_timeout", {
        tenantId,
        duration: PMS_TIMEOUT_MS,
      });
      // Return empty availability — conservative, never show false positives
      return NextResponse.json(
        {
          results: [],
          searchParams: {
            checkIn: parsed.data.checkIn,
            checkOut: parsed.data.checkOut,
            guests,
            nights,
          },
          tenantId,
        },
        {
          headers: {
            ...NO_STORE,
            "X-Bedfront-Partial": "true",
            "X-Bedfront-Partial-Reason": "PMS_TIMEOUT",
          },
        },
      );
    }

    log("error", "availability.pms_query_failed", {
      tenantId,
      error: errMsg,
    });
    return NextResponse.json(
      { error: "PMS_UNAVAILABLE", message: "Kunde inte hämta tillgänglighet. Försök igen." },
      { status: 503, headers: NO_STORE },
    );
  }

  // ── Apply externalId filtering ──────────────────────────────────
  // Filter PMS results to only include accommodations in visible categories.
  // If externalIdFilter is empty, no accommodations pass — this is intentional
  // (all categories hidden = no results, never show hidden accommodations).
  const filteredCategories = availabilityResult.categories.filter(
    (entry: AvailabilityEntry) => externalIdFilter.includes(entry.category.externalId),
  );

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
        },
        select: {
          id: true,
          externalId: true,
          name: true,
          nameOverride: true,
          description: true,
          descriptionOverride: true,
          maxGuests: true,
        },
      })
    : [];

  const accommodationMap = new Map<string, typeof accommodationRows[number]>();
  for (const row of accommodationRows) {
    if (row.externalId) {
      accommodationMap.set(row.externalId, row);
    }
  }

  // ── Build results ───────────────────────────────────────────────
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

    // Enrich category with tenant-configured data (overrides PMS defaults)
    const acc = accommodationMap.get(entry.category.externalId);
    const rawDesc = acc ? (acc.descriptionOverride ?? acc.description) : "";
    const enrichedCategory = {
      ...entry.category,
      ...(acc ? {
        name: acc.nameOverride ?? acc.name,
        shortDescription: stripHtml(rawDesc),
        longDescription: stripHtml(rawDesc),
        maxGuests: acc.maxGuests,
      } : {}),
    };

    return {
      category: enrichedCategory,
      ratePlans: entry.ratePlans.map((rp) => ({
        ...rp,
        nightlyAmount: rp.pricePerNight,
        totalAmount: rp.totalPrice,
      })),
      availableUnits: entry.availableUnits,
      available,
      restrictionViolations: violations,
      accommodationId: acc?.id ?? null,
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
