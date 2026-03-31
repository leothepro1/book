import { notFound, redirect } from "next/navigation";
import { resolveTenantFromHost } from "../_lib/tenant/resolveTenantFromHost";
import { getTenantConfig } from "../_lib/tenant/getTenantConfig";
import { prisma } from "@/app/_lib/db/prisma";
import { CheckoutClient } from "./CheckoutClient";
import { resolvePaymentMethods } from "@/app/_lib/payments/resolve";
import type { PaymentMethodConfig } from "@/app/_lib/payments/types";
import type { SelectedAddon } from "@/app/_lib/checkout/session-types";

export const dynamic = "force-dynamic";

/**
 * Checkout page — reads everything from CheckoutSession.
 *
 * URL: /checkout?session=[token]
 * The session snapshot is the single source of truth.
 * No prices from URL params. No PMS re-fetch.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const tenant = await resolveTenantFromHost();
  if (!tenant) return notFound();

  const sp = await searchParams;
  const sessionToken = sp.session;

  if (!sessionToken) redirect("/stays");

  // ── Load + gate session ─────────────────────────────────────
  const session = await prisma.checkoutSession.findUnique({
    where: { token: sessionToken },
    select: {
      id: true,
      tenantId: true,
      token: true,
      status: true,
      expiresAt: true,
      accommodationId: true,
      accommodationName: true,
      accommodationSlug: true,
      ratePlanId: true,
      ratePlanName: true,
      ratePlanCancellationPolicy: true,
      pricePerNight: true,
      totalNights: true,
      accommodationTotal: true,
      currency: true,
      checkIn: true,
      checkOut: true,
      adults: true,
      selectedAddons: true,
      accommodation: {
        select: {
          media: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
        },
      },
    },
  });

  // Session not found or wrong tenant → silent redirect
  if (!session || session.tenantId !== tenant.id) redirect("/stays");

  // Expired or abandoned
  if (session.status === "EXPIRED" || session.status === "ABANDONED") {
    redirect("/stays?error=session_expired");
  }

  // Not yet at checkout
  if (session.status === "PENDING" || session.status === "ADDON_SELECTION") {
    redirect(`/stays/${session.accommodationSlug}/addons?session=${session.token}`);
  }

  // Already completed
  if (session.status === "COMPLETED") {
    redirect(`/checkout/success?session=${session.token}`);
  }

  // Expired by time
  if (session.expiresAt < new Date()) {
    await prisma.checkoutSession.update({
      where: { id: session.id },
      data: { status: "EXPIRED" },
    });
    redirect("/stays?error=session_expired");
  }

  // ── Compute totals from session snapshot ────────────────────
  const addons = (session.selectedAddons ?? []) as unknown as SelectedAddon[];
  const addonTotal = addons.reduce((sum, a) => sum + a.totalAmount, 0);
  const totalAmount = session.accommodationTotal + addonTotal;

  // ── Fetch tenant config for header + payment methods ────────
  const config = await getTenantConfig(tenant.id);
  const logoUrl = (config.theme?.header?.logoUrl as string) ?? null;
  const logoWidth = (config.theme?.header?.logoWidth as number) ?? 120;

  const bookingTerms = await prisma.tenantPolicy.findUnique({
    where: { tenantId_policyId: { tenantId: tenant.id, policyId: "booking-terms" } },
    select: { content: true },
  });

  const tenantPayments = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { paymentMethodConfig: true },
  });
  const resolvedMethods = resolvePaymentMethods(
    tenantPayments?.paymentMethodConfig as PaymentMethodConfig | null,
  );

  return (
    <CheckoutClient
      sessionToken={session.token}
      product={{
        title: session.accommodationName,
        image: session.accommodation.media[0]?.url ?? null,
        price: totalAmount,
        currency: session.currency,
        ratePlanName: session.ratePlanName,
      }}
      checkIn={session.checkIn.toISOString().split("T")[0]}
      checkOut={session.checkOut.toISOString().split("T")[0]}
      guests={session.adults}
      nights={session.totalNights}
      addons={addons}
      accommodationTotal={session.accommodationTotal}
      bookingTerms={bookingTerms?.content ?? null}
      header={{ logoUrl, logoWidth }}
      availableMethods={resolvedMethods.availableMethods}
      walletsEnabled={resolvedMethods.walletsEnabled}
      klarnaEnabled={resolvedMethods.klarnaEnabled}
    />
  );
}
