/**
 * SEO Engine — Injected Dependencies
 * ══════════════════════════════════
 *
 * The resolver takes its side-effectful collaborators via constructor
 * injection so they are trivially replaceable in tests and can evolve
 * independently (DB-backed, Redis-cached, S3-backed, etc.).
 *
 * Real implementations:
 *   - ImageService  → image-service-impl.ts (Cloudinary + MediaAsset)
 *   - PageTypeSeoDefaultRepository → page-type-defaults-impl.ts (Prisma)
 *
 * Stubs in this file are kept for tests that don't exercise those paths.
 */

import type { PageTypeSeoDefault } from "@prisma/client";
import type { ResolvedImage, SeoResourceType } from "./types";

/**
 * Resolves OG image URLs for the SEO engine.
 *
 * `tenantId` is a REQUIRED positional argument on every lookup — not
 * inferred, not optional. Multi-tenant resource lookups must be
 * tenant-scoped at the signature level so a merchant who pastes
 * another tenant's MediaAsset id into their `seo.ogImageId` JSONB
 * cannot leak images across tenants.
 */
export interface ImageService {
  /**
   * Resolve a stored media asset to an OG image, scoped to the tenant
   * that owns the resource. Returns `null` if the asset does not exist,
   * has been soft-deleted, or belongs to a different tenant.
   *
   * Never throws — transient infrastructure failures log and return
   * `null` so the fallback chain continues.
   *
   * @param imageId  Opaque media asset identifier (MediaAsset.id).
   * @param tenantId Tenant that owns the SEO context. Required.
   * @param options  `alt` overrides the asset's own alt text if provided.
   */
  getOgImage(
    imageId: string,
    tenantId: string,
    options?: { alt?: string | null },
  ): Promise<ResolvedImage | null>;

  /**
   * Produce a dynamically-rendered OG image from title + tenant branding.
   * Used when an entity has no featured image and no tenant default.
   *
   * Real rendering (Satori / next/og) arrives in M10. M3's real impl
   * returns `null` and logs so ops can see adoption.
   */
  generateDynamicOgImage(params: {
    title: string;
    siteName: string;
    tenantId: string;
  }): Promise<ResolvedImage | null>;
}

/**
 * Reads per-tenant, per-page-type SEO defaults from persistent storage.
 * The real M3 implementation is Prisma-backed without caching — one row
 * per resolve() call. Caching is deferred until hot-path latency is
 * measurable under real load.
 */
export interface PageTypeSeoDefaultRepository {
  /**
   * Fetch the default row for (tenant, pageType), or `null` if none is set.
   * Callers must treat `null` as "no per-type defaults configured".
   */
  get(
    tenantId: string,
    resourceType: SeoResourceType,
  ): Promise<PageTypeSeoDefault | null>;
}

/**
 * Throws on every call. Useful only for tests that should never hit
 * OG-image resolution. Production code uses `createCloudinaryImageService()`
 * from `image-service-impl.ts`.
 *
 * Not exported from `index.ts` — internal scaffolding.
 */
export const stubImageService: ImageService = {
  async getOgImage(): Promise<ResolvedImage | null> {
    throw new Error("stubImageService.getOgImage: must not be reached");
  },
  async generateDynamicOgImage(): Promise<ResolvedImage | null> {
    throw new Error(
      "stubImageService.generateDynamicOgImage: must not be reached",
    );
  },
};

/**
 * Returns `null` unconditionally. Used in tests that don't need
 * per-type SEO defaults (resolver falls through to the tenant
 * template). Not exported from `index.ts`.
 */
export const stubPageTypeSeoDefaultRepository: PageTypeSeoDefaultRepository = {
  async get(): Promise<PageTypeSeoDefault | null> {
    return null;
  },
};
