import React from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveTenantFromHost } from "../../_lib/tenant/resolveTenantFromHost";
import { getTenantConfig } from "../../_lib/tenant/getTenantConfig";
import { getPageSettings } from "@/app/_lib/pages/config";
import { FONT_CATALOG } from "@/app/_lib/fonts/catalog";
import { resolveContrastPalette } from "@/app/_lib/color/contrast";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { formatOrderNumberForTenant } from "@/app/_lib/orders/format-server";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { CheckoutCompletedTracker } from "./CheckoutCompletedTracker";
import type { SelectedAddon } from "@/app/_lib/checkout/session-types";
import "../checkout.css";

const SANS_FALLBACK = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";

function fontStack(key: string): string {
  const f = FONT_CATALOG.find((c) => c.key === key);
  if (!f) return SANS_FALLBACK;
  return `${f.label}, ${f.serif ? "ui-serif, Georgia, serif" : SANS_FALLBACK}`;
}

export const dynamic = "force-dynamic";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const tenant = await resolveTenantFromHost();
  if (!tenant) return notFound();

  const sp = await searchParams;
  const orderId = sp.orderId;
  if (!orderId) return notFound();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { lineItems: true },
  });

  if (!order || order.tenantId !== tenant.id) return notFound();

  const isPending = order.status === "PENDING";
  const meta = order.metadata as Record<string, unknown> | null;
  const checkIn = meta?.checkIn as string | undefined;
  const checkOut = meta?.checkOut as string | undefined;
  const guests = meta?.guests as number | undefined;
  const sessionToken = meta?.sessionToken as string | undefined;

  // Load session for addon breakdown
  let addons: SelectedAddon[] = [];
  let accommodationTotal = order.totalAmount;
  if (sessionToken) {
    const session = await prisma.checkoutSession.findUnique({
      where: { token: sessionToken },
      select: { sessionType: true, accommodationTotal: true, cartTotal: true, selectedAddons: true },
    });
    if (session) {
      addons = (session.selectedAddons ?? []) as unknown as SelectedAddon[];
      if (session.sessionType === "CART") {
        accommodationTotal = session.cartTotal ?? order.totalAmount;
      } else {
        accommodationTotal = session.accommodationTotal ?? order.totalAmount;
      }
    }
  }
  const addonTotal = addons.reduce((sum, a) => sum + a.totalAmount, 0);
  const subtotal = accommodationTotal + addonTotal;
  const nights = checkIn && checkOut
    ? Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000)
    : 0;

  // Tenant contact email
  const tenantData = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { emailFrom: true, name: true },
  });
  const contactEmail = tenantData?.emailFrom ?? null;

  // Header config + page settings (shared with checkout via settingsSource)
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

  const pageStyles: React.CSSProperties = {
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
  } as React.CSSProperties;

  const trackerElement = !isPending ? (
    <CheckoutCompletedTracker
      tenantId={tenant.id}
      orderId={order.id}
      orderNumber={order.orderNumber}
      totalAmount={order.totalAmount}
    />
  ) : null;

  return (
    <div style={{ ...pageStyles, background: "var(--background, #fff)", minHeight: "100vh" }}>
    {trackerElement}

    {/* ── Checkout header (identical to checkout) ── */}
    <header className="co-header">
      <div className="co-header__inner">
        <a href="/" className="co-header__logo">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" style={{ width: logoWidth, height: "auto" }} />
          ) : (
            <div className="co-header__logo-placeholder" style={{ width: logoWidth }} />
          )}
        </a>
      </div>
    </header>

    <div className="co">
      <div className="co__left">
      <div className="co__back-col" />
      <div className="co__main-col">
        <div className="co__sections" style={{ gap: 0 }}>

          {/* Confirmation header */}
          <section className="co__section">
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
              {isPending && (
                <svg className="co__check-anim" width="55" height="55" viewBox="0 0 52 52" style={{ flexShrink: 0 }}>
                  <circle className="co__check-anim-circle" cx="26" cy="26" r="24" fill="none" stroke="var(--accent, #121212)" strokeWidth="2.5" />
                  <path className="co__check-anim-path" fill="none" stroke="var(--accent, #121212)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" d="M15 27l7 7 15-15" />
                </svg>
              )}
              {!isPending && (
                <span
                  className="material-symbols-rounded"
                  style={{ fontSize: 48, color: "var(--accent, #121212)", fontVariationSettings: "'FILL' 1", flexShrink: 0 }}
                >
                  check_circle
                </span>
              )}
              <div>
                <p style={{ fontSize: "0.8125rem", color: "color-mix(in srgb, var(--text, #000) 55%, transparent)", margin: "0 0 4px" }}>
                  Bekräftelse {await formatOrderNumberForTenant(tenant.id, order.orderNumber)}
                </p>
                <h1 style={{ fontFamily: "var(--font-heading)", letterSpacing: "-.015em", color: "var(--text, #1a1a1a)", margin: 0, fontSize: 21, fontWeight: 600, lineHeight: 1.25 }}>
                  Tack {(order.guestName || "").split(" ")[0] || ""}!
                </h1>
              </div>
            </div>
          </section>

          {/* Booking confirmed card */}
          <section className="co__section" style={{ borderTop: "none", paddingTop: 0 }}>
            <div style={{
              border: "1px solid color-mix(in srgb, var(--text, #000) 10%, transparent)",
              borderRadius: 12,
              padding: "20px 24px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1rem", fontWeight: 600, color: "var(--text, #1a1a1a)", margin: 0 }}>
                  {(meta?.orderType === "PURCHASE") ? "Din beställning är bekräftad" : "Din bokning är bekräftad"}
                </h2>
              </div>
              <p style={{ fontSize: "0.8125rem", color: "color-mix(in srgb, var(--text, #000) 65%, transparent)", margin: 0, paddingLeft: 0 }}>
                Du kommer snart att få en e-postbekräftelse
              </p>
            </div>
          </section>

          {/* Order details card */}
          <section className="co__section" style={{ borderTop: "none", paddingTop: 16 }}>
            <div style={{
              border: "1px solid color-mix(in srgb, var(--text, #000) 10%, transparent)",
              borderRadius: 12,
              overflow: "hidden",
            }}>
              <div style={{ padding: "16px 24px", borderBottom: "1px solid color-mix(in srgb, var(--text, #000) 8%, transparent)" }}>
                <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1rem", fontWeight: 600, color: "var(--text, #1a1a1a)", margin: 0 }}>
                  Orderuppgifter
                </h2>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {/* Kontaktinformation */}
                <div style={{ padding: "16px 24px", borderBottom: "1px solid color-mix(in srgb, var(--text, #000) 6%, transparent)" }}>
                  <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "color-mix(in srgb, var(--text, #000) 45%, transparent)", marginBottom: 6 }}>
                    Kontaktinformation
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "var(--text, #1a1a1a)" }}>
                    {order.guestName || "—"}
                  </div>
                  {order.guestEmail && (
                    <div style={{ fontSize: "0.8125rem", color: "color-mix(in srgb, var(--text, #000) 55%, transparent)" }}>
                      {order.guestEmail}
                    </div>
                  )}
                  {order.guestPhone && (
                    <div style={{ fontSize: "0.8125rem", color: "color-mix(in srgb, var(--text, #000) 55%, transparent)" }}>
                      {order.guestPhone}
                    </div>
                  )}
                </div>

                {/* Betalningsmetod */}
                <div style={{ padding: "16px 24px" }}>
                  <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "color-mix(in srgb, var(--text, #000) 45%, transparent)", marginBottom: 6 }}>
                    Betalningsmetod
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "var(--text, #1a1a1a)" }}>
                    {order.paymentMethod === "STRIPE_ELEMENTS" ? "Kontokort" : order.paymentMethod === "STRIPE_CHECKOUT" ? "Stripe" : order.paymentMethod ?? "—"}
                  </div>
                </div>

              </div>
            </div>

            {/* Help + continue */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
              <p style={{ fontSize: "0.8125rem", color: "color-mix(in srgb, var(--text, #000) 55%, transparent)", margin: 0 }}>
                Behöver du hjälp?{" "}
                {contactEmail ? (
                  <a href={`mailto:${contactEmail}`} style={{ color: "var(--accent, #207EA9)", textDecoration: "underline", textUnderlineOffset: 2 }}>
                    Kontakta oss
                  </a>
                ) : (
                  <span>Kontakta oss</span>
                )}
              </p>
              <a
                href="/"
                style={{
                  display: "inline-block",
                  padding: "14px 20px",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: "var(--button-text, #fff)",
                  background: "var(--button-bg, #207EA9)",
                  border: "none",
                  borderRadius: 8,
                  textDecoration: "none",
                }}
              >
                Fortsätt utforska
              </a>
            </div>
          </section>

        </div>
      </div>
      </div>

      {/* Right: Summary */}
      <div className="co__right">
      <div className="co__summary-col">
        <div className="co__summary">
          {/* Product header */}
          <div className="co__summary-header">
            {order.lineItems[0]?.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={order.lineItems[0].imageUrl} alt={order.lineItems[0]?.title ?? ""} className="co__summary-image" />
            )}
            <h3 className="co__summary-title">{order.lineItems[0]?.title ?? "Boende"}</h3>
          </div>

          {/* Summary rows */}
          {(() => {
            const rows: Array<{ label: string; value: string; modifier?: string }> = [];
            if (checkIn && checkOut) {
              rows.push({ label: "Datum", value: `${format(parseISO(checkIn), "EEE d", { locale: sv })} – ${format(parseISO(checkOut), "EEE d MMM", { locale: sv })}` });
            }
            if (guests) {
              rows.push({ label: "Gäster", value: `${guests} ${guests === 1 ? "vuxen" : "vuxna"}` });
            }
            // Line items (works for both accommodation and cart)
            if (nights > 0) {
              for (const addon of addons) {
                const qty = addon.quantity > 1 ? ` x${addon.quantity}` : "";
                rows.push({ label: addon.title + qty, value: `${formatPriceDisplay(addon.totalAmount, addon.currency)} kr` });
              }
            } else {
              for (const li of order.lineItems) {
                const qty = li.quantity > 1 ? ` x${li.quantity}` : "";
                rows.push({ label: li.title + qty, value: `${formatPriceDisplay(li.totalAmount, order.currency)} kr` });
              }
            }
            if (order.discountAmount > 0) {
              rows.push({ label: "Rabatt", value: `−${formatPriceDisplay(order.discountAmount, order.currency)} kr`, modifier: "discount" });
            }
            const taxAmount = Math.round(subtotal * 0.25);
            rows.push({ label: "Delsumma", value: `${formatPriceDisplay(subtotal, order.currency)} kr`, modifier: "sub" });
            rows.push({ label: "Inkl. moms", value: `${formatPriceDisplay(taxAmount, order.currency)} kr`, modifier: "sub" });
            rows.push({ label: "Totalt", value: `${formatPriceDisplay(order.totalAmount, order.currency)} kr`, modifier: "total" });
            return rows.map((row, i) => (
              <React.Fragment key={i}>
                <div className="co__summary-divider" />
                <div className={`co__summary-section${row.modifier ? ` co__summary-section--${row.modifier}` : ""}`}>
                  <span className="co__summary-label">{row.label}</span>
                  <span className="co__summary-value">{row.value}</span>
                </div>
              </React.Fragment>
            ));
          })()}

        </div>
      </div>
      </div>
    </div>
    </div>
  );
}
