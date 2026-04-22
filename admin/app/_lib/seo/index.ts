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
 */

// ── Resolver ───────────────────────────────────────────────────
export { SeoResolver } from "./resolver";

// ── Dependency contracts ──────────────────────────────────────
// (M3 callers wire real implementations; the interfaces live here.)
export type {
  ImageService,
  PageTypeSeoDefaultRepository,
} from "./dependencies";

// ── Adapter registry ──────────────────────────────────────────
export type { SeoAdapter, SitemapEntry } from "./adapters/base";
export {
  registerSeoAdapter,
  getSeoAdapter,
  getAllSeoAdapters,
} from "./adapters/base";

// ── Types ─────────────────────────────────────────────────────
export type {
  Seoable,
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
  safeParseSeoMetadata,
  safeParseSeoDefaults,
} from "./types";
