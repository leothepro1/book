import { resolveBookingFromToken } from "@/app/(guest)/_lib/portal/resolveBooking";
import { getTenantConfig } from "@/app/(guest)/_lib/tenant/getTenantConfig";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveProduct } from "@/app/_lib/products/resolve";
import { resolvePaymentMethods } from "@/app/_lib/payments/resolve";
import type { PaymentMethodConfig } from "@/app/_lib/payments/types";
import { CheckoutClient } from "@/app/(guest)/checkout/CheckoutClient";
import { getPageSettings } from "@/app/_lib/pages/config";
import { FONT_CATALOG } from "@/app/_lib/fonts/catalog";
import { resolveContrastPalette } from "@/app/_lib/color/contrast";
import { addDays, format } from "date-fns";

const SANS_FALLBACK = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";

function fontStack(key: string): string {
  const f = FONT_CATALOG.find((c) => c.key === key);
  if (!f) return SANS_FALLBACK;
  return `${f.label}, ${f.serif ? "ui-serif, Georgia, serif" : SANS_FALLBACK}`;
}

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

  // Page settings (shared with thank-you via settingsSource)
  const ps = getPageSettings(config, "checkout");
  const logoUrl = (ps.logoUrl as string) || (config.theme?.header?.logoUrl as string) || null;
  const logoWidth = (ps.logoWidth as number) || (config.theme?.header?.logoWidth as number) || 120;

  const bgColor = (ps.backgroundColor as string) || "#FFFFFF";
  const contrast = resolveContrastPalette(bgColor);
  const summaryBg = (ps.summaryBackgroundColor as string) || "#FFFFFF";
  const summaryContrast = resolveContrastPalette(summaryBg);
  const buttonBg = (ps.buttonColor as string) || "#207EA9";
  const buttonContrast = resolveContrastPalette(buttonBg);

  const pageStyles: Record<string, string> = {
    "--background": bgColor,
    "--accent": (ps.accentColor as string) || "#121212",
    "--button-bg": buttonBg,
    "--button-text": buttonContrast.text,
    "--error": (ps.errorColor as string) || "#c13515",
    "--text": contrast.text,
    "--font-heading": fontStack((ps.headingFont as string) || "inter"),
    "--font-body": fontStack((ps.bodyFont as string) || "inter"),
    "--logo-align": (ps.logoAlignment as string) === "left" ? "flex-start" : "center",
    "--field-bg": (ps.fieldStyle as string) === "transparent" ? "transparent" : "#fff",
    "--field-text": (ps.fieldStyle as string) === "transparent" ? "inherit" : "#202020",
    "--card-inputs-bg": (ps.fieldStyle as string) === "transparent" ? `color-mix(in srgb, ${contrast.text} 4%, transparent)` : "#f3f3f4",
    "--summary-bg": summaryBg,
    "--summary-text": summaryContrast.text,
  };

  // Booking terms
  const bookingTerms = await prisma.tenantPolicy.findUnique({
    where: { tenantId_policyId: { tenantId, policyId: "booking-terms" } },
    select: { content: true },
  });

  return (
    <CheckoutClient
      sessionToken="preview"
      product={
        resolved
          ? {
              title: resolved.displayTitle,
              image: previewProduct!.media[0]?.url ?? null,
              price: resolved.price || 259900,
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
      checkIn={checkInStr}
      checkOut={checkOutStr}
      guests={2}
      nights={3}
      addons={[]}
      accommodationTotal={259900 * 3}
      bookingTerms={bookingTerms?.content ?? null}
      header={{ logoUrl, logoWidth }}
      availableMethods={resolvedMethods.availableMethods}
      walletsEnabled={resolvedMethods.walletsEnabled}
      klarnaEnabled={resolvedMethods.klarnaEnabled}
      pageStyles={pageStyles}
    />
  );
}
