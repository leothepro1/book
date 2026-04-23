/**
 * Shared Accommodation ItemList Helper
 * ════════════════════════════════════
 *
 * Emitted from every adapter that displays a list of accommodations
 * on a CollectionPage: `accommodation-index`, `accommodation-
 * category`, and any future type that surfaces accommodation
 * previews (e.g. spot-maps or a featured-cabins rail).
 *
 * ── Why this helper exists ───────────────────────────────────────
 * After writing accommodation-index and accommodation-category the
 * two `buildAccommodationItemList` implementations were byte-for-
 * byte identical. Duplication is the wrong default when the two
 * pieces will evolve together (same Rich Results constraints, same
 * `/stays/{slug}` URL shape, same `nameOverride ?? name` title
 * resolution).
 *
 * Collocating here also means future behaviour tweaks — a new
 * Rich Results field Google adds, a schema.org rename, a URL
 * shape change — land in one place rather than two that can drift.
 *
 * ── What is NOT here ─────────────────────────────────────────────
 * The `CollectionPage` and `BreadcrumbList` builders remain
 * adapter-local. They carry adapter-specific shape (e.g. index
 * uses a 2-level breadcrumb, category a 3-level). Extraction
 * criteria: identical code AND shared semantic. Breadcrumbs fail
 * both tests.
 *
 * The filename uses a `_itemlist` prefix (leading underscore) to
 * signal "internal helper — do not import from outside this
 * directory." Adapter consumers go through `adapters/*.ts`.
 */

import { buildAbsoluteUrl } from "../paths";
import type { SeoTenantContext, StructuredDataObject } from "../types";
import type { AccommodationWithMedia } from "./accommodation";

/**
 * Prefer the merchant's override label; fall back to the PMS/sync
 * name. Single source of truth so adapters never read these two
 * fields in isolation.
 */
export function resolvedAccommodationTitle(
  acc: AccommodationWithMedia,
): string {
  return acc.nameOverride ?? acc.name;
}

/**
 * Absolute URL to an accommodation detail page in the given
 * request locale. The `/stays/{slug}` shape is the canonical
 * accommodation route; if that route ever moves, this one helper
 * is the single change site.
 */
export function accommodationDetailUrl(
  acc: AccommodationWithMedia,
  tenant: SeoTenantContext,
  locale: string,
): string {
  return buildAbsoluteUrl(tenant, locale, `/stays/${acc.slug}`);
}

/**
 * Build a schema.org `ItemList` of accommodations. Positions are
 * 1-indexed (schema.org convention). `image` is emitted only when
 * the accommodation has ≥ 1 media row — omitted entries still pass
 * Rich Results validation.
 *
 * The caller is responsible for:
 *   - Filtering the list to the accommodations they want surfaced
 *     (ACTIVE, non-archived, tenant-scoped).
 *   - Capping the length at whatever ItemList limit the adapter
 *     enforces (MAX_ITEMLIST_MEMBERS).
 *
 * This function does NOT filter, sort, or cap — it consumes what
 * it is given.
 */
export function buildAccommodationItemList(
  accommodations: readonly AccommodationWithMedia[],
  tenant: SeoTenantContext,
  locale: string,
): StructuredDataObject {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: accommodations.map((acc, idx) => {
      const item: Record<string, unknown> = {
        "@type": "ListItem",
        position: idx + 1,
        name: resolvedAccommodationTitle(acc),
        url: accommodationDetailUrl(acc, tenant, locale),
      };
      const firstMedia = acc.media[0];
      if (firstMedia) item.image = firstMedia.url;
      return item;
    }),
  };
}
