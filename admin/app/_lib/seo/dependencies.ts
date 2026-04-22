/**
 * SEO Engine — Injected Dependencies
 * ══════════════════════════════════
 *
 * The resolver takes its side-effectful collaborators via constructor
 * injection so they are trivially replaceable in tests and can evolve
 * independently (DB-backed, Redis-cached, S3-backed, etc.).
 *
 * In M2 we ship:
 *   - Interfaces (`ImageService`, `PageTypeSeoDefaultRepository`).
 *   - `stubImageService` — throws on every method. Used by the M2 resolver
 *     test suite, which never exercises OG-image resolution.
 *   - `stubPageTypeSeoDefaultRepository` — returns `null` for every lookup.
 *     Safe default: "no per-type defaults", which lets the resolver fall
 *     through to the tenant-level title template.
 *
 * Real implementations arrive in M3 (Prisma-backed repository) and M10
 * (Cloudinary + Satori image service).
 */

import type { PageTypeSeoDefault } from "@prisma/client";
import type { ResolvedImage, SeoResourceType } from "./types";

/**
 * Resolves OG image URLs for the SEO engine.
 * Every method is async — real implementations may query Cloudinary,
 * generate dynamic images via Satori, or cache in Redis.
 */
export interface ImageService {
  /**
   * Resolve a stored media asset to an OG image. Returns `null` if the
   * asset does not exist or cannot be used as an OG image.
   *
   * @param imageId Opaque media asset identifier (Cloudinary public ID etc.)
   * @param options `alt` overrides the asset's own alt text if provided.
   */
  getOgImage(
    imageId: string,
    options?: { alt?: string | null },
  ): Promise<ResolvedImage | null>;

  /**
   * Produce a dynamically-rendered OG image from title + tenant branding.
   * Used when an entity has no featured image and no tenant default.
   */
  generateDynamicOgImage(params: {
    title: string;
    siteName: string;
    tenantId: string;
  }): Promise<ResolvedImage | null>;
}

/**
 * Reads per-tenant, per-page-type SEO defaults from persistent storage.
 * The M3 implementation will be Prisma-backed with a short-TTL cache.
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
 * M2-only stub: throws on every call. The M2 resolver test suite never
 * reaches OG-image resolution. If something does call it, we want a loud
 * failure so it's caught immediately.
 *
 * Not exported from `index.ts`: this is internal scaffolding.
 */
export const stubImageService: ImageService = {
  async getOgImage(): Promise<ResolvedImage | null> {
    throw new Error(
      "Not implemented in M2: ImageService.getOgImage — arrives in M10",
    );
  },
  async generateDynamicOgImage(): Promise<ResolvedImage | null> {
    throw new Error(
      "Not implemented in M2: ImageService.generateDynamicOgImage — arrives in M10",
    );
  },
};

/**
 * M2-only stub: returns `null` unconditionally. The resolver treats `null`
 * as "no per-type defaults" and falls through to the tenant title template
 * — exactly the behaviour we want for the M2 title/description tests.
 *
 * Not exported from `index.ts`: this is internal scaffolding.
 */
export const stubPageTypeSeoDefaultRepository: PageTypeSeoDefaultRepository = {
  async get(): Promise<PageTypeSeoDefault | null> {
    return null;
  },
};
