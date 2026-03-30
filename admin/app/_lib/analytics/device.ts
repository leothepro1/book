/**
 * Device Type Detection — Server-side User-Agent parsing.
 * No external dependencies — regex-based, deterministic.
 */

export type DeviceTypeResult = "DESKTOP" | "MOBILE" | "TABLET";

export function parseDeviceType(userAgent: string | null): DeviceTypeResult {
  if (!userAgent) return "DESKTOP";

  const ua = userAgent.toLowerCase();

  // Tablet detection must come before mobile
  if (
    /ipad/.test(ua) ||
    (/macintosh/.test(ua) && /safari/.test(ua) && !/chrome/.test(ua) && /mobile/.test(ua)) ||
    /tablet/.test(ua) ||
    (/android/.test(ua) && !/mobile/.test(ua))
  ) {
    return "TABLET";
  }

  if (/iphone|ipod|android.*mobile|windows phone|blackberry|mobile/.test(ua)) {
    return "MOBILE";
  }

  return "DESKTOP";
}
