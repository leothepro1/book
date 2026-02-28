"use client";

import { useMemo, useState } from "react";
import type { Locale } from "../_lib/i18n";
import { t } from "../_lib/i18n";

type GuestHeaderProps = {
  logoUrl?: string | null;
  logoWidthPx?: number; // dynamisk bredd (contain)
  locale: Locale;
};

export function GuestHeader({ logoUrl, logoWidthPx = 140, locale }: GuestHeaderProps) {
  const [open, setOpen] = useState(false);

  const logoStyle = useMemo(() => {
    return {
      width: logoWidthPx,
      height: 36,
      objectFit: "contain" as const,
      display: "block",
    };
  }, [logoWidthPx]);

  return (
    <>
      <header
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          background: "rgba(255,255,255,0.82)",
          backdropFilter: "blur(10px)",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* Left: Logo (dynamic) */}
          <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo" style={logoStyle} />
            ) : (
              <div style={{ fontWeight: 800, color: "var(--text)" }}>Logo</div>
            )}
          </div>

          {/* Right: static icons */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              type="button"
              aria-label="Upload"
              style={iconBtnStyle}
              onClick={() => {
                // placeholder (sen kan ni koppla valfri funktion)
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256">
                <path d="M216,112v96a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V112A16,16,0,0,1,56,96H80a8,8,0,0,1,0,16H56v96H200V112H176a8,8,0,0,1,0-16h24A16,16,0,0,1,216,112ZM93.66,69.66,120,43.31V136a8,8,0,0,0,16,0V43.31l26.34,26.35a8,8,0,0,0,11.32-11.32l-40-40a8,8,0,0,0-11.32,0l-40,40A8,8,0,0,0,93.66,69.66Z"></path>
              </svg>
            </button>

            <button
              type="button"
              aria-label="Notifications"
              style={iconBtnStyle}
              onClick={() => setOpen(true)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" viewBox="0 0 256 256">
                <path d="M221.8,175.94C216.25,166.38,208,139.33,208,104a80,80,0,1,0-160,0c0,35.34-8.26,62.38-13.81,71.94A16,16,0,0,0,48,200H88.81a40,40,0,0,0,78.38,0H208a16,16,0,0,0,13.8-24.06ZM128,216a24,24,0,0,1-22.62-16h45.24A24,24,0,0,1,128,216ZM48,184c7.7-13.24,16-43.92,16-80a64,64,0,1,1,128,0c0,36.05,8.28,66.73,16,80Z"></path>
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Fullscreen modal */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "white",
            zIndex: 9999,
            display: "grid",
            gridTemplateRows: "auto 1fr",
          }}
        >
          <div
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid rgba(0,0,0,0.08)",
              display: "grid",
              gridTemplateColumns: "40px 1fr 40px",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              style={iconBtnStyle}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" fill="currentColor" viewBox="0 0 256 256">
                <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"></path>
              </svg>
            </button>

            <div style={{ textAlign: "center", fontWeight: 800, color: "var(--text)" }}>
              {t(locale, "notificationsTitle")}
            </div>

            <div />
          </div>

          <div
            style={{
              height: "100%",
              display: "grid",
              placeItems: "center",
              padding: 24,
            }}
          >
            <div style={{ textAlign: "center", maxWidth: 360 }}>
              <div style={{ marginBottom: 14, color: "var(--tertiary)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M221.8,175.94C216.25,166.38,208,139.33,208,104a80,80,0,1,0-160,0c0,35.34-8.26,62.38-13.81,71.94A16,16,0,0,0,48,200H88.81a40,40,0,0,0,78.38,0H208a16,16,0,0,0,13.8-24.06ZM128,216a24,24,0,0,1-22.62-16h45.24A24,24,0,0,1,128,216ZM48,184c7.7-13.24,16-43.92,16-80a64,64,0,1,1,128,0c0,36.05,8.28,66.73,16,80Z"></path>
                </svg>
              </div>

              <div style={{ fontWeight: 900, fontSize: 18, color: "var(--text)", marginBottom: 8 }}>
                {t(locale, "noNotificationsTitle")}
              </div>
              <div style={{ color: "var(--text)", opacity: 0.75, lineHeight: 1.45 }}>
                {t(locale, "noNotificationsBody")}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  padding: 6,
  cursor: "pointer",
  color: "var(--primary)",
  display: "grid",
  placeItems: "center",
};