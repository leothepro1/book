/**
 * SEO Engine — Preview for in-flight admin overrides
 * ═══════════════════════════════════════════════════
 *
 * Merchant edits in the admin SEO panel need a live preview without
 * persisting. `resolveSeoForRequest` reads `entity.seo` from Prisma
 * and therefore can't see unsaved overrides. `previewSeoForEntity`
 * is the thin wrapper that:
 *
 *   1. Fetches the entity via the existing request-cache helpers
 *      (tenant-scoped, cache()-wrapped).
 *   2. Shallow-merges the admin's unsaved overrides over the entity's
 *      stored `seo` JSONB. Override wins; untouched fields carry.
 *   3. Runs the resolver against the synthetic in-memory entity.
 *   4. Shapes the result for the admin UI (SearchListingEditor),
 *      including a breadcrumb-formatted display URL and a favicon URL
 *      if the tenant has configured one.
 *
 * This module is server-only by convention — it imports Prisma and
 * the resolver (which pulls Prisma via its dependencies). Callers are
 * server actions, route handlers, or RSCs.
 *
 * ── Scope ────────────────────────────────────────────────────────
 * Supported resource types:
 *   - homepage          (no entity — tenant IS the resource)
 *   - accommodation
 *   - accommodation_category
 *   - product
 *   - product_collection
 *
 * Unsupported (throws):
 *   - accommodation_index  (deferred until /stays is a real index)
 *   - search               (always noindex; preview is not meaningful)
 *   - page / article / blog / product_index / etc. (no adapter wired)
 *
 * ── Missing-entity behaviour ────────────────────────────────────
 * When the cache fetcher returns null (entity archived or malformed
 * id), we fall through to a synthetic preview built from tenant
 * defaults + overrides — no resolver run. The admin UI stays
 * responsive and displays whatever the merchant has typed over a
 * neutral domain+breadcrumb shell.
 */

import { prisma } from "../db/prisma";
import { tenantToSeoContext } from "../tenant/seo-context";
import {
  getAccommodationForSeo,
  getCategoryForSeo,
  getCollectionForSeo,
  getProductForSeo,
} from "./request-cache";
import { ensureSeoBootstrapped } from "./bootstrap";
import { createCloudinaryImageService } from "./image-service-impl";
import { createPageTypeSeoDefaultRepository } from "./page-type-defaults-impl";
import { SeoResolver } from "./resolver";
import { buildAbsoluteUrl } from "./paths";
import type { SeoMetadata, SeoResourceType, SeoTenantContext } from "./types";

// ── Supported set ─────────────────────────────────────────────

type PreviewableResourceType =
  | "homepage"
  | "accommodation"
  | "accommodation_category"
  | "product"
  | "product_collection";

function isPreviewable(
  resourceType: SeoResourceType,
): resourceType is PreviewableResourceType {
  return (
    resourceType === "homepage" ||
    resourceType === "accommodation" ||
    resourceType === "accommodation_category" ||
    resourceType === "product" ||
    resourceType === "product_collection"
  );
}

// ── Engine singletons ─────────────────────────────────────────
//
// Same pattern as `request-cache.ts` — one resolver per Node process
// so admin previews reuse the production dependency graph. No per-
// request state lives here.

const resolver = new SeoResolver(
  createCloudinaryImageService(),
  createPageTypeSeoDefaultRepository(),
);

// ── Public result shape ───────────────────────────────────────

export interface SeoPreviewResult {
  readonly title: string;
  readonly description: string;
  readonly canonicalUrl: string;
  /**
   * Breadcrumb-formatted URL, e.g. "domain.com › products › slug".
   * What Google shows in the SERP row above the title. Derived from
   * `canonicalUrl` — protocol stripped, `/` segments joined with
   * " › ".
   */
  readonly displayUrl: string;
  readonly ogImageUrl: string | null;
  readonly faviconUrl: string | null;
}

// ── Public entry point ────────────────────────────────────────

export async function previewSeoForEntity(args: {
  tenantId: string;
  resourceType: SeoResourceType;
  entityId: string;
  overrides: Partial<SeoMetadata>;
  locale: string;
}): Promise<SeoPreviewResult> {
  const { tenantId, resourceType, entityId, overrides, locale } = args;

  if (!isPreviewable(resourceType)) {
    throw new Error(
      `previewSeoForEntity does not support resourceType ${resourceType}`,
    );
  }

  ensureSeoBootstrapped();

  const tenantCtx = await loadTenantContext(tenantId);
  if (!tenantCtx) {
    throw new Error(`Tenant ${tenantId} not found`);
  }

  const faviconUrl = await resolveFaviconUrl(tenantCtx, tenantId);

  if (resourceType === "homepage") {
    return previewHomepage(tenantCtx, overrides, locale, faviconUrl);
  }

  const entity = await fetchEntityForPreview(
    resourceType,
    tenantId,
    entityId,
  );
  if (!entity) {
    return fallbackPreview(
      tenantCtx,
      resourceType,
      entityId,
      overrides,
      locale,
      faviconUrl,
    );
  }

  return runResolverPreview(
    tenantCtx,
    resourceType,
    entity,
    overrides,
    locale,
    faviconUrl,
  );
}

// ── Tenant context ────────────────────────────────────────────

async function loadTenantContext(
  tenantId: string,
): Promise<SeoTenantContext | null> {
  const [tenant, locales] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    prisma.tenantLocale.findMany({ where: { tenantId } }),
  ]);
  if (!tenant) return null;
  return tenantToSeoContext({ tenant, locales });
}

// ── Favicon resolution ────────────────────────────────────────
//
// `tenant.seoDefaults.faviconId` (when set) references a MediaAsset
// cuid. Resolve tenant-scoped to a URL, or return null when unset /
// not found. The admin UI falls through to an inline default SVG for
// nulls — so this never throws, just reports "no merchant favicon".

async function resolveFaviconUrl(
  tenantCtx: SeoTenantContext,
  tenantId: string,
): Promise<string | null> {
  const faviconId = tenantCtx.seoDefaults.faviconId;
  if (!faviconId) return null;

  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: faviconId,
      tenantId,
      deletedAt: null,
    },
    select: { url: true },
  });
  return asset?.url ?? null;
}

// ── Entity fetchers per supported resource ────────────────────

async function fetchEntityForPreview(
  resourceType: Exclude<PreviewableResourceType, "homepage">,
  tenantId: string,
  entityId: string,
): Promise<unknown> {
  switch (resourceType) {
    case "accommodation":
      // request-cache's helper is slug-based. Admin edits reference
      // entityId (cuid), so fetch by id directly — same tenant-scoped
      // filters as the public path.
      return fetchAccommodationByIdForPreview(tenantId, entityId);
    case "accommodation_category":
      return fetchCategoryByIdForPreview(tenantId, entityId);
    case "product":
      return fetchProductByIdForPreview(tenantId, entityId);
    case "product_collection":
      return fetchCollectionByIdForPreview(tenantId, entityId);
  }
}

async function fetchAccommodationByIdForPreview(
  tenantId: string,
  id: string,
): Promise<unknown> {
  // Same filters as getAccommodationForSeo, by id. The SEO adapter
  // consumes AccommodationWithMedia — select * plus media.
  const row = await prisma.accommodation.findFirst({
    where: { tenantId, id, archivedAt: null },
    include: { media: { orderBy: { sortOrder: "asc" } } },
  });
  if (!row) {
    // Cuid-based lookup missed — may be a slug. Defer to the
    // slug fetcher for parity with the public route.
    return getAccommodationForSeo(tenantId, id);
  }
  return row;
}

async function fetchCategoryByIdForPreview(
  tenantId: string,
  id: string,
): Promise<unknown> {
  const bySlug = await getCategoryForSeo(tenantId, id);
  if (bySlug) return bySlug;
  // Fall back to id lookup (admin passes entity id, not slug).
  const row = await prisma.accommodationCategory.findFirst({
    where: { tenantId, id, status: "ACTIVE" },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        take: 20,
        include: {
          accommodation: {
            include: { media: { orderBy: { sortOrder: "asc" } } },
          },
        },
      },
    },
  });
  return row;
}

async function fetchProductByIdForPreview(
  tenantId: string,
  id: string,
): Promise<unknown> {
  const bySlug = await getProductForSeo(tenantId, id);
  if (bySlug) return bySlug;
  const row = await prisma.product.findFirst({
    where: {
      tenantId,
      id,
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
}

async function fetchCollectionByIdForPreview(
  tenantId: string,
  id: string,
): Promise<unknown> {
  const bySlug = await getCollectionForSeo(tenantId, id);
  if (bySlug) return bySlug;
  const row = await prisma.productCollection.findFirst({
    where: { tenantId, id, status: "ACTIVE" },
    include: {
      items: {
        where: {
          product: {
            tenantId,
            status: "ACTIVE",
            productType: "STANDARD",
            archivedAt: null,
          },
        },
        orderBy: { sortOrder: "asc" },
        take: 20,
        include: {
          product: {
            include: {
              media: {
                where: { type: "image" },
                orderBy: { sortOrder: "asc" },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
  return row;
}

// ── Resolver path ─────────────────────────────────────────────

async function runResolverPreview(
  tenantCtx: SeoTenantContext,
  resourceType: Exclude<PreviewableResourceType, "homepage">,
  entity: unknown,
  overrides: Partial<SeoMetadata>,
  locale: string,
  faviconUrl: string | null,
): Promise<SeoPreviewResult> {
  // Synthesize an entity copy with the admin-supplied seo merged
  // shallow over the stored seo. The resolver reads entity.seo via
  // the adapter's toSeoable — so the merged object IS what drives
  // the preview.
  const synthetic = mergeOverridesIntoEntity(entity, overrides);

  const resolved = await resolver.resolve({
    tenant: tenantCtx,
    resourceType,
    entity: synthetic,
    locale,
    requestId: newRequestId(),
  });

  return {
    title: resolved.title,
    description: resolved.description ?? "",
    canonicalUrl: resolved.canonicalUrl,
    displayUrl: toBreadcrumb(resolved.canonicalUrl),
    ogImageUrl: resolved.openGraph.image?.url ?? null,
    faviconUrl,
  };
}

async function previewHomepage(
  tenantCtx: SeoTenantContext,
  overrides: Partial<SeoMetadata>,
  locale: string,
  faviconUrl: string | null,
): Promise<SeoPreviewResult> {
  // The homepage adapter reads overrides from tenant.seoDefaults.homepage.
  // Build a synthetic tenant context whose seoDefaults reflects the
  // admin's current form state — no DB write.
  const syntheticTenant: SeoTenantContext = {
    ...tenantCtx,
    seoDefaults: {
      ...tenantCtx.seoDefaults,
      homepage: {
        ...(tenantCtx.seoDefaults.homepage ?? {}),
        ...(overrides.title !== undefined ? { title: overrides.title } : {}),
        ...(overrides.description !== undefined
          ? { description: overrides.description }
          : {}),
        ...(overrides.ogImageId !== undefined
          ? { ogImageId: overrides.ogImageId }
          : {}),
        ...(overrides.noindex !== undefined
          ? { noindex: overrides.noindex }
          : { noindex: tenantCtx.seoDefaults.homepage?.noindex ?? false }),
      },
    },
  };

  const resolved = await resolver.resolve({
    tenant: syntheticTenant,
    resourceType: "homepage",
    entity: {},
    locale,
    requestId: newRequestId(),
  });

  return {
    title: resolved.title,
    description: resolved.description ?? "",
    canonicalUrl: resolved.canonicalUrl,
    displayUrl: toBreadcrumb(resolved.canonicalUrl),
    ogImageUrl: resolved.openGraph.image?.url ?? null,
    faviconUrl,
  };
}

// ── Fallback when entity is missing ───────────────────────────

async function fallbackPreview(
  tenantCtx: SeoTenantContext,
  resourceType: PreviewableResourceType,
  entityId: string,
  overrides: Partial<SeoMetadata>,
  locale: string,
  faviconUrl: string | null,
): Promise<SeoPreviewResult> {
  // Minimal fallback: use tenant siteName + override fields so the
  // admin keeps seeing a coherent preview. The URL is the route
  // prefix with the (likely-stale) entityId as slug — good enough
  // for the merchant to see what the structure would look like.
  const path = routePrefixFor(resourceType, entityId);
  const canonicalUrl = buildAbsoluteUrl(tenantCtx, locale, path);

  const title = overrides.title?.trim() || tenantCtx.siteName;
  const description = overrides.description ?? "";

  return {
    title,
    description,
    canonicalUrl,
    displayUrl: toBreadcrumb(canonicalUrl),
    ogImageUrl: null,
    faviconUrl,
  };
}

function routePrefixFor(
  resourceType: PreviewableResourceType,
  slugOrId: string,
): string {
  switch (resourceType) {
    case "homepage":
      return "/";
    case "accommodation":
      return `/stays/${slugOrId}`;
    case "accommodation_category":
      return `/stays/categories/${slugOrId}`;
    case "product":
      return `/shop/products/${slugOrId}`;
    case "product_collection":
      return `/shop/collections/${slugOrId}`;
  }
}

// ── Merge helpers ─────────────────────────────────────────────

/**
 * Shallow-merge overrides over the entity's existing `seo` JSONB.
 * Override wins; untouched keys carry; empty string clears
 * (merchant typed and then deleted — the empty override IS the
 * signal to fall through to tenant defaults at render time).
 *
 * Returns a copy of the entity — never mutates the input row.
 */
function mergeOverridesIntoEntity(
  entity: unknown,
  overrides: Partial<SeoMetadata>,
): unknown {
  if (typeof entity !== "object" || entity === null) return entity;
  const entityRecord = entity as Record<string, unknown>;
  const existingSeo = safeSeoRecord(entityRecord.seo);
  const mergedSeo: Record<string, unknown> = { ...existingSeo, ...overrides };
  return { ...entityRecord, seo: mergedSeo };
}

function safeSeoRecord(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

// ── URL breadcrumb formatter ──────────────────────────────────

/**
 * Convert `https://domain.com/shop/products/slug` to
 * `domain.com › shop › products › slug`. Protocol stripped,
 * path segments joined with " › " (the same glyph Google uses
 * in its SERP breadcrumb row).
 *
 * Bare domains collapse to the domain alone (`domain.com/` →
 * `domain.com`) — no trailing separator.
 */
function toBreadcrumb(absoluteUrl: string): string {
  try {
    const url = new URL(absoluteUrl);
    const segments = url.pathname.split("/").filter((s) => s.length > 0);
    if (segments.length === 0) return url.host;
    return [url.host, ...segments].join(" › ");
  } catch {
    // Malformed URL — return as-is so the UI doesn't break on a
    // resolver bug. Never expected in production.
    return absoluteUrl;
  }
}

// ── Request ID ────────────────────────────────────────────────

function newRequestId(): string {
  return crypto.randomUUID();
}
