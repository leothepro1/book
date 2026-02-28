import { headers } from "next/headers";
import { GuestHeader } from "./_components/GuestHeader";
import type { Locale } from "./_lib/i18n";

export const dynamic = "force-dynamic";

export default function GuestLayout({ children }: { children: React.ReactNode }) {
  // Minimal locale-stomme (sen byter ni till riktig locale-router)
  const cookieHeader = headers().get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)LOCALE=([^;]+)/);
  const cookieLocale = match ? decodeURIComponent(match[1]) : undefined;

  const locale: Locale = cookieLocale === "sv" ? "sv" : "en";

  // Temporärt: hårdkodat theme + logo. Sen hämtas från DB per tenant.
  const theme = {
    primary: "#0EA5E9",
    tertiary: "#6B7280",
    text: "#0B1220",
    fontFamily: "Arial, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    logoUrl: "https://via.placeholder.com/220x80?text=LOGO",
    logoWidthPx: 140,
    wallpaper:
      "linear-gradient(180deg, rgba(14,165,233,0.18) 0%, rgba(255,255,255,1) 55%)",
  };

  return (
    <div
      style={
        {
          minHeight: "100vh",
          display: "grid",
          gridTemplateRows: "auto 1fr",
          background: theme.wallpaper,
          fontFamily: "var(--font-sans)",
          ["--primary" as any]: theme.primary,
          ["--tertiary" as any]: theme.tertiary,
          ["--text" as any]: theme.text,
          ["--font-sans" as any]: theme.fontFamily,
        } as React.CSSProperties
      }
    >
      <GuestHeader locale={locale} logoUrl={theme.logoUrl} logoWidthPx={theme.logoWidthPx} />

      <main style={{ padding: 16, maxWidth: 720, width: "100%", margin: "0 auto" }}>
        {children}
      </main>
    </div>
  );
}