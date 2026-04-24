/**
 * SEO redirect — path builders + normalization
 * ════════════════════════════════════════════
 *
 * Pure, dependency-free helpers. Callable from anywhere in the
 * codebase (server actions, middleware fetch-to-internal-API,
 * cron aggregator). No Prisma, no React, no Next.js imports.
 *
 * Design invariant: the same `normalizeRedirectPath` function runs
 * on both the write path (`collapseAndCreate`) and the read path
 * (middleware lookup). Symmetric normalization guarantees no
 * mismatch — a row inserted via the write helper is findable via
 * the middleware lookup byte-for-byte.
 */

import type { SeoResourceType } from "../types";

/**
 * Build the canonical URL path for an entity of a given type +
 * slug. Mirrors the route prefixes defined in each SEO adapter —
 * kept inline here rather than imported from the adapters so this
 * helper stays engine-dependency-free.
 *
 * Returns `null` for resource types that have no merchant-editable
 * slug (homepage, search, accommodation_index, article/blog/etc.).
 * Callers should treat `null` as "no redirect applies" and skip
 * redirect-write logic entirely for those types.
 *
 * NOTE: the returned path is pre-normalized — lowercase,
 * no trailing slash, no locale prefix. If M8 introduces locale-
 * prefixed slug routing, the prefix will be layered on by the
 * caller that knows the current locale (not this helper).
 */
export function buildRedirectPath(
  resourceType: SeoResourceType,
  slug: string,
): string | null {
  switch (resourceType) {
    case "product":
      return `/shop/products/${slug}`;
    case "product_collection":
      return `/shop/collections/${slug}`;
    case "accommodation":
      return `/stays/${slug}`;
    case "accommodation_category":
      return `/stays/categories/${slug}`;
    case "homepage":
    case "search":
    case "accommodation_index":
    case "page":
    case "article":
    case "blog":
    case "product_index":
      return null;
  }
}

/**
 * Normalize a path for redirect lookup + storage.
 *
 * Rules:
 *   - Lowercase. Slugs are already lowercase via `titleToSlug`,
 *     but external URLs entering the table (future admin-authored
 *     redirects) may be mixed-case.
 *   - Strip a single trailing slash, except when the path IS
 *     the root `/`.
 *   - Caller is responsible for stripping query string + fragment
 *     before passing the pathname in — this function only sees
 *     the pathname.
 *
 * Never throws. Never mutates input. Pure.
 */
export function normalizeRedirectPath(raw: string): string {
  let path = raw.toLowerCase();
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  return path;
}
