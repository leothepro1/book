/**
 * M7 Sitemap — production ShardRegistry
 * ═════════════════════════════════════
 *
 * Single-source-of-truth composition of the five
 * `SitemapResourceType` fetchers. Consumed by M7.3 route handlers
 * which pass this registry to `buildSitemapIndexForTenant` and
 * `buildShardForTenant`.
 *
 * Pure composition — no logic, no side effects. Adding a new
 * `SitemapResourceType` = add its fetcher somewhere + one line
 * here. The `Record<SitemapResourceType, ...>` type on
 * `ShardRegistry` prevents half-wired registries from ever
 * compiling.
 *
 * This module is the ONLY production callsite that pulls Prisma-
 * bound fetchers into the `seo/sitemap/` tree. The aggregator
 * (`aggregator.ts`) and serializer (`xml.ts`, `robots.ts`) stay
 * Prisma-free and dependency-injectable.
 */

import {
  fetchAccommodationCategoriesForSitemap,
  fetchAccommodationsForSitemap,
} from "../../accommodations/queries";
import {
  fetchProductCollectionsForSitemap,
  fetchProductsForSitemap,
} from "../../products/queries";
import { fetchPagesForSitemap } from "./pages-source";
import type { ShardRegistry } from "./types";

export const PRODUCTION_SHARD_REGISTRY: ShardRegistry = {
  accommodations: fetchAccommodationsForSitemap,
  accommodation_categories: fetchAccommodationCategoriesForSitemap,
  products: fetchProductsForSitemap,
  product_collections: fetchProductCollectionsForSitemap,
  pages: fetchPagesForSitemap,
};
