"use client";

import { useEffect } from "react";

const STORAGE_KEY = "bf_utm";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Captures UTM params from URL on landing pages.
 * Stores in sessionStorage with 30-day expiry.
 * Used for email marketing revenue attribution.
 */
export function UtmCapture() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const source = params.get("utm_source");
      if (!source) return;

      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        source,
        medium: params.get("utm_medium") ?? "",
        campaign: params.get("utm_campaign") ?? "",
        content: params.get("utm_content") ?? "",
        id: params.get("utm_id") ?? "",
        capturedAt: Date.now(),
      }));
    } catch {
      // sessionStorage not available
    }
  }, []);

  return null;
}

export type UtmParams = {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  id: string;
};

export function getCapturedUtm(): UtmParams | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);
    if (Date.now() - (data.capturedAt ?? 0) > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return {
      source: data.source ?? "",
      medium: data.medium ?? "",
      campaign: data.campaign ?? "",
      content: data.content ?? "",
      id: data.id ?? "",
    };
  } catch {
    return null;
  }
}
