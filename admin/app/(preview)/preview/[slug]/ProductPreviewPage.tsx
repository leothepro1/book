import { getTenantConfig } from "@/app/(guest)/_lib/tenant/getTenantConfig";
import { resolveBookingFromToken } from "@/app/(guest)/_lib/portal/resolveBooking";
import { getBookingStatus } from "@/app/(guest)/_lib/booking";
import { ThemeRenderer } from "@/app/(guest)/_lib/themes";
import GuestPageShell from "@/app/(guest)/_components/GuestPageShell";
import { getRequestLocale } from "@/app/(guest)/_lib/locale/getRequestLocale";
import { prisma } from "@/app/_lib/db/prisma";
import { ProductProvider } from "@/app/(guest)/_lib/product-context/ProductContext";

/**
 * Product (Boende) page preview for the editor.
 * Fetches the first active accommodation as preview data.
 * Wraps in ProductProvider so product-gallery/product-content elements work.
 */
export async function ProductPreviewPage() {
  const booking = await resolveBookingFromToken("preview");

  if (!booking) {
    return <div style={{ padding: 20, color: "var(--text)" }}>Ingen tenant hittades.</div>;
  }

  const tenantId = booking.tenantId ?? "default";
  const locale = await getRequestLocale();
  const config = await getTenantConfig(tenantId, { preferDraft: true, locale });
  const bookingStatus = getBookingStatus(booking);

  // Fetch first active accommodation for preview
  const previewAccommodation = await prisma.accommodation.findFirst({
    where: { tenantId, status: "ACTIVE" },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      media: { orderBy: { sortOrder: "asc" }, take: 7 },
      facilities: { where: { overrideHidden: false } },
      highlights: { orderBy: { sortOrder: "asc" } },
    },
  });

  const productData = previewAccommodation
    ? {
        id: previewAccommodation.id,
        title: previewAccommodation.nameOverride ?? previewAccommodation.name,
        description: previewAccommodation.descriptionOverride ?? previewAccommodation.description,
        slug: previewAccommodation.slug,
        images: previewAccommodation.media.map((m) => m.url),
        price: previewAccommodation.basePricePerNight,
        currency: previewAccommodation.currency,
        productType: "PMS_ACCOMMODATION",
        facilities: previewAccommodation.facilities.map((f) => f.facilityType),
        highlights: previewAccommodation.highlights.map((h) => ({ icon: h.icon, text: h.text, description: h.description })),
        ratePlans: [],
        maxGuests: previewAccommodation.maxGuests,
        bedrooms: previewAccommodation.bedrooms,
        bathrooms: previewAccommodation.bathrooms,
        roomSizeSqm: previewAccommodation.roomSizeSqm,
        extraBeds: previewAccommodation.extraBeds,
      }
    : {
        id: "preview",
        title: "Exempelboende",
        description: "Detta är en förhandsvisning av boendesidan.",
        slug: "preview",
        images: [],
        price: 0,
        currency: "SEK",
        productType: "PMS_ACCOMMODATION",
        facilities: [],
        highlights: [],
        ratePlans: [],
        maxGuests: null,
        bedrooms: null,
        bathrooms: null,
        roomSizeSqm: null,
        extraBeds: 0,
      };

  return (
    <GuestPageShell config={config}>
      <ProductProvider product={productData}>
        <ThemeRenderer
          templateKey="product"
          config={config}
          booking={booking}
          bookingStatus={bookingStatus}
          token="preview"
        />
      </ProductProvider>
    </GuestPageShell>
  );
}
