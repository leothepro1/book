/**
 * SEO Engine — Public API
 * ═══════════════════════
 *
 * The only surface consumers outside `lib/seo/` should import from.
 *
 * Intentionally NOT re-exported:
 *   - Individual resolver methods (access via `SeoResolver` instances only).
 *   - `dependencies.ts` stub implementations (internal scaffolding).
 *   - `interpolate()` (implementation detail of the resolver).
 *   - `_clearSeoAdaptersForTests()` (test-only; import directly from base.ts).
 *   - `stripHtml`, `buildLocalePath`, `buildAbsoluteUrl`, `resolveHreflang`
 *     (internal helpers — call through the resolver).
 */

// ── Resolver ───────────────────────────────────────────────────
export { SeoResolver } from "./resolver";

// ── Dependency contracts + production factories ───────────────
export type {
  ImageService,
  PageTypeSeoDefaultRepository,
} from "./dependencies";
export { createCloudinaryImageService } from "./image-service-impl";
export { createPageTypeSeoDefaultRepository } from "./page-type-defaults-impl";

// ── Adapter registry ──────────────────────────────────────────
export type { SeoAdapter, SitemapEntry } from "./adapters/base";
export {
  registerSeoAdapter,
  getSeoAdapter,
  getAllSeoAdapters,
} from "./adapters/base";

// ── Adapters ──────────────────────────────────────────────────
// Exported so app bootstrap can register them with the registry.
export type { AccommodationWithMedia } from "./adapters/accommodation";
export { accommodationSeoAdapter } from "./adapters/accommodation";
export type { AccommodationIndexSeoInput } from "./adapters/accommodation-index";
export { accommodationIndexSeoAdapter } from "./adapters/accommodation-index";
export type { ProductWithMedia } from "./adapters/product";
export { productSeoAdapter } from "./adapters/product";
export type {
  ProductCollectionItemWithProduct,
  ProductCollectionWithItems,
} from "./adapters/product-collection";
export {
  collectionSeoInclude,
  MAX_ITEMLIST_MEMBERS,
  productCollectionSeoAdapter,
} from "./adapters/product-collection";

// ── Types ─────────────────────────────────────────────────────
export type {
  Seoable,
  SeoLogContext,
  SeoMetadata,
  SeoDefaults,
  SeoTenantContext,
  SeoResolutionContext,
  SeoResourceType,
  ResolvedImage,
  ResolvedSeo,
  StructuredDataObject,
} from "./types";

// ── Schemas & parsers (needed at trust boundaries) ────────────
export {
  SeoResourceTypes,
  SeoMetadataSchema,
  SeoDefaultsSchema,
  SeoableSchema,
  safeParseSeoMetadata,
  safeParseSeoDefaults,
} from "./types";
