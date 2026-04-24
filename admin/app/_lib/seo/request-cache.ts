/**
 * SEO Engine — Request-scoped cache
 * ═════════════════════════════════
 *
 * The boundary between the SEO engine and the Next.js App Router.
 *
 * Every seoable route calls `resolveSeoForRequest` from BOTH
 * `generateMetadata` and the page body. React's `cache()` guarantees
 * a single actual resolution per request — the second call returns
 * the memoized result instead of re-running the engine or re-querying
 * Prisma.
 *
 * Key contract: `cache()` memoization is keyed by SameValue of
 * positional arguments. That's why `resolveSeoForRequest` takes
 * primitives (`tenantId`, `slug`, `locale`, `resourceType`) instead of
 * a context object. If callers pass primitives that serialize to the
 * same tuple, they share a memo slot even if they constructed the
 * args independently.
 *
 * The resolver + ImageService + PageTypeSeoDefaultRepository are
 * stateless module-level singletons. Safe to share across requests
 * because they hold no per-request state.
 */

import { cache } from "react";

import { prisma } from "../db/prisma";

import { ACCOMMODATION_SELECT } from "../accommodations/types";
import { tenantToSeoContext } from "../tenant/seo-context";

import type { AccommodationWithMedia } from "./adapters/accommodation";
import {
  type AccommodationCategoryWithItems,
  categorySeoInclude,
} from "./adapters/accommodation-category";
import type { ProductWithMedia } from "./adapters/product";
import {
  type ProductCollectionWithItems,
  collectionSeoInclude,
} from "./adapters/product-collection";
import type { SearchSeoInput } from "./adapters/search";
import { ensureSeoBootstrapped } from "./bootstrap";
import { createCloudinaryImageService } from "./image-service-impl";
import { createPageTypeSeoDefaultRepository } from "./page-type-defaults-impl";
import { SeoResolver } from "./resolver";
import type {
  ResolvedSeo,
  SeoResourceType,
  SeoTenantContext,
} from "./types";

// ── Stateless singletons ──────────────────────────────────────
//
// Created once per Node process. Thread-safe because both
// constructors return plain objects with no mutable state. Safe to
// share across concurrent requests.

const resolver = new SeoResolver(
  createCloudinaryImageService(),
  createPageTypeSeoDefaultRepository(),
);

// ── Request-scoped fetchers (React cache()) ──────────────────

/**
 * Fetch the accommodation row for SEO purposes, tenant-scoped.
 * Tries by slug first; falls back to `externalId` lookup to match
 * the behaviour of `app/(guest)/stays/[slug]/page.tsx`.
 *
 * Dedupes across `generateMetadata` and the page body via `cache()`.
 * Tenant isolation is enforced at the Prisma `where` level — a
 * malicious slug paste from another tenant returns null.
 */
export const getAccommodationForSeo = cache(
  async (
    tenantId: string,
    slug: string,
  ): Promise<AccommodationWithMedia | null> => {
    let row = await prisma.accommodation.findFirst({
      where: { tenantId, slug, archivedAt: null, status: "ACTIVE" },
      select: ACCOMMODATION_SELECT,
    });
    if (!row) {
      row = await prisma.accommodation.findFirst({
        where: {
          tenantId,
          externalId: slug,
          archivedAt: null,
          status: "ACTIVE",
        },
        select: ACCOMMODATION_SELECT,
      });
    }
    // Prisma's `select` narrows the return type away from the full
    // `Accommodation` shape the adapter's `AccommodationWithMedia`
    // is defined in terms of. ACCOMMODATION_SELECT is the
    // source-of-truth for "which fields are loaded"; if it ever
    // drops a field the adapter needs, the adapter's tests catch
    // it before anyone pushes. The cast is safe under that
    // invariant; the existing page uses the same pattern.
    return row as unknown as AccommodationWithMedia | null;
  },
);

/**
 * Fetch the product row for SEO purposes, tenant-scoped, in the
 * shape the `productSeoAdapter` expects: raw Prisma `Product` with
 * `media` + `variants` relations.
 *
 * Deliberately distinct from `getProductBySlug` in
 * `app/_lib/products/actions.ts` — that helper runs the product
 * through `resolveProduct()` into a `ResolvedProduct`, which strips
 * fields the SEO adapter needs (seo JSONB, variants shape). The SEO
 * engine queries the raw row directly.
 *
 * Filters applied at the DB layer (mirror `productSeoAdapter.isIndexable`):
 *   - `status: "ACTIVE"`
 *   - `archivedAt: null`
 *   - `productType: "STANDARD"` (GIFT_CARD has its own adapter later)
 *
 * Caller-facing `seoOverrides.noindex` is NOT filtered here — the
 * resolver consumes it via the adapter and emits the appropriate
 * robots meta tag.
 */
export const getProductForSeo = cache(
  async (
    tenantId: string,
    slug: string,
  ): Promise<ProductWithMedia | null> => {
    const row = await prisma.product.findFirst({
      where: {
        tenantId,
        slug,
        status: "ACTIVE",
        archivedAt: null,
        productType: "STANDARD",
      },
      include: {
        media: { orderBy: { sortOrder: "asc" } },
        variants: { orderBy: { sortOrder: "asc" } },
      },
    });
    return row;
  },
);

/**
 * Fetch the product collection row for SEO purposes, tenant-scoped,
 * in the shape `productCollectionSeoAdapter` expects. Uses
 * `collectionSeoInclude(tenantId)` so the inner items are pre-filtered
 * to ACTIVE STANDARD members and capped at `MAX_ITEMLIST_MEMBERS` at
 * the DB layer.
 *
 * Returns null for DRAFT collections — the caller emits a noindex
 * stub. The adapter's own `isIndexable` handles `seo.noindex`
 * overrides on indexable-by-status collections.
 */
export const getCollectionForSeo = cache(
  async (
    tenantId: string,
    slug: string,
  ): Promise<ProductCollectionWithItems | null> => {
    const row = await prisma.productCollection.findFirst({
      where: { tenantId, slug, status: "ACTIVE" },
      include: collectionSeoInclude(tenantId),
    });
    return row as ProductCollectionWithItems | null;
  },
);

/**
 * Fetch the accommodation category row for SEO purposes,
 * tenant-scoped, in the shape `accommodationCategorySeoAdapter`
 * expects. Uses `categorySeoInclude(tenantId)` so inner items are
 * pre-filtered to ACTIVE, non-archived accommodations and capped at
 * `MAX_ITEMLIST_MEMBERS` at the DB layer.
 *
 * Returns null for non-ACTIVE categories. The adapter's own
 * `isIndexable` handles the empty-items case (category with zero
 * members is treated as thin content and emits noindex).
 */
export const getCategoryForSeo = cache(
  async (
    tenantId: string,
    slug: string,
  ): Promise<AccommodationCategoryWithItems | null> => {
    const row = await prisma.accommodationCategory.findFirst({
      where: { tenantId, slug, status: "ACTIVE" },
      include: categorySeoInclude(tenantId),
    });
    return row as AccommodationCategoryWithItems | null;
  },
);

/**
 * Fetch the tenant + its locale rows and convert to SeoTenantContext.
 * Dedupes across multiple resolves for the same tenant in one request.
 */
const getSeoTenantContextCached = cache(
  async (tenantId: string): Promise<SeoTenantContext | null> => {
    const [tenant, locales] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId } }),
      prisma.tenantLocale.findMany({ where: { tenantId } }),
    ]);
    if (!tenant) return null;
    return tenantToSeoContext({ tenant, locales });
  },
);

// ── Public entry point ──────────────────────────────────────

/**
 * Resolve the full `ResolvedSeo` object for a request. Called from
 * both `generateMetadata` and the page component; `cache()` ensures
 * the engine runs exactly once per (tenantId, slug, locale,
 * resourceType) tuple per request.
 *
 * Returns `null` when the referenced resource does not exist. Callers
 * are responsible for emitting a noindex 404 metadata in that case.
 *
 * **Note on `slug`:** `slug` is a positional primitive so the React
 * `cache()` key is a string-tuple. Some resource types don't have
 * a slug — notably `"homepage"` and `"search"`, where the tenant IS
 * the resource. For those, callers pass `slug: ""` and the
 * dispatched fetcher ignores it.
 *
 * @throws Only if `resourceType` isn't wired up here yet. That's a
 *   programmer-error path — never a runtime 500 for a merchant's
 *   content.
 */
export const resolveSeoForRequest = cache(
  async (
    tenantId: string,
    slug: string,
    locale: string,
    resourceType: SeoResourceType,
  ): Promise<ResolvedSeo | null> => {
    // Single, grep-able callsite that guarantees adapter registration
    // happens before any `resolve()` call, regardless of which route
    // triggers the first resolution in a cold Node process.
    ensureSeoBootstrapped();

    switch (resourceType) {
      case "homepage":
        return fetchAndResolveHomepage(tenantId, locale);
      case "accommodation":
        return fetchAndResolveAccommodation(tenantId, slug, locale);
      case "product":
        return fetchAndResolveProduct(tenantId, slug, locale);
      case "product_collection":
        return fetchAndResolveProductCollection(tenantId, slug, locale);
      case "accommodation_category":
        return fetchAndResolveAccommodationCategory(tenantId, slug, locale);
      case "search":
        return fetchAndResolveSearch(tenantId, locale);
      default:
        throw new Error(
          `resourceType ${resourceType} not wired in request-cache yet`,
        );
    }
  },
);

// ── Per-resource-type fetch+resolve helpers ──────────────────

/**
 * Generate a per-request correlation id. Used by the resolver and every
 * adapter log event so that one HTTP request's SEO work is grep-able in
 * structured logs. `crypto.randomUUID()` is Node 19+ / Edge-runtime safe
 * and deterministic in that it never collides in practice.
 */
function newRequestId(): string {
  return crypto.randomUUID();
}

async function fetchAndResolveHomepage(
  tenantId: string,
  locale: string,
): Promise<ResolvedSeo | null> {
  // Homepage has no per-entity fetch — the tenant IS the entity.
  // Just resolve tenant context (cached across callsites) and run
  // the engine with an empty entity placeholder. The homepage
  // adapter (adapters/homepage.ts) reads everything it needs from
  // `tenant.seoDefaults.homepage` and `tenant` itself.
  const tenantContext = await getSeoTenantContextCached(tenantId);
  if (!tenantContext) return null;

  return resolver.resolve({
    tenant: tenantContext,
    resourceType: "homepage",
    entity: {},
    locale,
    requestId: newRequestId(),
  });
}

async function fetchAndResolveAccommodation(
  tenantId: string,
  slug: string,
  locale: string,
): Promise<ResolvedSeo | null> {
  const [tenantContext, accommodation] = await Promise.all([
    getSeoTenantContextCached(tenantId),
    getAccommodationForSeo(tenantId, slug),
  ]);
  if (!tenantContext) return null;
  if (!accommodation) return null;

  return resolver.resolve({
    tenant: tenantContext,
    resourceType: "accommodation",
    entity: accommodation,
    locale,
    requestId: newRequestId(),
  });
}

async function fetchAndResolveProduct(
  tenantId: string,
  slug: string,
  locale: string,
): Promise<ResolvedSeo | null> {
  const [tenantContext, product] = await Promise.all([
    getSeoTenantContextCached(tenantId),
    getProductForSeo(tenantId, slug),
  ]);
  if (!tenantContext) return null;
  if (!product) return null;

  return resolver.resolve({
    tenant: tenantContext,
    resourceType: "product",
    entity: product,
    locale,
    requestId: newRequestId(),
  });
}

async function fetchAndResolveProductCollection(
  tenantId: string,
  slug: string,
  locale: string,
): Promise<ResolvedSeo | null> {
  const [tenantContext, collection] = await Promise.all([
    getSeoTenantContextCached(tenantId),
    getCollectionForSeo(tenantId, slug),
  ]);
  if (!tenantContext) return null;
  if (!collection) return null;

  return resolver.resolve({
    tenant: tenantContext,
    resourceType: "product_collection",
    entity: collection,
    locale,
    requestId: newRequestId(),
  });
}

async function fetchAndResolveAccommodationCategory(
  tenantId: string,
  slug: string,
  locale: string,
): Promise<ResolvedSeo | null> {
  const [tenantContext, category] = await Promise.all([
    getSeoTenantContextCached(tenantId),
    getCategoryForSeo(tenantId, slug),
  ]);
  if (!tenantContext) return null;
  if (!category) return null;

  return resolver.resolve({
    tenant: tenantContext,
    resourceType: "accommodation_category",
    entity: category,
    locale,
    requestId: newRequestId(),
  });
}

async function fetchAndResolveSearch(
  tenantId: string,
  locale: string,
): Promise<ResolvedSeo | null> {
  // Search has no Prisma entity — synthesize `SearchSeoInput` from
  // tenant context. `activeLocales` is restricted to defaultLocale
  // for symmetry with the sitemap locale defer (M8 will restore the
  // full list when locale-prefix routes land). The search adapter
  // emits zero sitemap entries regardless, so the value is
  // cosmetic today.
  const tenantContext = await getSeoTenantContextCached(tenantId);
  if (!tenantContext) return null;

  const searchInput: SearchSeoInput = {
    tenantId,
    activeLocales: [tenantContext.defaultLocale],
  };

  return resolver.resolve({
    tenant: tenantContext,
    resourceType: "search",
    entity: searchInput,
    locale,
    requestId: newRequestId(),
  });
}
