import { notFound, redirect } from "next/navigation";
import { resolveTenantFromHost } from "../../_lib/tenant/resolveTenantFromHost";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { RoomDetailClient } from "./RoomDetailClient";

export const dynamic = "force-dynamic";

export default async function RoomDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ categoryId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { categoryId } = await params;
  const sp = await searchParams;
  const tenant = await resolveTenantFromHost();
  if (!tenant) return notFound();

  const checkIn = sp.checkIn;
  const checkOut = sp.checkOut;
  const guests = sp.guests ? parseInt(sp.guests, 10) : null;

  if (!checkIn || !checkOut || !guests || guests < 1) {
    redirect("/stays");
  }

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
      adapter.getAddons(tenant.id, categoryId),
    ]);
  } catch (err) {
    console.error("[room-detail] PMS query failed:", err);
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

  const category = roomTypes.find((c) => c.externalId === categoryId);
  if (!category) return notFound();

  const entry = availabilityResult.categories.find(
    (e) => e.category.externalId === categoryId,
  );

  const nights = Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000,
  );

  return (
    <RoomDetailClient
      category={{
        externalId: category.externalId,
        name: category.name,
        shortDescription: category.shortDescription,
        longDescription: category.longDescription,
        type: category.type,
        imageUrls: category.imageUrls,
        maxGuests: category.maxGuests,
        facilities: category.facilities,
      }}
      ratePlans={
        entry?.ratePlans.map((rp) => ({
          externalId: rp.externalId,
          name: rp.name,
          description: rp.description,
          cancellationPolicy: rp.cancellationPolicy,
          cancellationDescription: rp.cancellationDescription,
          pricePerNight: rp.pricePerNight,
          totalPrice: rp.totalPrice,
          currency: rp.currency,
          includedAddons: rp.includedAddons,
        })) ?? []
      }
      addons={addons.map((a) => ({
        externalId: a.externalId,
        name: a.name,
        description: a.description,
        price: a.price,
        currency: a.currency,
        pricingMode: a.pricingMode,
      }))}
      searchParams={{ tenantId: tenant.id, checkIn, checkOut, guests, nights }}
      available={entry ? entry.availableUnits > 0 : false}
    />
  );
}
