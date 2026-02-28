import "../globals.css";
import type { ReactNode } from "react";
import { getTenantConfig } from "./_lib/tenant";
import { themeToStyleAttr, backgroundStyle } from "./_lib/theme";
import GuestHeader from "./_components/GuestHeader";
import GuestFooter from "./_components/GuestFooter";

export default async function GuestLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Tillfälligt: statisk tenant. Byts senare mot token -> tenant.
  const config = await getTenantConfig("default");

  const cssVars = themeToStyleAttr(config.theme);
  const bgStyle = backgroundStyle(config.theme.background);

  return (
    <html lang="sv">
      <body style={cssVars}>
        <div style={bgStyle} className="min-h-dvh flex flex-col">
          <GuestHeader config={config} />

          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6">
            {children}
          </main>

          <GuestFooter config={config} />
        </div>
      </body>
    </html>
  );
}