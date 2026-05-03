/**
 * Hand-rolled device-type classifier (loader-side only).
 *
 * Parses `navigator.userAgent` into one of four buckets:
 *
 *   desktop  — anything not matching mobile / tablet patterns
 *   mobile   — iPhone, Android with "Mobile" marker, or generic "Mobile"
 *   tablet   — iPad, Android without "Mobile" marker, or iPadOS 13+
 *              desktop-mode (MacIntel platform + multi-touch)
 *   unknown  — UA absent / empty (SSR context, headless without UA)
 *
 * WHY HAND-ROLLED. Bundle budget: the analytics worker bundle is
 * locked at <30 KB gzipped per scripts/build-analytics-runtime.mjs:71.
 * Importing ua-parser-js or bowser would consume ~7-15 KB gzipped just
 * for a four-bucket classification. The hand-rolled regex below
 * weighs in at <500 bytes.
 *
 * RUNS LOADER-SIDE ONLY. The raw User-Agent never enters the worker
 * bundle or the analytics outbox — only the four-bucket label does.
 * Privacy posture aligns with `user_agent_hash`: we leak coarse
 * device class, not the UA string.
 *
 * iPadOS 13+ EDGE CASE. Apple changed Safari on iPad to report
 * `navigator.userAgent` containing "Macintosh" + "Mac OS X" by default,
 * so a UA-only check classifies modern iPads as desktop. The fix is
 * `parseDeviceTypeFromNav()` which also reads `navigator.platform` and
 * `navigator.maxTouchPoints` — a touch-capable Mac is, in practice,
 * an iPad. Pure UA-based callers (legacy or non-browser) get the
 * coarser `parseDeviceType()` and accept the misclassification (rare;
 * iPad-with-desktop-mode users are <1% of visitors per industry data).
 *
 * NEVER THROWS. Empty / null / undefined UA returns "unknown". A
 * malformed UA (anything the regex doesn't match) returns "desktop"
 * — the safe fallback because almost-every-non-browser tool runs in
 * a desktop-class environment, and Phase 5 dashboards already filter
 * "desktop" for traffic shape rather than treating it as a precise
 * label. Bot/crawler classification is a Phase 5C concern.
 */

export type DeviceType = "desktop" | "mobile" | "tablet" | "unknown";

const TABLET_TABLET_KEYWORD = /\bTablet\b/i;
const IPAD_UA = /\biPad\b/;
const IPHONE_UA = /\biPhone\b/;
const ANDROID_UA = /\bAndroid\b/;
const MOBILE_KEYWORD = /\bMobile\b/;
const MAC_PLATFORM = /^Mac(Intel|PPC|68K)?$/;

/**
 * Classify a device based on the User-Agent string ALONE. Use
 * `parseDeviceTypeFromNav()` instead when the full Navigator object is
 * available — it covers the iPadOS 13+ MacIntel edge case.
 *
 * Empty / null / undefined UA returns "unknown" (SSR or headless
 * context). Otherwise returns one of "desktop" | "mobile" | "tablet".
 */
export function parseDeviceType(userAgent: string | null | undefined): DeviceType {
  if (typeof userAgent !== "string" || userAgent.length === 0) {
    return "unknown";
  }
  // Tablets first — order matters because Android tablets contain
  // "Android" but lack the "Mobile" marker that phones carry, and
  // iPads must beat the (theoretical) desktop fallback below.
  if (IPAD_UA.test(userAgent)) return "tablet";
  if (TABLET_TABLET_KEYWORD.test(userAgent)) return "tablet";
  if (ANDROID_UA.test(userAgent) && !MOBILE_KEYWORD.test(userAgent)) {
    return "tablet";
  }
  // Phones.
  if (IPHONE_UA.test(userAgent)) return "mobile";
  if (ANDROID_UA.test(userAgent) && MOBILE_KEYWORD.test(userAgent)) {
    return "mobile";
  }
  if (MOBILE_KEYWORD.test(userAgent)) return "mobile";
  return "desktop";
}

/**
 * Classify with the full Navigator triple `(userAgent, maxTouchPoints,
 * platform)`. Adds the iPadOS 13+ desktop-mode discriminator on top
 * of `parseDeviceType()`:
 *
 *   - If platform is MacIntel/MacPPC AND maxTouchPoints > 1 ⇒ tablet.
 *     iPadOS 13+ Safari reports a desktop UA and a Mac platform; the
 *     touch capability is the only browser-exposed signal that
 *     differentiates an iPad from a real Mac.
 *   - Otherwise delegate to `parseDeviceType(userAgent)`.
 *
 * Pass `maxTouchPoints` straight from `navigator.maxTouchPoints` and
 * `platform` straight from `navigator.platform`. Both have defensive
 * defaults if `navigator` is missing — pass `0` and `""` respectively
 * to skip the iPadOS check (the function will fall back to UA-only
 * classification, identical to `parseDeviceType()`).
 */
export function parseDeviceTypeFromNav(
  userAgent: string | null | undefined,
  maxTouchPoints: number,
  platform: string,
): DeviceType {
  if (
    typeof platform === "string" &&
    MAC_PLATFORM.test(platform) &&
    typeof maxTouchPoints === "number" &&
    maxTouchPoints > 1
  ) {
    return "tablet";
  }
  return parseDeviceType(userAgent);
}
