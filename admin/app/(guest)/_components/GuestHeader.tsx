"use client";

import type { TenantConfig } from "../_lib/tenant/types";
import { Bell, Globe, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

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
  const params = useSearchParams();
  const lang = (params.get("lang") === "en" ? "en" : "sv") as "sv" | "en";

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

  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)]/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
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

          <div className="flex items-center gap-3">
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
