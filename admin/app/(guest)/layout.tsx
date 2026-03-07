import "./guest.css";
import type { ReactNode } from "react";
import { getTenantConfig } from "./_lib/tenant";
import { themeToStyleAttr, backgroundStyle } from "./_lib/theme";
import GuestHeader from "./_components/GuestHeader";
import GuestFooter from "./_components/GuestFooter";

export default async function GuestLayout({ children }: { children: ReactNode }) {
  const config = await getTenantConfig("apelviken");
  const cssVars = themeToStyleAttr(config.theme);
  const bgStyle = backgroundStyle(config.theme.background, config.theme.colors);

  return (
    <div style={cssVars} className="g-body">
      <div style={bgStyle} className="min-h-dvh flex flex-col">
        <GuestHeader config={config} />
        <main className="flex-1">{children}</main>
        <GuestFooter config={config} />
      </div>
    </div>
  );
}
