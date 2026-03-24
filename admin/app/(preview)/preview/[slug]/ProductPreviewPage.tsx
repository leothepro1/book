import { getTenantConfig } from "@/app/(guest)/_lib/tenant/getTenantConfig";
import { resolveBookingFromToken } from "@/app/(guest)/_lib/portal/resolveBooking";
import { getBookingStatus } from "@/app/(guest)/_lib/booking";
import { ThemeRenderer } from "@/app/(guest)/_lib/themes";
import GuestPageShell from "@/app/(guest)/_components/GuestPageShell";
import { getRequestLocale } from "@/app/(guest)/_lib/locale/getRequestLocale";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveProduct } from "@/app/_lib/products/resolve";
import { ProductProvider } from "@/app/(guest)/_lib/product-context/ProductContext";

/**
 * Product page preview for the editor.
 * Fetches the first active PMS product (or any product) as preview data.
 * Wraps in ProductProvider so product-title/product-description elements work.
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

  // Fetch first active product for preview — prefer PMS, fallback to any
  const previewProduct = await prisma.product.findFirst({
    where: { tenantId, status: "ACTIVE" },
    orderBy: [{ productType: "desc" }, { createdAt: "asc" }], // PMS_ACCOMMODATION first
    include: {
      media: { orderBy: { sortOrder: "asc" }, take: 7 },
    },
  });

  const resolved = previewProduct ? resolveProduct(previewProduct) : null;

  const pmsRaw = previewProduct?.pmsData as Record<string, unknown> | null;

  const productData = resolved
    ? {
        id: resolved.id,
        title: resolved.displayTitle,
        description: resolved.displayDescription,
        slug: resolved.slug,
        images: previewProduct!.media.map((m) => m.url),
        price: resolved.price,
        currency: resolved.currency,
        productType: resolved.productType,
        facilities: (pmsRaw?.facilities as string[]) ?? [],
        maxGuests: (pmsRaw?.maxGuests as number) ?? null,
      }
    : {
        id: "preview",
        title: "Exempelprodukt",
        description: "Detta är en förhandsvisning av produktsidan.",
        slug: "preview",
        images: [],
        price: 0,
        currency: "SEK",
        productType: "STANDARD",
        facilities: [],
        maxGuests: null,
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
