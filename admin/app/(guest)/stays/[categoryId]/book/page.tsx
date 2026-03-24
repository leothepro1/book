import { notFound, redirect } from "next/navigation";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { BookingFormClient } from "./BookingFormClient";

export const dynamic = "force-dynamic";

export default async function BookPage({
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
  const ratePlanId = sp.ratePlanId;
  const totalAmount = sp.totalAmount ? parseInt(sp.totalAmount, 10) : null;

  if (!checkIn || !checkOut || !guests || !ratePlanId) {
    redirect(`/stays/${categoryId}?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`);
  }

  // Fetch category + rate plan info for display
  const adapter = await resolveAdapter(tenant.id);
  const roomTypes = await adapter.getRoomTypes(tenant.id);
  const category = roomTypes.find((c) => c.externalId === categoryId);
  if (!category) return notFound();

  const nights = Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000,
  );

  // Parse addons from URL
  let addons: Array<{ addonId: string; quantity: number }> = [];
  try {
    if (sp.addons) addons = JSON.parse(sp.addons);
  } catch { /* ignore */ }

  return (
    <BookingFormClient
      tenantId={tenant.id}
      categoryId={categoryId}
      categoryName={category.name}
      ratePlanId={ratePlanId}
      checkIn={checkIn}
      checkOut={checkOut}
      guests={guests}
      nights={nights}
      totalAmount={totalAmount ?? 0}
      addons={addons}
    />
  );
}
