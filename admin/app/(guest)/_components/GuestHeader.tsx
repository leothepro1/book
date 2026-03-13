"use client";

import type { TenantConfig } from "../_lib/tenant/types";
import { HEADER_DEFAULTS } from "../_lib/tenant/types";
import { Bell, Globe, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { resolvePageIdFromPathname, getPageLayout } from "@/app/_lib/pages";

function NoNotificationsIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      fill="currentColor"
      viewBox="0 0 256 256"
      className="opacity-70"
      aria-hidden="true"
    >
      <path d="M221.8,175.94C216.25,166.38,208,139.33,208,104a80,80,0,1,0-160,0c0,35.34-8.26,62.38-13.81,71.94A16,16,0,0,0,48,200H88.81a40,40,0,0,0,78.38,0H208a16,16,0,0,0,13.8-24.06ZM128,216a24,24,0,0,1-22.62-16h45.24A24,24,0,0,1,128,216ZM48,184c7.7-13.24,16-43.92,16-80a64,64,0,1,1,128,0c0,36.05,8.28,66.73,16,80Z"></path>
    </svg>
  );
}

function LogoPlaceholder({ width }: { width: number }) {
  // Neutral placeholder (ingen text)
  return (
    <div
      style={{ width, height: 28 }}
      className="rounded-md border border-[var(--border)] bg-white/5"
      aria-label="Logo placeholder"
    />
  );
}

export default function GuestHeader({ config }: { config: TenantConfig }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const lang = (params.get("lang") === "en" ? "en" : "sv") as "sv" | "en";

  // Page layout contract — hide header if page doesn't support it
  const pageLayout = useMemo(() => getPageLayout(resolvePageIdFromPathname(pathname)), [pathname]);
  if (!pageLayout.header) return null;

  const t = useMemo(() => {
    const sv = {
      notifications: "Notiser",
      close: "Stäng",
      noNotifications: "Inga notiser än",
      noNotificationsSub: "Meddelanden, nya funktioner och insikter visas här.",
      language: "Språk",
    };
    const en = {
      notifications: "Notifications",
      close: "Close",
      noNotifications: "No notifications yet",
      noNotificationsSub: "Messages, new features, and insights will appear here.",
      language: "Language",
    };
    return lang === "en" ? en : sv;
  }, [lang]);

  const { logoUrl, logoWidth } = config.theme.header;
  const { notificationsEnabled, languageSwitcherEnabled } = config.features;
  const hdr = { ...HEADER_DEFAULTS, ...config.home?.header };

  // Resolve color scheme CSS vars for header
  const schemeCssVars = useMemo(() => {
    if (!hdr.colorSchemeId || !config.colorSchemes) return undefined;
    const scheme = config.colorSchemes.find((s: any) => s.id === hdr.colorSchemeId);
    if (!scheme) return undefined;
    const t = scheme.tokens;
    return {
      "--background": t.background,
      "--text": t.text,
      "--header-divider": t.outlineButton,
    } as React.CSSProperties;
  }, [hdr.colorSchemeId, config.colorSchemes]);

  const [showNotifications, setShowNotifications] = useState(false);

  const headerStyle: React.CSSProperties = {
    ...schemeCssVars,
    padding: `${hdr.paddingTop}px ${hdr.paddingRight}px ${hdr.paddingBottom}px ${hdr.paddingLeft}px`,
    ...(hdr.showDivider
      ? { borderBottom: `1px solid var(--header-divider, color-mix(in srgb, var(--text) 12%, transparent))` }
      : { borderBottom: "none" }),
  };

  const isCenter = hdr.logoPosition === "center";

  return (
    <>
      <header
        className="sticky top-0 z-30 bg-[var(--background)]"
        style={headerStyle}
      >
        <div className={`mx-auto flex max-w-6xl items-center ${isCenter ? "justify-between" : "justify-between"}`}>
          {/* Left slot */}
          {isCenter ? (
            <div className="flex items-center gap-3" style={{ flex: "1 1 0", minWidth: 0 }}>
              {languageSwitcherEnabled && (
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-[var(--text)] hover:bg-white/5"
                  aria-label={t.language}
                >
                  <Globe size={20} />
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Logo"
                  style={{ width: logoWidth ?? 120, height: "auto" }}
                />
              ) : (
                <LogoPlaceholder width={logoWidth ?? 120} />
              )}
            </div>
          )}

          {/* Center slot (logo when centered) */}
          {isCenter && (
            <div className="flex items-center justify-center">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Logo"
                  style={{ width: logoWidth ?? 120, height: "auto" }}
                />
              ) : (
                <LogoPlaceholder width={logoWidth ?? 120} />
              )}
            </div>
          )}

          {/* Right slot */}
          <div className="flex items-center justify-end gap-3" style={isCenter ? { flex: "1 1 0", minWidth: 0 } : undefined}>
            {notificationsEnabled && (
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-[var(--text)] hover:bg-white/5"
                aria-label={t.notifications}
                onClick={() => setShowNotifications(true)}
              >
                <Bell size={20} />
              </button>
            )}

            {!isCenter && languageSwitcherEnabled && (
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-[var(--text)] hover:bg-white/5"
                aria-label={t.language}
              >
                <Globe size={20} />
              </button>
            )}
          </div>
        </div>
      </header>

      {notificationsEnabled && showNotifications && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[var(--background)] text-[var(--text)]">
          {/* Topbar: close left, title centered */}
          <div className="relative border-b border-[var(--border)] px-4 py-4">
            <button
              type="button"
              onClick={() => setShowNotifications(false)}
              className="absolute left-4 top-1/2 -translate-y-1/2 inline-flex items-center gap-2 rounded-full px-2 py-1 text-sm font-semibold opacity-90 hover:bg-white/5"
              aria-label={t.close}
            >
              <X size={18} />
              <span>{t.close}</span>
            </button>

            <div className="text-center text-base font-semibold">
              {t.notifications}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 py-10">
            <div className="mx-auto flex max-w-md flex-col items-center text-center">
              <NoNotificationsIcon />
              <div className="mt-4 text-base font-semibold">
                {t.noNotifications}
              </div>
              <div className="mt-2 text-sm opacity-70">
                {t.noNotificationsSub}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
