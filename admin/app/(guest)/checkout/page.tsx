import { notFound, redirect } from "next/navigation";
import { resolveTenantFromHost } from "../_lib/tenant/resolveTenantFromHost";
import { getTenantConfig } from "../_lib/tenant/getTenantConfig";
import { prisma } from "@/app/_lib/db/prisma";
import { CheckoutClient } from "./CheckoutClient";
import type { PrefillContact } from "./CheckoutClient";
import { resolvePaymentMethods } from "@/app/_lib/payments/resolve";
import type { PaymentMethodConfig } from "@/app/_lib/payments/types";
import type { SelectedAddon } from "@/app/_lib/checkout/session-types";
import { getPageSettings } from "@/app/_lib/pages/config";
import { FONT_CATALOG } from "@/app/_lib/fonts/catalog";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { resolveContrastPalette } from "@/app/_lib/color/contrast";
import { getGuestSession } from "@/app/_lib/magic-link/session";
import { loadSessionForCheckout } from "@/app/_lib/draft-orders/load-session-for-checkout";
import type { SessionForCheckout } from "@/app/_lib/draft-orders/load-session-for-checkout";
import { getTenantUrl } from "@/app/_lib/tenant/tenant-url";
import { log } from "@/app/_lib/logger";
import type { SummaryRow } from "@/app/(guest)/_components/SummaryCol";

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

  // ── Draft-order invoice flow (v1.3 §2.2) ─────────────────────
  //
  // The `?draftSession={id}` param routes through the
  // DraftCheckoutSession lookup; absence falls through to the
  // storefront `?session={token}` path below. The two are mutually
  // exclusive — the redirect target from `/invoice/[token]` (Phase F)
  // always uses `?draftSession=`.
  //
  // Decisions baked into this branch:
  //   Q3 (recon): DraftLineItem has no dates/guests fields. Summary
  //               renders lineItems only — no checkIn/checkOut row.
  //   Q4 (recon): /api/checkout/update-guest is skipped — DraftOrder
  //               already carries the buyer snapshot from the merchant
  //               flow (contactEmail/First/Last). CheckoutClient gates
  //               the POST on `draftSessionId` truthiness.
  //   Q5 (recon): /api/checkout/validate-discount UI is hidden — v1.3
  //               §5 invariant 17 freezes the discount on the session
  //               at creation, the buyer cannot change it.
  if (sp.draftSession) {
    return renderDraftCheckout(tenant, sp.draftSession);
  }

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

  // ── Prefill contact from guest session (if logged in) ───────
  let prefillContact: PrefillContact | null = null;
  try {
    const guestSession = await getGuestSession();
    if (guestSession?.guestAccountId) {
      const ga = await prisma.guestAccount.findUnique({
        where: { id: guestSession.guestAccountId },
        select: {
          email: true,
          firstName: true,
          lastName: true,
          address1: true,
          city: true,
          postalCode: true,
          country: true,
        },
      });
      if (ga && ga.email) {
        prefillContact = {
          email: ga.email,
          firstName: ga.firstName ?? "",
          lastName: ga.lastName ?? "",
          address: ga.address1 ?? "",
          city: ga.city ?? "",
          postalCode: ga.postalCode ?? "",
          country: ga.country ?? "SE",
        };
      }
    }
  } catch {
    // Non-blocking — prefill is a convenience, not a requirement
  }

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
      prefillContact={prefillContact}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// Draft-order invoice flow
// ─────────────────────────────────────────────────────────────────────

interface TenantForRender {
  id: string;
  name: string;
  portalSlug: string | null;
}

/**
 * Render the buyer-side checkout for a `DraftCheckoutSession`.
 *
 * Resolves the session tenant-scoped, redirects non-ACTIVE sessions
 * to `/invoice/{token}` so Phase F's classifier renders the right
 * status page (cancelled / expired / unit_unavailable / paid receipt).
 *
 * On the ACTIVE path, builds the same `CheckoutClient` prop bag as
 * the storefront branch, but seeded from the frozen snapshot on
 * `DraftCheckoutSession` and the line items on `DraftOrder`.
 */
async function renderDraftCheckout(
  tenant: TenantForRender,
  draftSessionId: string,
) {
  const session = await loadSessionForCheckout(draftSessionId, tenant.id);
  if (!session) return notFound();

  log("info", "draft_invoice.checkout_loaded", {
    tenantId: tenant.id,
    draftSessionId: session.id,
    status: session.status,
  });

  if (session.status !== "ACTIVE") {
    if (!tenant.portalSlug) return notFound();
    redirect(
      getTenantUrl(
        { portalSlug: tenant.portalSlug },
        { path: `/invoice/${session.draftOrder.shareLinkToken}` },
      ),
    );
  }

  // Stripe client secret is persisted in step 5 of Phase E's pipeline
  // atomically with the PI ID. ACTIVE without a secret is an
  // invariant violation; treat as 404 rather than render a half-
  // wired Elements form.
  if (!session.stripeClientSecret) return notFound();

  // ── Tenant config + page settings (identical to storefront branch) ──
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

  const summary = buildDraftSummary(session);

  // Prefill the contact form with whatever the merchant captured on
  // the draft. Address fields stay blank — DraftOrder doesn't carry
  // billing-address columns. CheckoutClient relaxes address
  // validation when `draftSessionId` is set, so the buyer can submit
  // without re-entering data the merchant already collected.
  const prefillContact: PrefillContact | null = session.draftOrder.contactEmail
    ? {
        email: session.draftOrder.contactEmail,
        firstName: session.draftOrder.contactFirstName ?? "",
        lastName: session.draftOrder.contactLastName ?? "",
        address: "",
        city: "",
        postalCode: "",
        country: "SE",
      }
    : null;

  return (
    <CheckoutClient
      sessionToken={session.id}
      product={summary.product}
      summaryRows={summary.summaryRows}
      checkIn={null}
      checkOut={null}
      guests={0}
      bookingTerms={bookingTerms?.content ?? null}
      header={{ logoUrl, logoWidth }}
      availableMethods={resolvedMethods.availableMethods}
      walletsEnabled={resolvedMethods.walletsEnabled}
      klarnaEnabled={resolvedMethods.klarnaEnabled}
      pageStyles={pageStyles}
      prefillContact={prefillContact}
      draftSessionId={session.id}
      initialClientSecret={session.stripeClientSecret}
    />
  );
}

interface DraftSummary {
  product: {
    title: string;
    image: string | null;
    price: number;
    currency: string;
    ratePlanName: null;
  };
  summaryRows: SummaryRow[];
}

/**
 * Build the `product` + `summaryRows` props from a frozen snapshot.
 *
 * Single-line drafts render that line as the product title.
 * Multi-line drafts render "N produkter" — same convention as the
 * storefront cart flow. Tax + total are read straight from the
 * frozen snapshot per v1.3 §5 invariant 17.
 */
function buildDraftSummary(session: SessionForCheckout): DraftSummary {
  const lineItems = session.draftOrder.lineItems;
  const currency = session.currency;
  const total = Number(session.frozenTotal);
  const subtotal = Number(session.frozenSubtotal);
  const tax = Number(session.frozenTaxAmount);
  const discount = Number(session.frozenDiscountAmount);

  const productTitle =
    lineItems.length === 1
      ? lineItems[0].title
      : `${lineItems.length} produkter`;

  const product: DraftSummary["product"] = {
    title: productTitle,
    image: null,
    price: total,
    currency,
    ratePlanName: null,
  };

  const summaryRows: SummaryRow[] = [];
  for (const item of lineItems) {
    const qtySuffix = item.quantity > 1 ? ` x${item.quantity}` : "";
    summaryRows.push({
      label: item.title + qtySuffix,
      value: `${formatPriceDisplay(Number(item.totalCents), currency)} kr`,
    });
  }
  if (discount > 0) {
    summaryRows.push({
      label: "Rabatt",
      value: `−${formatPriceDisplay(discount, currency)} kr`,
      modifier: "discount",
    });
  }
  summaryRows.push({
    label: "Delsumma",
    value: `${formatPriceDisplay(subtotal, currency)} kr`,
    modifier: "sub",
  });
  if (tax > 0) {
    summaryRows.push({
      label: "Inkl. moms",
      value: `${formatPriceDisplay(tax, currency)} kr`,
      modifier: "sub",
    });
  }
  summaryRows.push({
    label: "Totalt",
    value: `${formatPriceDisplay(total, currency)} kr`,
    modifier: "total",
  });

  return { product, summaryRows };
}
