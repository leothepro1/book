import { notFound } from "next/navigation";
import { ensureRegistered, getTheme } from "@/app/(guest)/_lib/themes/registry";
import { getTenantConfig } from "@/app/(guest)/_lib/tenant";
import { themeToStyleAttr, backgroundStyle, googleFontsUrl } from "@/app/(guest)/_lib/theme";
import { ThemeRenderer } from "@/app/(guest)/_lib/themes/engine";
import { BookingStatus } from "@prisma/client";
import type { Booking } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Theme demo page — single DB call, no header/footer.
 *
 * Renders the theme layout inside a minimal shell with CSS vars + fonts.
 * Optimised for fast initial paint in the admin phone-frame preview.
 */
export default async function ThemeDemoPage(props: {
  params: Promise<{ themeId: string }>;
}) {
  const [{ themeId }] = await Promise.all([
    props.params,
    ensureRegistered(),
  ]);

  const manifest = getTheme(themeId);
  if (!manifest) return notFound();

  const config = await getTenantConfig("apelviken", { preferDraft: true });

  // Use the theme's design preset for the demo — this shows the theme
  // exactly as its author intended, independent of the tenant's current design.
  const presetTheme = manifest.designPreset;

  const demoConfig = {
    ...config,
    themeId,
    theme: presetTheme,
    sectionSettings: {},
    themeSettings: {},
    home: {
      ...config.home,
      cards: [],
    },
  };

  const cssVars = themeToStyleAttr(presetTheme);
  const bgStyle = backgroundStyle(presetTheme.background, presetTheme.colors);
  const fontsUrl = googleFontsUrl([
    presetTheme.typography.headingFont,
    presetTheme.typography.bodyFont,
    ...(presetTheme.typography.buttonFont ? [presetTheme.typography.buttonFont] : []),
  ]);

  return (
    <div style={cssVars} className="g-body">
      {fontsUrl && <link rel="stylesheet" href={fontsUrl} />}
      <div style={bgStyle} className="min-h-dvh">
        <ThemeRenderer
          templateKey="home"
          config={demoConfig}
          booking={DEMO_BOOKING}
          bookingStatus={BookingStatus.PRE_CHECKIN}
          token="demo"
        />
      </div>
    </div>
  );
}

const DEMO_BOOKING: Booking = {
  id: "demo-booking",
  tenantId: "demo",
  firstName: "Anna",
  lastName: "Lindström",
  guestEmail: "anna@example.com",
  phone: null,
  street: null,
  postalCode: null,
  city: null,
  country: null,
  arrival: new Date("2026-06-15"),
  departure: new Date("2026-06-18"),
  unit: "204",
  status: BookingStatus.PRE_CHECKIN,
  checkedInAt: null,
  checkedOutAt: null,
  signatureCapturedAt: null,
  signatureDataUrl: null,
  createdAt: new Date(),
};
