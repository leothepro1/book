import { notFound, redirect } from "next/navigation";
import { resolveTenantFromHost } from "../../_lib/tenant/resolveTenantFromHost";
import { getTenantConfig } from "../../_lib/tenant/getTenantConfig";
import { resolveBookingFromToken } from "../../_lib/portal/resolveBooking";
import { getBookingStatus } from "../../_lib/booking";
import { ThemeRenderer } from "../../_lib/themes";
import GuestPageShell from "../../_components/GuestPageShell";
import { getRequestLocale } from "../../_lib/locale/getRequestLocale";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { applyTranslations } from "@/app/_lib/translations/apply-db-translations";
import { prisma } from "@/app/_lib/db/prisma";
import { ACCOMMODATION_SELECT } from "@/app/_lib/accommodations/types";
import { resolveAccommodation } from "@/app/_lib/accommodations/resolve";
import type { AccommodationWithRelations } from "@/app/_lib/accommodations/types";
import { ProductProvider } from "@/app/(guest)/_lib/product-context/ProductContext";
import type { ProductRatePlan } from "@/app/(guest)/_lib/product-context/ProductContext";
import { CommerceEngineProvider } from "@/app/_lib/commerce/CommerceEngineContext";
import type { ResolvedProductDisplay } from "@/app/_lib/sections/data-sources";

export const dynamic = "force-dynamic";

/**
 * Accommodation Detail Page
 * ═════════════════════════
 *
 * /stays/[slug] — renders the theme-based product page with
 * ProductProvider for live accommodation data.
 *
 * Lookup: Accommodation by slug → fallback by externalId.
 * PMS availability fetched live for rate plans.
 * Rendered via ThemeRenderer with templateKey="product".
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

  // ── Load accommodation ──────────────────────────────────────
  let accommodation = await prisma.accommodation.findFirst({
    where: { tenantId: tenant.id, slug, archivedAt: null, status: "ACTIVE" },
    select: ACCOMMODATION_SELECT,
  });

  if (!accommodation) {
    accommodation = await prisma.accommodation.findFirst({
      where: { tenantId: tenant.id, externalId: slug, archivedAt: null, status: "ACTIVE" },
      select: ACCOMMODATION_SELECT,
    });
  }

  if (!accommodation) return notFound();

  const resolved = resolveAccommodation(
    accommodation as unknown as AccommodationWithRelations,
  );

  const externalId = resolved.externalId;
  if (!externalId) return notFound();

  // ── Fetch PMS availability for rate plans ───────────────────
  let ratePlans: ProductRatePlan[] = [];
  try {
    const adapter = await resolveAdapter(tenant.id);
    const availabilityResult = await adapter.getAvailability(tenant.id, {
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
      guests,
    });

    const entry = availabilityResult.categories.find(
      (e) => e.category.externalId === externalId,
    );

    ratePlans = (entry?.ratePlans ?? []).map((rp) => ({
      externalId: rp.externalId,
      name: rp.name,
      description: rp.description,
      cancellationPolicy: rp.cancellationPolicy,
      cancellationDescription: rp.cancellationDescription,
      pricePerNight: rp.pricePerNight,
      totalPrice: rp.totalPrice,
      currency: rp.currency,
      includedAddons: rp.includedAddons,
    }));
  } catch {
    // PMS unavailable — page renders with empty rate plans
  }

  const nights = Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000,
  );

  // ── Build shared product display data (dataSources infrastructure) ──
  const visibleFacilities = resolved.facilities.filter((f) => f.isVisible).map((f) => f.facilityType);
  const productDisplay: ResolvedProductDisplay = {
    id: accommodation.id,
    title: resolved.displayName,
    description: resolved.displayDescription,
    slug: resolved.slug,
    price: ratePlans[0]?.pricePerNight ?? resolved.basePricePerNight,
    currency: resolved.currency,
    compareAtPrice: null,
    featuredImage: resolved.media[0] ? { url: resolved.media[0].url, alt: resolved.media[0].altText ?? "" } : null,
    images: resolved.media.map((m) => ({ url: m.url, alt: m.altText ?? "" })),
    productType: "ACCOMMODATION",
    facilities: visibleFacilities,
    highlights: resolved.highlights.map((h) => ({ icon: h.icon, text: h.text, description: h.description })),
    capacity: {
      maxGuests: resolved.maxGuests,
      bedrooms: resolved.bedrooms,
      bathrooms: resolved.bathrooms,
      roomSizeSqm: resolved.roomSizeSqm,
      extraBeds: resolved.extraBeds,
    },
  };

  // ── Build ProductContext data (extends display with PMS-specific fields) ──
  const productData: import("@/app/(guest)/_lib/product-context/ProductContext").AccommodationProductContext = {
    tenantId: tenant.id,
    id: accommodation.id,
    title: resolved.displayName,
    description: resolved.displayDescription,
    slug: resolved.slug,
    images: resolved.media.map((m) => m.url),
    price: ratePlans[0]?.pricePerNight ?? resolved.basePricePerNight,
    currency: resolved.currency,
    productType: "ACCOMMODATION",
    facilities: visibleFacilities,
    highlights: resolved.highlights.map((h) => ({ icon: h.icon, text: h.text, description: h.description })),
    ratePlans,
    maxGuests: resolved.maxGuests,
    bedrooms: resolved.bedrooms,
    bathrooms: resolved.bathrooms,
    roomSizeSqm: resolved.roomSizeSqm,
    extraBeds: resolved.extraBeds,
  };

  // ── Load tenant config + theme ──────────────────────────────
  const locale = await getRequestLocale();

  // Apply locale translations to accommodation name + description
  const translatedAcc = await applyTranslations(
    tenant.id, locale, "accommodation", accommodation.id,
    { name: resolved.displayName, description: resolved.displayDescription },
    ["name", "description"],
  );
  resolved.displayName = translatedAcc.name as string;
  resolved.displayDescription = translatedAcc.description as string;

  const config = await getTenantConfig(tenant.id, { locale });
  const booking = await resolveBookingFromToken("preview");
  if (!booking) return notFound();

  const bookingStatus = getBookingStatus(booking);

  const initialSelection = ratePlans[0]
    ? {
        accommodationId: accommodation.id,
        ratePlanId: ratePlans[0].externalId,
        checkIn,
        checkOut,
        adults: guests,
        children: 0,
      }
    : undefined;

  return (
    <GuestPageShell config={config}>
      <ProductProvider product={productData}>
        <CommerceEngineProvider tenantId={tenant.id} initialSelection={initialSelection}>
          <ThemeRenderer
            templateKey="product"
            config={config}
            booking={booking}
            bookingStatus={bookingStatus}
            token="preview"
            pageResolvedData={{ product: productDisplay }}
          />
        </CommerceEngineProvider>
      </ProductProvider>
    </GuestPageShell>
  );
}
