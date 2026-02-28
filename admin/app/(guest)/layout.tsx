import { GuestHeader } from "./_components/GuestHeader";
import type { Locale } from "./_lib/i18n";

export const dynamic = "force-dynamic";

export default function GuestLayout({
  children,
  searchParams,
}: {
  children: React.ReactNode;
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  // Locale via URL: ?lang=sv eller ?lang=en
  const lang = Array.isArray(searchParams?.lang) ? searchParams?.lang[0] : searchParams?.lang;
  const locale: Locale = lang === "sv" ? "sv" : "en";

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