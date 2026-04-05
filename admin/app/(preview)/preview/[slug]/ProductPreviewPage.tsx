import { getTenantConfig } from "@/app/(guest)/_lib/tenant/getTenantConfig";
import { resolveBookingFromToken } from "@/app/(guest)/_lib/portal/resolveBooking";
import { getBookingStatus } from "@/app/(guest)/_lib/booking";
import { ThemeRenderer } from "@/app/(guest)/_lib/themes";
import GuestPageShell from "@/app/(guest)/_components/GuestPageShell";
import { getRequestLocale } from "@/app/(guest)/_lib/locale/getRequestLocale";
import { prisma } from "@/app/_lib/db/prisma";
import { ProductProvider } from "@/app/(guest)/_lib/product-context/ProductContext";
import type { ResolvedProductDisplay } from "@/app/_lib/sections/data-sources";

/**
 * Product (Boende) page preview for the editor.
 * Fetches the first active accommodation as preview data.
 * Wraps in ProductProvider so product-gallery/product-content elements work.
 */
export async function ProductPreviewPage({ productId }: { productId?: string }) {
  const booking = await resolveBookingFromToken("preview");

  if (!booking) {
    return <div style={{ padding: 20, color: "var(--text)" }}>Ingen tenant hittades.</div>;
  }

  const tenantId = booking.tenantId ?? "default";
  const locale = await getRequestLocale();
  const config = await getTenantConfig(tenantId, { preferDraft: true, locale });
  const bookingStatus = getBookingStatus(booking);

  // Fetch specific accommodation by ID, or fall back to first active
  const previewAccommodation = productId
    ? await prisma.accommodation.findFirst({
        where: { id: productId, tenantId, status: "ACTIVE" },
        include: {
          media: { orderBy: { sortOrder: "asc" }, take: 7 },
          facilities: { where: { overrideHidden: false } },
          highlights: { orderBy: { sortOrder: "asc" } },
        },
      })
    : await prisma.accommodation.findFirst({
        where: { tenantId, status: "ACTIVE" },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          media: { orderBy: { sortOrder: "asc" }, take: 7 },
          facilities: { where: { overrideHidden: false } },
          highlights: { orderBy: { sortOrder: "asc" } },
        },
      });

  // Build shared product display (dataSources infrastructure)
  const acc = previewAccommodation;
  const productDisplay: ResolvedProductDisplay = acc
    ? {
        id: acc.id,
        title: acc.nameOverride ?? acc.name,
        description: acc.descriptionOverride ?? acc.description,
        slug: acc.slug,
        price: acc.basePricePerNight,
        currency: acc.currency,
        compareAtPrice: null,
        featuredImage: acc.media[0] ? { url: acc.media[0].url, alt: acc.media[0].altText ?? "" } : null,
        images: acc.media.map((m) => ({ url: m.url, alt: m.altText ?? "" })),
        productType: "PMS_ACCOMMODATION",
        facilities: acc.facilities.map((f) => f.facilityType),
        highlights: acc.highlights.map((h) => ({ icon: h.icon, text: h.text, description: h.description })),
        capacity: {
          maxGuests: acc.maxGuests,
          bedrooms: acc.bedrooms,
          bathrooms: acc.bathrooms,
          roomSizeSqm: acc.roomSizeSqm,
          extraBeds: acc.extraBeds,
        },
      }
    : {
        id: "preview",
        title: "Exempelboende",
        description: "Detta är en förhandsvisning av boendesidan.",
        slug: "preview",
        price: 0,
        currency: "SEK",
        compareAtPrice: null,
        featuredImage: null,
        images: [],
        productType: "PMS_ACCOMMODATION",
        facilities: [],
        highlights: [],
        capacity: { maxGuests: null, bedrooms: null, bathrooms: null, roomSizeSqm: null, extraBeds: 0 },
      };

  // ProductContext extends display data with PMS-specific fields
  const productData = {
    tenantId,
    id: productDisplay.id,
    title: productDisplay.title,
    description: productDisplay.description,
    slug: productDisplay.slug,
    images: acc ? acc.media.map((m) => m.url) : [],
    price: productDisplay.price,
    currency: productDisplay.currency,
    productType: productDisplay.productType,
    facilities: productDisplay.facilities ?? [],
    highlights: productDisplay.highlights ?? [],
    ratePlans: [] as never[],
    maxGuests: acc?.maxGuests ?? null,
    bedrooms: acc?.bedrooms ?? null,
    bathrooms: acc?.bathrooms ?? null,
    roomSizeSqm: acc?.roomSizeSqm ?? null,
    extraBeds: acc?.extraBeds ?? 0,
  };

  return (
    <GuestPageShell config={config} pageId="product">
      <ProductProvider product={productData}>
        <ThemeRenderer
          templateKey="product"
          config={config}
          booking={booking}
          bookingStatus={bookingStatus}
          token="preview"
          pageResolvedData={{ product: productDisplay }}
        />
      </ProductProvider>
    </GuestPageShell>
  );
}
