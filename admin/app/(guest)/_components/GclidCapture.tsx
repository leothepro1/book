"use client";

import { useEffect } from "react";

const STORAGE_KEY = "bf_gclid";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Captures gclid from URL params on ad click landing pages.
 * Stores in sessionStorage with 30-day expiry.
 * Runs silently on every guest page — zero UX impact.
 * GCLID is appended by Google Ads to ad click URLs automatically.
 */
export function GclidCapture() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const gclid = params.get("gclid");

      if (gclid) {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ gclid, timestamp: Date.now() }),
        );
      }
    } catch {
      // sessionStorage not available — silently skip
    }
  }, []);

  return null;
}

/**
 * Read captured GCLID from sessionStorage.
 * Returns null if not found or expired (>30 days).
 * Called from checkout client to include in order metadata.
 */
export function getCapturedGclid(): string | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw) as { gclid: string; timestamp: number };
    if (Date.now() - data.timestamp > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return data.gclid;
  } catch {
    return null;
  }
}
