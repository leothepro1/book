import { resolveBookingFromToken } from "@/app/(guest)/_lib/portal/resolveBooking";
import { getTenantConfig } from "@/app/(guest)/_lib/tenant/getTenantConfig";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveProduct } from "@/app/_lib/products/resolve";
import { resolvePaymentMethods } from "@/app/_lib/payments/resolve";
import type { PaymentMethodConfig } from "@/app/_lib/payments/types";
import { CheckoutClient } from "@/app/(guest)/checkout/CheckoutClient";
import { addDays, format } from "date-fns";

/**
 * Checkout page preview for the editor.
 * Renders CheckoutClient with test data — a real product from the
 * tenant's catalog (or placeholder) with hardcoded dates.
 */
export async function CheckoutPreviewPage() {
  const booking = await resolveBookingFromToken("preview");

  if (!booking) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#666" }}>
        Ingen tenant hittades.
      </div>
    );
  }

  const tenantId = booking.tenantId ?? "default";
  const config = await getTenantConfig(tenantId, { preferDraft: true });

  // Fetch first active product for realistic preview
  const previewProduct = await prisma.product.findFirst({
    where: { tenantId, status: "ACTIVE" },
    orderBy: [{ productType: "desc" }, { createdAt: "asc" }],
    include: { media: { orderBy: { sortOrder: "asc" }, take: 1 } },
  });

  const resolved = previewProduct ? resolveProduct(previewProduct) : null;

  // Build test dates: tomorrow → +3 days
  const tomorrow = addDays(new Date(), 1);
  const checkOut = addDays(tomorrow, 3);
  const checkInStr = format(tomorrow, "yyyy-MM-dd");
  const checkOutStr = format(checkOut, "yyyy-MM-dd");

  // Resolve payment methods from tenant config
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { paymentMethodConfig: true },
  });
  const resolvedMethods = resolvePaymentMethods(
    tenant?.paymentMethodConfig as PaymentMethodConfig | null,
  );

  // Logo from config
  const logoUrl = (config.theme?.header?.logoUrl as string) ?? null;
  const logoWidth = (config.theme?.header?.logoWidth as number) ?? 120;

  // Booking terms
  const bookingTerms = await prisma.tenantPolicy.findUnique({
    where: { tenantId_policyId: { tenantId, policyId: "booking-terms" } },
    select: { content: true },
  });

  return (
    <CheckoutClient
      tenantId={tenantId}
      product={
        resolved
          ? {
              title: resolved.displayTitle,
              image: previewProduct!.media[0]?.url ?? null,
              price: resolved.price || 259900, // fallback 2599 kr
              currency: resolved.currency || "SEK",
              ratePlanName: null,
            }
          : {
              title: "Dubbelrum Deluxe",
              image: null,
              price: 259900,
              currency: "SEK",
              ratePlanName: "Flexibel",
            }
      }
      productSlug={resolved?.slug ?? "preview-product"}
      checkIn={checkInStr}
      checkOut={checkOutStr}
      guests={2}
      nights={3}
      bookingTerms={bookingTerms?.content ?? null}
      header={{ logoUrl, logoWidth }}
      ratePlanId={null}
      availableMethods={resolvedMethods.availableMethods}
      walletsEnabled={resolvedMethods.walletsEnabled}
      klarnaEnabled={resolvedMethods.klarnaEnabled}
    />
  );
}
