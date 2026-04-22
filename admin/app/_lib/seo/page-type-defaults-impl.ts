/**
 * SEO Engine — PageTypeSeoDefaultRepository (Prisma)
 * ══════════════════════════════════════════════════
 *
 * Reads per-tenant, per-page-type SEO defaults from Postgres.
 *
 * No caching in M3: one Prisma read per `resolve()` call. Reads are
 * keyed on the unique `(tenantId, pageType)` index, so they're
 * O(log n) and measured in sub-millisecond on warm cache. Redis
 * caching arrives only when hot-path latency is demonstrably
 * bottlenecked on this query.
 *
 * SeoResourceType (lowercase, engine-side) is mapped to SeoPageType
 * (uppercase, DB enum) via an explicit exhaustive `Record`. Extending
 * `SeoResourceType` will trigger a compile error here, which is the
 * intended safety net.
 */

import type { SeoPageType, PageTypeSeoDefault } from "@prisma/client";

import { prisma } from "../db/prisma";
import { log } from "../logger";

import type { PageTypeSeoDefaultRepository } from "./dependencies";
import type { SeoResourceType } from "./types";

/**
 * Exhaustive SeoResourceType → SeoPageType mapping.
 *
 * Exported for testing only. Changing either enum requires updating
 * this map; TypeScript enforces exhaustiveness.
 */
export const RESOURCE_TYPE_TO_PAGE_TYPE: Record<SeoResourceType, SeoPageType> = {
  homepage: "HOMEPAGE",
  accommodation: "ACCOMMODATION",
  accommodation_category: "ACCOMMODATION_CATEGORY",
  accommodation_index: "ACCOMMODATION_INDEX",
  product: "PRODUCT",
  product_collection: "PRODUCT_COLLECTION",
  product_index: "PRODUCT_INDEX",
  page: "PAGE",
  article: "ARTICLE",
  blog: "BLOG",
  search: "SEARCH",
};

/**
 * Factory for the Prisma-backed repository. Takes no arguments because
 * `prisma` is a module-level singleton.
 */
export function createPageTypeSeoDefaultRepository(): PageTypeSeoDefaultRepository {
  return {
    async get(
      tenantId: string,
      resourceType: SeoResourceType,
    ): Promise<PageTypeSeoDefault | null> {
      const pageType = RESOURCE_TYPE_TO_PAGE_TYPE[resourceType];
      try {
        return await prisma.pageTypeSeoDefault.findUnique({
          where: { tenantId_pageType: { tenantId, pageType } },
        });
      } catch (error) {
        // Transient DB failure must not take down page rendering.
        // Log and return null — resolver falls through to tenant template.
        log("error", "seo.page_type_defaults.db_error", {
          tenantId,
          resourceType,
          reason: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },
  };
}
