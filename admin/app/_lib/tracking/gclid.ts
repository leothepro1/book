/**
 * GCLID — Google Click ID capture and persistence.
 *
 * GCLID arrives as ?gclid=... when a guest clicks a Google Ad.
 * Stored in sessionStorage so it survives page navigation
 * but not cross-session (GCLID is click-specific).
 *
 * See also: app/(guest)/_components/GclidCapture.tsx
 * which calls persistGclid() on mount in the guest layout.
 */

const STORAGE_KEY = "bedfront_gclid";

export function getGclidFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("gclid") ?? null;
}

export function persistGclid(): void {
  const gclid = getGclidFromUrl();
  if (gclid) {
    sessionStorage.setItem(STORAGE_KEY, gclid);
  }
}

export function getStoredGclid(): string | null {
  if (typeof window === "undefined") return null;
  // Prefer URL param (freshest), fall back to sessionStorage
  return getGclidFromUrl() ?? sessionStorage.getItem(STORAGE_KEY);
}
