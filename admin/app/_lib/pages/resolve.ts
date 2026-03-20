/**
 * Page Identity Resolution
 * ════════════════════════
 *
 * Resolves which PageId the current route belongs to.
 * Used by guest layout components (header, footer) to determine
 * whether they should render based on the page layout contract.
 *
 * Works for both guest routes (/p/[token]/...) and preview routes (/preview/...).
 */

import type { PageId } from "./types";

/**
 * Route segment → PageId mapping.
 * The segment is the first path component after the token/preview root.
 */
const SEGMENT_TO_PAGE: Record<string, PageId> = {
  stays: "stays",
  account: "account",
  "check-in": "check-in",
  login: "login",
  "help-center": "help-center",
  support: "support",
};

/**
 * Resolves the PageId from a pathname.
 *
 * Supported patterns:
 *   /p/[token]            → "home"
 *   /p/[token]/stays      → "stays"
 *   /p/[token]/account    → "account"
 *   /preview/home         → "home"
 *   /preview/stays        → "stays"
 *
 * Returns "home" for unrecognized paths (safe default).
 */
export function resolvePageIdFromPathname(pathname: string): PageId {
  // Preview routes: /preview/[slug]
  if (pathname.startsWith("/preview")) {
    const slug = pathname.split("/")[2] ?? "home";
    if (slug === "home" || slug === "") return "home";
    return SEGMENT_TO_PAGE[slug] ?? "home";
  }

  // Guest routes: /p/[token]/[segment?]
  const match = pathname.match(/^\/p\/[^/]+(?:\/([^/]+))?/);
  if (!match) return "home";

  const segment = match[1];
  if (!segment) return "home";
  return SEGMENT_TO_PAGE[segment] ?? "home";
}
