/**
 * SEO Engine — ImageService (Cloudinary)
 * ══════════════════════════════════════
 *
 * Resolves `MediaAsset.id` references into OG-sized Cloudinary URLs.
 * Tenant-scoped — rejects cross-tenant lookups even if a malicious
 * merchant pastes another tenant's MediaAsset.id into their SEO JSONB.
 *
 * Cloudinary format choice: JPG, explicit — NOT `f_auto`. Facebook's
 * OG scraper does not handle WebP reliably; JPG is the universal safe
 * format. Gravity `auto` performs subject-aware cropping, which matters
 * because merchant uploads are rarely in 1200x630 aspect ratio.
 *
 * Dynamic OG image generation (Satori / next/og) is deferred to M10.
 * M3 returns `null` from `generateDynamicOgImage` and emits a log so
 * ops can see how often the final fallback is reached.
 */

import { prisma } from "../db/prisma";
import { log } from "../logger";

import type { ImageService } from "./dependencies";
import type { ResolvedImage } from "./types";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/**
 * Build the OG-safe Cloudinary URL for a public ID.
 *
 * Transform chain:
 *   - `w_1200,h_630` — Facebook's recommended OG size.
 *   - `c_fill` — fill the target box, cropping as needed.
 *   - `g_auto` — subject-aware gravity so the crop keeps the most
 *     interesting part of the image visible.
 *   - `q_auto` — automatic quality.
 *   - `f_jpg` — JPG explicitly (NOT `f_auto`). Facebook's OG scraper
 *     still does not reliably handle WebP; JPG is the universal safe
 *     format for Open Graph.
 *
 * The project's shared `buildCloudinaryUrl` helper doesn't expose
 * `gravity` or allow `format: "jpg"`, so this OG-specific builder lives
 * here. Kept private to the module — every caller in the SEO engine
 * uses the exact same transform chain.
 */
function buildOgUrl(publicId: string): string {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
  const transforms = [
    `w_${OG_WIDTH}`,
    `h_${OG_HEIGHT}`,
    "c_fill",
    "g_auto",
    "q_auto",
    "f_jpg",
  ].join(",");
  return `https://res.cloudinary.com/${cloudName}/image/upload/${transforms}/${publicId}`;
}

/**
 * Factory for the production `ImageService` implementation. Takes no
 * arguments — `prisma` and Cloudinary config are module-level singletons.
 *
 * Every method is a method on the returned object so the instance can be
 * passed to `new SeoResolver(...)` and respect dependency injection.
 */
export function createCloudinaryImageService(): ImageService {
  return {
    async getOgImage(
      imageId: string,
      tenantId: string,
      options?: { alt?: string | null },
    ): Promise<ResolvedImage | null> {
      let asset;
      try {
        asset = await prisma.mediaAsset.findFirst({
          where: { id: imageId, tenantId, deletedAt: null },
        });
      } catch (error) {
        log("error", "seo.image_service.db_error", {
          imageId,
          tenantId,
          reason: error instanceof Error ? error.message : String(error),
        });
        return null;
      }

      if (!asset) {
        // Legitimate miss: no row, wrong tenant, or soft-deleted.
        // We do NOT log — misses happen whenever a merchant deletes an
        // image referenced by old SEO JSON, which would flood logs.
        return null;
      }

      return {
        url: buildOgUrl(asset.publicId),
        width: OG_WIDTH,
        height: OG_HEIGHT,
        alt: options?.alt ?? asset.alt ?? null,
      };
    },

    async generateDynamicOgImage(params: {
      title: string;
      siteName: string;
      tenantId: string;
    }): Promise<ResolvedImage | null> {
      // Deferred to M10 (Satori / ImageResponse). We log so ops can
      // measure how many resolutions reach the final fallback rung.
      log("info", "seo.og_image.dynamic_unavailable", {
        tenantId: params.tenantId,
      });
      return null;
    },
  };
}
