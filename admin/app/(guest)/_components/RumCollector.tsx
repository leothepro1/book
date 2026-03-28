"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

type DeviceType = "desktop" | "mobile" | "tablet" | "other";

// ── Session ID (anonymous, cookiefree, 30min TTL) ───────────

const SESSION_KEY = "__rum_sid";
const SESSION_TTL_MS = 30 * 60 * 1000;

function getOrCreateSessionId(): string {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      const { id, ts } = JSON.parse(stored);
      if (Date.now() - ts < SESSION_TTL_MS) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, ts: Date.now() }));
        return id;
      }
    }
  } catch {}
  const id = crypto.randomUUID();
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, ts: Date.now() })); } catch {}
  return id;
}

// ── Device type (viewport, never UA parsing) ────────────────

function getDeviceType(): DeviceType {
  if (typeof window === "undefined") return "other";
  if (/SmartTV|SMART-TV|HbbTV|NetCast|NETTV|AppleTV|boxee|Kylo|Roku/i.test(navigator.userAgent)) return "other";
  const w = window.innerWidth;
  if (w >= 1024) return "desktop";
  if (w >= 768) return "tablet";
  return "mobile";
}

// ── Connection type ─────────────────────────────────────────

function getConnection(): string | null {
  const conn = (navigator as unknown as { connection?: { effectiveType?: string } }).connection;
  const t = conn?.effectiveType;
  if (t === "4g" || t === "3g" || t === "2g" || t === "slow-2g") return t;
  return null;
}

// ── Beacon sender ───────────────────────────────────────────

interface RumPayload {
  tenantId: string;
  sessionId: string;
  lcp: number | null;
  inp: number | null;
  cls: number | null;
  deviceType: DeviceType;
  pathname: string;
  isHardReload: boolean;
  connection: string | null;
  occurredAt: string;
}

function sendRumBeacon(payload: RumPayload): void {
  try {
    navigator.sendBeacon("/api/rum/beacon", JSON.stringify(payload));
  } catch {}
}

// ── Component ───────────────────────────────────────────────

export function RumCollector({ tenantId }: { tenantId: string }) {
  const pathname = usePathname();
  const prevPathnameRef = useRef<string | null>(null);
  const metricsRef = useRef<{ inp: number | null; cls: number | null }>({ inp: null, cls: null });
  const isFirstLoad = useRef(true);

  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    const deviceType = getDeviceType();
    const connection = getConnection();

    // Flush previous route metrics on SPA navigation
    if (prevPathnameRef.current && prevPathnameRef.current !== pathname) {
      const { inp, cls } = metricsRef.current;
      if (inp !== null || cls !== null) {
        sendRumBeacon({
          tenantId,
          sessionId,
          lcp: null,
          inp,
          cls,
          deviceType,
          pathname: prevPathnameRef.current,
          isHardReload: false,
          connection,
          occurredAt: new Date().toISOString(),
        });
        metricsRef.current = { inp: null, cls: null };
      }
    }

    prevPathnameRef.current = pathname;

    import("web-vitals").then(({ onLCP, onINP, onCLS }) => {
      // LCP — only on hard reload (first page load)
      if (isFirstLoad.current) {
        isFirstLoad.current = false;
        onLCP((metric) => {
          sendRumBeacon({
            tenantId,
            sessionId,
            lcp: metric.value,
            inp: null,
            cls: null,
            deviceType,
            pathname,
            isHardReload: true,
            connection,
            occurredAt: new Date().toISOString(),
          });
        }, { reportAllChanges: false });
      }

      // INP + CLS — updated continuously, flushed on route change or unload
      onINP((metric) => { metricsRef.current.inp = metric.value; }, { reportAllChanges: true });
      onCLS((metric) => { metricsRef.current.cls = metric.value; }, { reportAllChanges: true });
    });

    // Pageview beacon — session counting
    sendRumBeacon({
      tenantId,
      sessionId,
      lcp: null,
      inp: null,
      cls: null,
      deviceType,
      pathname,
      isHardReload: isFirstLoad.current,
      connection,
      occurredAt: new Date().toISOString(),
    });

    // Flush on page unload (tab close, browser close)
    const handleUnload = () => {
      const { inp, cls } = metricsRef.current;
      if (inp !== null || cls !== null) {
        sendRumBeacon({
          tenantId,
          sessionId,
          lcp: null,
          inp,
          cls,
          deviceType,
          pathname,
          isHardReload: false,
          connection,
          occurredAt: new Date().toISOString(),
        });
      }
    };

    window.addEventListener("pagehide", handleUnload);
    return () => window.removeEventListener("pagehide", handleUnload);
  }, [pathname, tenantId]);

  return null;
}
