/**
 * SEO Engine — Request-scoped cache
 * ═════════════════════════════════
 *
 * The boundary between the SEO engine and the Next.js App Router.
 *
 * Every accommodation route (currently only `/stays/[slug]`) calls
 * `resolveSeoForRequest` from BOTH `generateMetadata` and the page
 * body. React's `cache()` guarantees a single actual resolution per
 * request — the second call returns the memoized result instead of
 * re-running the engine or re-querying Prisma.
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
 * a slug — notably `"homepage"`, where the tenant IS the resource.
 * For those, callers pass `slug: ""` and the dispatched fetcher
 * ignores it.
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
