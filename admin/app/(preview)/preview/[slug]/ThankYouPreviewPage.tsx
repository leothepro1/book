import { resolveBookingFromToken } from "@/app/(guest)/_lib/portal/resolveBooking";
import { getTenantConfig } from "@/app/(guest)/_lib/tenant/getTenantConfig";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveProduct } from "@/app/_lib/products/resolve";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { getPageSettings } from "@/app/_lib/pages/config";
import { FONT_CATALOG } from "@/app/_lib/fonts/catalog";
import { resolveContrastPalette } from "@/app/_lib/color/contrast";
import { addDays, format } from "date-fns";
import { sv } from "date-fns/locale";
import { ThankYouPreviewShell } from "./ThankYouPreviewShell";
import "@/app/(guest)/checkout/checkout.css";

const SANS_FALLBACK = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";

function fontStack(key: string): string {
  const f = FONT_CATALOG.find((c) => c.key === key);
  if (!f) return SANS_FALLBACK;
  return `${f.label}, ${f.serif ? "ui-serif, Georgia, serif" : SANS_FALLBACK}`;
}

/**
 * Thank-you page preview for the editor.
 *
 * Renders the checkout success page with mock order data so tenants
 * can preview and style the post-purchase experience. Reads page
 * settings from checkout via settingsSource — both pages share the
 * same config path.
 */
export async function ThankYouPreviewPage() {
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

  // Read page settings — resolves through settingsSource to checkout
  const ps = getPageSettings(config, "thank-you");

  // Build CSS variables from page settings
  const bgColor = (ps.backgroundColor as string) || "#FFFFFF";
  const contrast = resolveContrastPalette(bgColor);
  const summaryBg = (ps.summaryBackgroundColor as string) || "#FFFFFF";
  const summaryContrast = resolveContrastPalette(summaryBg);

  const pageStyles: Record<string, string> = {
    "--background": bgColor,
    "--accent": (ps.accentColor as string) || "#121212",
    "--button-bg": (ps.buttonColor as string) || "#121212",
    "--text": contrast.text,
    "--font-heading": fontStack((ps.headingFont as string) || "inter"),
    "--font-body": fontStack((ps.bodyFont as string) || "inter"),
    "--field-bg": (ps.fieldStyle as string) === "transparent" ? "transparent" : "#fff",
    "--field-text": (ps.fieldStyle as string) === "transparent" ? "inherit" : "#202020",
    "--card-inputs-bg": (ps.fieldStyle as string) === "transparent" ? `color-mix(in srgb, ${contrast.text} 4%, transparent)` : "#f3f3f4",
    "--summary-bg": summaryBg,
    "--summary-text": summaryContrast.text,
  };

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
  const nights = 3;

  // Product data
  const productTitle = resolved?.displayTitle ?? "Dubbelrum Deluxe";
  const productImage = previewProduct?.media[0]?.url ?? null;
  const productPrice = resolved?.price || 259900;
  const currency = resolved?.currency || "SEK";
  const accommodationTotal = productPrice * nights;

  // Logo from page settings (checkout shares logo fields)
  const logoUrl = (ps.logoUrl as string) || (config.theme?.header?.logoUrl as string) || null;
  const logoWidth = (ps.logoWidth as number) || (config.theme?.header?.logoWidth as number) || 120;

  // Tenant contact email
  const tenantData = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { emailFrom: true },
  });
  const contactEmail = tenantData?.emailFrom ?? null;

  // ── Mock order data ──────────────────────────────────
  const mock = {
    orderNumber: 1047,
    guestName: "Cornelia Lindqvist",
    guestEmail: "cornelia.lindqvist@exempel.se",
    guestPhone: "073-123 45 67",
    totalAmount: accommodationTotal,
    currency,
    paymentMethod: "Kontokort",
  };

  return (
    <ThankYouPreviewShell initialStyles={pageStyles}>
      {/* ── Checkout header ── */}
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
          <span
            className="material-symbols-rounded"
            style={{ fontSize: 23, color: "var(--text, #1a1a1a)", fontVariationSettings: "'wght' 300" }}
          >
            shopping_bag
          </span>
        </div>
      </header>

      <div className="co" style={{ background: "var(--background, #fff)", fontFamily: "var(--font-body)" }}>
        <div className="co__left">
        <div className="co__back-col" />
        <div className="co__main-col">
          <div className="co__sections" style={{ gap: 0 }}>

            {/* Confirmation header */}
            <section className="co__section">
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
                <span
                  className="material-symbols-rounded"
                  style={{ fontSize: 48, color: "var(--accent, #121212)", fontVariationSettings: "'FILL' 1", flexShrink: 0 }}
                >
                  check_circle
                </span>
                <div>
                  <p style={{ fontSize: "0.8125rem", color: "color-mix(in srgb, var(--text, #000) 55%, transparent)", margin: "0 0 4px" }}>
                    Bekräftelse #{mock.orderNumber}
                  </p>
                  <h1 style={{ fontFamily: "var(--font-heading)", letterSpacing: "-.015em", color: "var(--text, #1a1a1a)", margin: 0, fontSize: 21, fontWeight: 600, lineHeight: 1.25 }}>
                    Tack {mock.guestName.split(" ")[0]}!
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
                <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1rem", fontWeight: 600, color: "var(--text, #1a1a1a)", margin: "0 0 6px" }}>
                  Din bokning är bekräftad
                </h2>
                <p style={{ fontSize: "0.8125rem", color: "color-mix(in srgb, var(--text, #000) 55%, transparent)", margin: 0 }}>
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
                      {mock.guestName}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "color-mix(in srgb, var(--text, #000) 55%, transparent)" }}>
                      {mock.guestEmail}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "color-mix(in srgb, var(--text, #000) 55%, transparent)" }}>
                      {mock.guestPhone}
                    </div>
                  </div>

                  {/* Betalningsmetod */}
                  <div style={{ padding: "16px 24px" }}>
                    <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "color-mix(in srgb, var(--text, #000) 45%, transparent)", marginBottom: 6 }}>
                      Betalningsmetod
                    </div>
                    <div style={{ fontSize: "0.875rem", color: "var(--text, #1a1a1a)" }}>
                      {mock.paymentMethod}
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
                    color: "#fff",
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
              {productImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={productImage} alt={productTitle} className="co__summary-image" />
              )}
              <h3 className="co__summary-title">{productTitle}</h3>
            </div>

            <div className="co__summary-divider" />

            {/* Datum */}
            <div className="co__summary-section">
              <span className="co__summary-label">Datum</span>
              <span className="co__summary-value">
                {format(new Date(checkInStr), "EEE d", { locale: sv })} – {format(new Date(checkOutStr), "EEE d MMM", { locale: sv })}
              </span>
            </div>
            <div className="co__summary-divider" />

            {/* Gäster */}
            <div className="co__summary-section">
              <span className="co__summary-label">Gäster</span>
              <span className="co__summary-value">2 vuxna</span>
            </div>
            <div className="co__summary-divider" />

            {/* Prisuppgifter */}
            <div className="co__summary-prices">
              <div className="co__summary-price-row">
                <span>Boende ({nights} nätter)</span>
                <span>{formatPriceDisplay(accommodationTotal, currency)} kr</span>
              </div>
              <div className="co__summary-price-row">
                <span>Skatter</span>
                <span>{formatPriceDisplay(Math.round(accommodationTotal * 0.25), currency)} kr</span>
              </div>
            </div>

            <div className="co__summary-divider" />

            <div className="co__summary-row co__summary-row--total">
              <span>Totalt</span>
              <span>{formatPriceDisplay(mock.totalAmount, currency)} kr</span>
            </div>
          </div>
        </div>
        </div>
      </div>
    </ThankYouPreviewShell>
  );
}
