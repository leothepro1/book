"use client";

import type { TenantConfig } from "../_lib/tenant/types";
import { Bell, Globe } from "lucide-react";
import { useState } from "react";

export default function GuestHeader({ config }: { config: TenantConfig }) {
  const { logoUrl, logoWidth } = config.theme.header;
  const { notificationsEnabled, languageSwitcherEnabled } = config.features;

  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)]/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Logo"
                style={{ width: logoWidth ?? 120, height: "auto" }}
              />
            ) : (
              <div className="text-sm font-semibold text-[var(--text)]">
                Guest Portal
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {notificationsEnabled && (
              <button
                type="button"
                className="text-[var(--text)]"
                aria-label="Notifications"
                onClick={() => setShowNotifications(true)}
              >
                <Bell size={20} />
              </button>
            )}

            {languageSwitcherEnabled && (
              <button
                type="button"
                className="text-[var(--text)]"
                aria-label="Language"
              >
                <Globe size={20} />
              </button>
            )}
          </div>
        </div>
      </header>

      {notificationsEnabled && showNotifications && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[var(--background)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-4">
            <h2 className="text-lg font-semibold text-[var(--text)]">
              Notifications
            </h2>
            <button
              type="button"
              onClick={() => setShowNotifications(false)}
              className="text-sm text-[var(--text)]"
            >
              Close
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 text-[var(--text)]/70">
            <p>No notifications yet.</p>
          </div>
        </div>
      )}
    </>
  );
}
