import "../../(guest)/guest.css";
import type { ReactNode } from "react";
import { getTenantConfig } from "../../(guest)/_lib/tenant";
import { themeToStyleAttr, backgroundStyle, googleFontsUrl } from "../../(guest)/_lib/theme";
import GuestHeader from "../../(guest)/_components/GuestHeader";
import GuestFooter from "../../(guest)/_components/GuestFooter";

export default async function PreviewLayout({ children }: { children: ReactNode }) {
  const config = await getTenantConfig("apelviken", { preferDraft: true });
  const cssVars = themeToStyleAttr(config.theme);
  const bgStyle = backgroundStyle(config.theme.background);

  const fontsUrl = googleFontsUrl([
    config.theme.typography.headingFont,
    config.theme.typography.bodyFont,
  ]);

  return (
    <div style={cssVars} className="g-body">
      {fontsUrl && (
        <link rel="stylesheet" href={fontsUrl} />
      )}
      <div style={bgStyle} className="min-h-dvh flex flex-col">
        <GuestHeader config={config} />
        <main className="flex-1">{children}</main>
        <GuestFooter config={config} />
      </div>
    </div>
  );
}
