import { notFound, redirect } from "next/navigation";
import { resolveTenantFromHost } from "../../_lib/tenant/resolveTenantFromHost";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { prisma } from "@/app/_lib/db/prisma";
import { ACCOMMODATION_SELECT } from "@/app/_lib/accommodations/types";
import { resolveAccommodation } from "@/app/_lib/accommodations/resolve";
import type { AccommodationWithRelations } from "@/app/_lib/accommodations/types";
import { RoomDetailClient } from "./RoomDetailClient";

export const dynamic = "force-dynamic";

/**
 * Accommodation Detail Page
 * ═════════════════════════
 *
 * /stays/[slug] — serves both new slug-based URLs and legacy
 * PMS externalId-based URLs.
 *
 * Lookup order:
 * 1. Try Accommodation by slug (new canonical URLs)
 * 2. Try Accommodation by externalId (legacy /stays/{pmsExternalId} URLs)
 * 3. Fall back to PMS adapter for unsynced categories
 */
export default async function RoomDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const tenant = await resolveTenantFromHost();
  if (!tenant) return notFound();

  const checkIn = sp.checkIn;
  const checkOut = sp.checkOut;
  const guests = sp.guests ? parseInt(sp.guests, 10) : null;

  if (!checkIn || !checkOut || !guests || guests < 1) {
    redirect("/search");
  }

  // 1. Try Accommodation by slug (new canonical URLs like /stays/hotell-1-4-personer)
  let accommodation = await prisma.accommodation.findFirst({
    where: { tenantId: tenant.id, slug: slug, archivedAt: null, status: "ACTIVE" },
    select: ACCOMMODATION_SELECT,
  });

  // 2. If not found by slug, try by externalId (legacy /stays/room_hotel_standard URLs)
  if (!accommodation) {
    accommodation = await prisma.accommodation.findFirst({
      where: { tenantId: tenant.id, externalId: slug, archivedAt: null, status: "ACTIVE" },
      select: ACCOMMODATION_SELECT,
    });
  }

  // 3. If found an Accommodation, render with its data
  if (accommodation) {
    const resolved = resolveAccommodation(
      accommodation as unknown as AccommodationWithRelations,
    );

    let adapter;
    try {
      adapter = await resolveAdapter(tenant.id);
    } catch {
      return (
        <RoomDetailClient
          category={null}
          ratePlans={[]}
          addons={[]}
          searchParams={{ tenantId: tenant.id, checkIn, checkOut, guests, nights: 0 }}
          available={false}
          error="Bokningssystemet är tillfälligt otillgängligt."
        />
      );
    }

    const externalId = resolved.externalId;
    if (!externalId) return notFound();

    let availabilityResult, addons;
    try {
      [availabilityResult, addons] = await Promise.all([
        adapter.getAvailability(tenant.id, {
          checkIn: new Date(checkIn),
          checkOut: new Date(checkOut),
          guests,
        }),
        adapter.getAddons(tenant.id, externalId),
      ]);
    } catch {
      return (
        <RoomDetailClient
          category={null}
          ratePlans={[]}
          addons={[]}
          searchParams={{ tenantId: tenant.id, checkIn, checkOut, guests, nights: 0 }}
          available={false}
          error="Kunde inte hämta tillgänglighet. Försök igen om en stund."
        />
      );
    }

    const entry = availabilityResult.categories.find(
      (e) => e.category.externalId === externalId,
    );

    const nights = Math.round(
      (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000,
    );

    const category = {
      externalId,
      name: resolved.displayName,
      shortDescription: resolved.displayDescription,
      longDescription: resolved.displayDescription,
      type: resolved.accommodationType,
      imageUrls: resolved.media.map((m) => m.url),
      maxGuests: resolved.maxGuests,
      facilities: resolved.facilities.filter((f) => f.isVisible).map((f) => f.facilityType),
      basePricePerNight: resolved.basePricePerNight,
    };

    return (
      <RoomDetailClient
        category={category}
        ratePlans={entry?.ratePlans ?? []}
        addons={addons}
        searchParams={{ tenantId: tenant.id, checkIn, checkOut, guests, nights }}
        available={(entry?.availableUnits ?? 0) > 0}
        error={undefined}
      />
    );
  }

  // 4. Fall back: try PMS adapter directly (for categories not yet synced to Accommodation)
  let adapter;
  try {
    adapter = await resolveAdapter(tenant.id);
  } catch {
    return (
      <RoomDetailClient
        category={null}
        ratePlans={[]}
        addons={[]}
        searchParams={{ tenantId: tenant.id, checkIn, checkOut, guests, nights: 0 }}
        available={false}
        error="Bokningssystemet är tillfälligt otillgängligt."
      />
    );
  }

  let availabilityResult, roomTypes, addons;
  try {
    [availabilityResult, roomTypes, addons] = await Promise.all([
      adapter.getAvailability(tenant.id, {
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
        guests,
      }),
      adapter.getRoomTypes(tenant.id),
      adapter.getAddons(tenant.id, slug),
    ]);
  } catch {
    return (
      <RoomDetailClient
        category={null}
        ratePlans={[]}
        addons={[]}
        searchParams={{ tenantId: tenant.id, checkIn, checkOut, guests, nights: 0 }}
        available={false}
        error="Kunde inte hämta tillgänglighet. Försök igen om en stund."
      />
    );
  }

  const category = roomTypes.find((c) => c.externalId === slug);
  if (!category) return notFound();

  const entry = availabilityResult.categories.find(
    (e) => e.category.externalId === slug,
  );

  const nights = Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000,
  );

  return (
    <RoomDetailClient
      category={category}
      ratePlans={entry?.ratePlans ?? []}
      addons={addons}
      searchParams={{ tenantId: tenant.id, checkIn, checkOut, guests, nights }}
      available={(entry?.availableUnits ?? 0) > 0}
      error={undefined}
    />
  );
}
