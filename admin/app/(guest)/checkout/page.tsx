import { notFound, redirect } from "next/navigation";
import { resolveTenantFromHost } from "../_lib/tenant/resolveTenantFromHost";
import { getTenantConfig } from "../_lib/tenant/getTenantConfig";
import { prisma } from "@/app/_lib/db/prisma";
import { CheckoutClient } from "./CheckoutClient";
import { resolvePaymentMethods } from "@/app/_lib/payments/resolve";
import type { PaymentMethodConfig } from "@/app/_lib/payments/types";
import type { SelectedAddon } from "@/app/_lib/checkout/session-types";
import { getPageSettings } from "@/app/_lib/pages/config";
import { FONT_CATALOG } from "@/app/_lib/fonts/catalog";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { resolveContrastPalette } from "@/app/_lib/color/contrast";

const SANS_FALLBACK = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";

function fontStack(key: string): string {
  const f = FONT_CATALOG.find((c) => c.key === key);
  if (!f) return SANS_FALLBACK;
  return `${f.label}, ${f.serif ? "ui-serif, Georgia, serif" : SANS_FALLBACK}`;
}

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
      sessionType: true,
      expiresAt: true,
      // Accommodation fields
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
      // Cart fields
      cartItems: true,
      cartTotal: true,
    },
  });

  // Session not found or wrong tenant → silent redirect
  if (!session || session.tenantId !== tenant.id) redirect("/stays");

  // Unknown session type → 404
  if (session.sessionType !== "ACCOMMODATION" && session.sessionType !== "CART") {
    return notFound();
  }

  // Expired or abandoned
  if (session.status === "EXPIRED" || session.status === "ABANDONED") {
    const fallback = session.sessionType === "CART" ? "/shop" : "/stays";
    redirect(`${fallback}?error=session_expired`);
  }

  // Not yet at checkout (accommodation-only: addon selection)
  if (session.status === "PENDING" || session.status === "ADDON_SELECTION") {
    redirect(`/stays/${session.accommodationSlug!}/addons?session=${session.token}`);
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
    const fallback = session.sessionType === "CART" ? "/shop" : "/stays";
    redirect(`${fallback}?error=session_expired`);
  }

  // ── Compute totals from session snapshot ────────────────────
  const isCart = session.sessionType === "CART";

  type CartSnapshotItem = { title: string; variantTitle: string | null; variantOptions?: Record<string, string>; imageUrl: string | null; unitAmount: number; quantity: number; currency: string };
  const cartItems = isCart ? ((session.cartItems as CartSnapshotItem[]) ?? []) : [];

  const addons = (session.selectedAddons ?? []) as unknown as SelectedAddon[];
  const addonTotal = addons.reduce((sum, a) => sum + a.totalAmount, 0);
  const totalAmount = isCart
    ? (session.cartTotal ?? 0)
    : session.accommodationTotal! + addonTotal;

  // ── Fetch tenant config for header + payment methods + page settings ──
  const config = await getTenantConfig(tenant.id);
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

  // ── Build product prop based on session type ────────────────
  const currency = session.currency;
  const product = isCart
    ? {
        title: cartItems.length === 1 ? cartItems[0].title : `${cartItems.length} produkter`,
        image: cartItems[0]?.imageUrl ?? null,
        price: totalAmount,
        currency,
        ratePlanName: null,
      }
    : {
        title: session.accommodationName!,
        image: session.accommodation?.media[0]?.url ?? null,
        price: totalAmount,
        currency,
        ratePlanName: session.ratePlanName,
      };

  // ── Build summary rows ─────────────────────────────────────
  const summaryRows: Array<{ label: string; value: string; modifier?: string }> = [];

  if (isCart) {
    // Cart: total quantity + total price
    const totalQty = cartItems.reduce((sum, i) => sum + i.quantity, 0);
    summaryRows.push({
      label: "Antal",
      value: `${totalQty} st`,
    });
    // Show variant options (e.g. "Tid — 07:00")
    for (const item of cartItems) {
      const opts = item.variantOptions ?? {};
      for (const [optionName, optionValue] of Object.entries(opts)) {
        summaryRows.push({
          label: optionName,
          value: optionValue,
        });
      }
    }
    summaryRows.push({
      label: "Totalt",
      value: `${formatPriceDisplay(totalAmount, currency)} kr`,
      modifier: "total",
    });
  } else {
    // Accommodation: datum, gäster, boende, addons, skatt, totalt
    const checkInStr = session.checkIn!.toISOString().split("T")[0];
    const checkOutStr = session.checkOut!.toISOString().split("T")[0];
    const nights = session.totalNights!;
    const guests = session.adults!;
    const accTotal = session.accommodationTotal!;

    summaryRows.push({
      label: "Datum",
      value: `${format(parseISO(checkInStr), "EEE d", { locale: sv })} – ${format(parseISO(checkOutStr), "EEE d MMM", { locale: sv })}`,
    });
    summaryRows.push({
      label: "Gäster",
      value: `${guests} ${guests === 1 ? "vuxen" : "vuxna"}`,
    });
    for (const addon of addons) {
      const qty = addon.quantity > 1 ? ` x${addon.quantity}` : "";
      summaryRows.push({
        label: addon.title + qty,
        value: `${formatPriceDisplay(addon.totalAmount, addon.currency)} kr`,
      });
    }
    const taxAmount = Math.round((accTotal + addonTotal) * 0.25);
    summaryRows.push({
      label: "Delsumma",
      value: `${formatPriceDisplay(accTotal + addonTotal, currency)} kr`,
      modifier: "sub",
    });
    summaryRows.push({
      label: "Inkl. moms",
      value: `${formatPriceDisplay(taxAmount, currency)} kr`,
      modifier: "sub",
    });
    summaryRows.push({
      label: "Totalt",
      value: `${formatPriceDisplay(totalAmount + taxAmount, currency)} kr`,
      modifier: "total",
    });
  }

  return (
    <CheckoutClient
      sessionToken={session.token}
      product={product}
      summaryRows={summaryRows}
      checkIn={isCart ? null : session.checkIn!.toISOString().split("T")[0]}
      checkOut={isCart ? null : session.checkOut!.toISOString().split("T")[0]}
      guests={isCart ? 0 : session.adults!}
      bookingTerms={bookingTerms?.content ?? null}
      header={{ logoUrl, logoWidth }}
      availableMethods={resolvedMethods.availableMethods}
      walletsEnabled={resolvedMethods.walletsEnabled}
      klarnaEnabled={resolvedMethods.klarnaEnabled}
      pageStyles={pageStyles}
    />
  );
}
