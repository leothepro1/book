import { notFound } from "next/navigation";
import { ensureRegistered, getTheme } from "@/app/(guest)/_lib/themes/registry";
import { themeToStyleAttr, backgroundStyle, googleFontsUrl } from "@/app/(guest)/_lib/theme";
import { ThemeRenderer } from "@/app/(guest)/_lib/themes/engine";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import type { NormalizedBooking } from "@/app/_lib/integrations/types";

export const revalidate = 3600; // 1h — no DB calls, purely static content

/**
 * Theme demo page — zero DB calls, fully self-contained.
 *
 * Renders the theme layout inside a minimal shell with CSS vars + fonts.
 * Uses a fake config so the demo works without a real tenant in the DB.
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

  const presetTheme = manifest.designPreset;

  const demoConfig = {
    tenantId: "demo",
    themeId,
    themeVersion: manifest.version,
    theme: presetTheme,
    sectionSettings: {},
    themeSettings: {},
    property: { name: "Demo Hotel", logo: "" },
    home: { cards: [], sections: [] },
    footer: { links: [] },
    features: {},
    rules: [],
    supportLinks: {},
  } as unknown as TenantConfig;

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
          bookingStatus="upcoming"
          token="demo"
        />
      </div>
    </div>
  );
}

const DEMO_BOOKING: NormalizedBooking = {
  externalId: "demo-booking",
  tenantId: "demo",
  firstName: "Anna",
  lastName: "Lindström",
  guestName: "Anna Lindström",
  guestEmail: "anna@example.com",
  guestPhone: null,
  arrival: new Date("2026-06-15"),
  departure: new Date("2026-06-18"),
  unit: "204",
  unitType: null,
  status: "upcoming",
  adults: 2,
  children: 0,
  extras: [],
  rawSource: "manual",
  checkedInAt: null,
  checkedOutAt: null,
  signatureCapturedAt: null,
};
