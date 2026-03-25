import { notFound } from "next/navigation";
import { resolveTenantFromHost } from "../_lib/tenant/resolveTenantFromHost";
import { getTenantConfig } from "../_lib/tenant/getTenantConfig";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveProduct } from "@/app/_lib/products/resolve";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { CheckoutClient } from "./CheckoutClient";
import { resolvePaymentMethods } from "@/app/_lib/payments/resolve";
import type { PaymentMethodConfig } from "@/app/_lib/payments/types";

export const dynamic = "force-dynamic";

/**
 * Checkout page — server-side price resolution.
 *
 * Shopify pattern: the server fetches the authoritative price
 * from the PMS at render time. The client never supplies the price.
 *
 * URL: /checkout?product=slug&checkIn=2026-07-01&checkOut=2026-07-05&guests=2&ratePlan=flexibel
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const tenant = await resolveTenantFromHost();
  if (!tenant) return notFound();

  const sp = await searchParams;
  const productSlug = sp.product;
  const checkIn = sp.checkIn ?? null;
  const checkOut = sp.checkOut ?? null;
  const guests = sp.guests ? parseInt(sp.guests, 10) : 2;
  const ratePlanId = sp.ratePlan ?? null;

  if (!productSlug || !checkIn || !checkOut) return notFound();

  // Fetch product
  const product = await prisma.product.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug: productSlug } },
    include: { media: { orderBy: { sortOrder: "asc" }, take: 1 } },
  });

  if (!product || product.status !== "ACTIVE") return notFound();

  const resolved = resolveProduct(product);

  // Resolve price from PMS — authoritative, never from client
  let totalPrice = resolved.price; // fallback for STANDARD products
  let currency = resolved.currency;
  let ratePlanName: string | null = null;

  if (product.productType === "PMS_ACCOMMODATION" && product.pmsSourceId) {
    try {
      const adapter = await resolveAdapter(tenant.id);
      const availability = await adapter.getAvailability(tenant.id, {
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
        guests,
      });

      const entry = availability.categories.find(
        (e) => e.category.externalId === product.pmsSourceId,
      );

      if (entry && entry.ratePlans.length > 0) {
        // Find requested rate plan, or use first available
        const ratePlan = ratePlanId
          ? entry.ratePlans.find((rp) => rp.externalId === ratePlanId)
          : entry.ratePlans[0];

        if (ratePlan) {
          totalPrice = ratePlan.totalPrice;
          currency = ratePlan.currency;
          ratePlanName = ratePlan.name;
        }
      }
    } catch (err) {
      console.error("[checkout] PMS price resolution failed:", err);
      // Fall through with price = 0 — will show error in UI
    }
  }

  const nights = Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000,
  );

  // Fetch booking terms — server-side, never client
  const bookingTerms = await prisma.tenantPolicy.findUnique({
    where: { tenantId_policyId: { tenantId: tenant.id, policyId: "booking-terms" } },
    select: { content: true },
  });

  // Fetch tenant config for header (logo)
  const config = await getTenantConfig(tenant.id);
  const logoUrl = (config.theme?.header?.logoUrl as string) ?? null;
  const logoWidth = (config.theme?.header?.logoWidth as number) ?? 120;

  // Resolve payment methods from tenant config
  const tenantPayments = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { paymentMethodConfig: true },
  });
  const resolvedMethods = resolvePaymentMethods(
    tenantPayments?.paymentMethodConfig as PaymentMethodConfig | null,
  );

  return (
    <CheckoutClient
      product={{
        title: resolved.displayTitle,
        image: product.media[0]?.url ?? null,
        price: totalPrice,
        currency,
        ratePlanName,
      }}
      productSlug={productSlug}
      checkIn={checkIn}
      checkOut={checkOut}
      guests={guests}
      nights={nights}
      bookingTerms={bookingTerms?.content ?? null}
      header={{
        logoUrl,
        logoWidth,
      }}
      ratePlanId={ratePlanId}
      availableMethods={resolvedMethods.availableMethods}
      walletsEnabled={resolvedMethods.walletsEnabled}
      klarnaEnabled={resolvedMethods.klarnaEnabled}
    />
  );
}
