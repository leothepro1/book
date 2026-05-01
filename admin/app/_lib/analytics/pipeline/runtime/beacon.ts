/**
 * Phase 3 PR-B Commit H — Dispatch helpers (fetch keepalive + Beacon).
 *
 * Two transports for the same envelope:
 *
 *   `dispatchKeepalive` — used during normal page lifetime. fetch
 *     with `keepalive: true` is the modern equivalent of sendBeacon
 *     for in-page events: it returns a Promise (so we can attach an
 *     error log) and supports custom headers (Content-Type, etc.)
 *     that sendBeacon cannot set.
 *
 *   `dispatchBeacon` — used during page-unload. `navigator.sendBeacon`
 *     is the only transport with a browser-vendor commitment to
 *     attempt delivery after the page is gone. Cannot set headers,
 *     so we send `application/json` via Blob constructor (the
 *     dispatch endpoint accepts both `application/json` and
 *     `text/plain`, see PR-A's collect/route.ts).
 *
 * Both return `boolean`: `true` = transport accepted the request,
 * `false` = transport unavailable (legacy browser, sendBeacon quota
 * exceeded, etc.). Neither throws — the caller never wants
 * analytics to crash the page on the unload path.
 */

import type { RequestEnvelope } from "./worker-types";

export const DEFAULT_DISPATCH_URL = "/api/analytics/collect";

export function dispatchKeepalive(
  envelope: RequestEnvelope,
  url: string = DEFAULT_DISPATCH_URL,
): boolean {
  try {
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
      credentials: "include",
      keepalive: true,
    }).catch(() => {
      /* dispatch failed — caller's error reporter handles logging */
    });
    return true;
  } catch {
    return false;
  }
}

export function dispatchBeacon(
  envelope: RequestEnvelope,
  url: string = DEFAULT_DISPATCH_URL,
): boolean {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.sendBeacon !== "function"
  ) {
    return false;
  }
  try {
    const blob = new Blob([JSON.stringify(envelope)], {
      type: "application/json",
    });
    return navigator.sendBeacon(url, blob);
  } catch {
    return false;
  }
}
