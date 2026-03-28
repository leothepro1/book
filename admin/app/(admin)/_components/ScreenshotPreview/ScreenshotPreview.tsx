"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getScreenshotStatus, type ScreenshotStatus } from "@/app/_lib/screenshots/status";

interface Props {
  tenantId: string;
  initialStatus: ScreenshotStatus;
  portalUrl?: string | null;
}

export function ScreenshotPreview({ tenantId, initialStatus, portalUrl }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<ScreenshotStatus>(initialStatus);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll while pending
  useEffect(() => {
    if (!status.pending) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(async () => {
      const fresh = await getScreenshotStatus(tenantId);
      setStatus(fresh);
      if (!fresh.pending && intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status.pending, tenantId]);

  const hasScreenshot = !!status.desktopUrl;
  const isPending = status.pending;

  return (
    <div className="ss-preview" onClick={() => router.push("/editor")} style={{ cursor: "pointer" }}>
      <div className="ss-preview__devices">
        {/* Desktop */}
        <div className="ss-preview__desktop">
          {hasScreenshot && status.desktopUrl ? (
            <img
              src={status.desktopUrl}
              alt="Desktop"
              className="ss-preview__img"
              style={{ opacity: isPending ? 0.5 : 1 }}
            />
          ) : (
            <div className="ss-preview__placeholder">
              <span className="material-symbols-rounded" style={{ fontSize: 32, color: "var(--admin-text-tertiary)" }}>desktop_windows</span>
            </div>
          )}
          {isPending && (
            <div className="ss-preview__overlay">
              <div className="ss-preview__spinner" />
            </div>
          )}
        </div>

        {/* Mobile */}
        <div className="ss-preview__mobile">
          {hasScreenshot && status.mobileUrl ? (
            <img
              src={status.mobileUrl}
              alt="Mobil"
              className="ss-preview__img"
              style={{ opacity: isPending ? 0.5 : 1 }}
            />
          ) : (
            <div className="ss-preview__placeholder">
              <span className="material-symbols-rounded" style={{ fontSize: 24, color: "var(--admin-text-tertiary)" }}>smartphone</span>
            </div>
          )}
          {isPending && (
            <div className="ss-preview__overlay">
              <div className="ss-preview__spinner ss-preview__spinner--sm" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
