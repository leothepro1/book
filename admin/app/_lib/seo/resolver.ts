/**
 * SEO Engine — Resolver
 * ═════════════════════
 *
 * The single entry point every consumer (Next.js generateMetadata, admin
 * SERP preview, sitemap, JSON-LD renderer) calls to turn a tenant + entity
 * into a `ResolvedSeo` object.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Milestone 2 status
 * ──────────────────────────────────────────────────────────────────────
 * FULLY IMPLEMENTED:
 *   - resolveTitle()       — pure function of Seoable + typeDefaults + ctx
 *   - resolveDescription() — pure function of Seoable + typeDefaults + ctx
 *   - ogTypeFor()          — pure map
 *   - toOgLocale()         — pure map
 *
 * STUBBED (throw "Not implemented in M2"):
 *   - resolve()            — full orchestration arrives in M3
 *   - resolveOgImage()     — needs real ImageService (M10)
 *   - resolveCanonical()   — full implementation in M3
 *   - resolveNoindex()     — needs an adapter (M3)
 *   - mergeStructuredData()— needs an adapter (M3)
 *   - buildPath()          — private helper, lives here waiting for M3
 *
 * Fallback chain (immutable architectural invariant):
 *   Entity override → PageType pattern → Tenant template / default
 * ──────────────────────────────────────────────────────────────────────
 */

import type { PageTypeSeoDefault } from "@prisma/client";

import type { SeoAdapter } from "./adapters/base";
import type {
  ImageService,
  PageTypeSeoDefaultRepository,
} from "./dependencies";
import { interpolate } from "./interpolation";
import type {
  ResolvedImage,
  ResolvedSeo,
  Seoable,
  SeoResolutionContext,
  SeoResourceType,
  StructuredDataObject,
} from "./types";

const NOT_IMPLEMENTED = "Not implemented in M2";

/**
 * Resolves SEO metadata for any seoable entity.
 *
 * Dependencies are injected via the constructor so real implementations
 * (Prisma repo, Cloudinary image service) can be swapped for test stubs
 * without touching resolver logic.
 */
export class SeoResolver {
  constructor(
    private readonly imageService: ImageService,
    private readonly pageTypeDefaults: PageTypeSeoDefaultRepository,
  ) {}

  /**
   * Produce a fully-resolved SEO object for a request.
   *
   * @throws Always in M2. Implementation arrives in M3 once the first
   *         adapter is registered and OG image resolution is available.
   */
  async resolve(_ctx: SeoResolutionContext): Promise<ResolvedSeo> {
    throw new Error(`${NOT_IMPLEMENTED}: SeoResolver.resolve`);
  }

  /**
   * Resolve the SEO title for an entity.
   *
   * Fallback chain:
   *   1. seoable.seoOverrides.title           (explicit merchant input)
   *   2. typeDefaults.titlePattern            (interpolated)
   *   3. tenant.seoDefaults.titleTemplate     (interpolated with entityTitle + siteName)
   *
   * Post-processing, applied to whichever rung produced the title:
   *   - If `ctx.searchQuery` is set, replace the title with a
   *     "Search results for ..." string. Search pages never follow the
   *     pagination / tags branches.
   *   - Else, if `ctx.pagination.page > 1`, append " – Page N".
   *   - Else, if `ctx.tags` is non-empty, append ' – tagged "..."'.
   *
   * @internal Public for testability. Production callers must go through resolve().
   */
  public resolveTitle(
    seoable: Seoable,
    typeDefaults: PageTypeSeoDefault | null,
    ctx: SeoResolutionContext,
  ): string {
    // Search-results pages don't use the entity fallback chain at all —
    // the title is fully defined by the query.
    if (ctx.searchQuery) {
      return `Search results for "${ctx.searchQuery}" | ${ctx.tenant.siteName}`;
    }

    const override = seoable.seoOverrides?.title;
    const pattern = typeDefaults?.titlePattern;

    let title: string;
    if (override) {
      title = override;
    } else if (pattern) {
      title = interpolate(
        pattern,
        { entity: seoable, tenant: ctx.tenant },
        { tenantId: ctx.tenant.id },
      );
    } else {
      title = interpolate(
        ctx.tenant.seoDefaults.titleTemplate,
        { entityTitle: seoable.title, siteName: ctx.tenant.siteName },
        { tenantId: ctx.tenant.id },
      );
    }

    if (ctx.pagination && ctx.pagination.page > 1) {
      title += ` – Page ${ctx.pagination.page}`;
    }

    if (ctx.tags && ctx.tags.length > 0) {
      title += ` – tagged "${ctx.tags.join(", ")}"`;
    }

    return title;
  }

  /**
   * Resolve the SEO description for an entity.
   *
   * Fallback chain:
   *   1. seoable.seoOverrides.description                (explicit)
   *   2. typeDefaults.descriptionPattern                 (interpolated)
   *   3. seoable.description                             (entity body text)
   *   4. tenant.seoDefaults.descriptionDefault           (tenant fallback)
   *   5. null                                            (no description)
   *
   * Output is truncated to 500 chars with a "..." suffix if longer.
   *
   * @internal Public for testability. Production callers must go through resolve().
   */
  public resolveDescription(
    seoable: Seoable,
    typeDefaults: PageTypeSeoDefault | null,
    ctx: SeoResolutionContext,
  ): string | null {
    const override = seoable.seoOverrides?.description;
    const pattern = typeDefaults?.descriptionPattern;

    let raw: string | null;
    if (override) {
      raw = override;
    } else if (pattern) {
      raw = interpolate(
        pattern,
        { entity: seoable, tenant: ctx.tenant },
        { tenantId: ctx.tenant.id },
      );
    } else if (seoable.description) {
      raw = seoable.description;
    } else if (ctx.tenant.seoDefaults.descriptionDefault) {
      raw = ctx.tenant.seoDefaults.descriptionDefault;
    } else {
      raw = null;
    }

    if (raw === null) return null;
    return raw.length > 500 ? raw.slice(0, 497) + "..." : raw;
  }

  /**
   * @throws Always in M2. Full chain (override → adapter hook → featured
   *         → tenant default → dynamic) arrives once ImageService ships.
   */
  async resolveOgImage(
    _seoable: Seoable,
    _adapter: SeoAdapter,
    _ctx: SeoResolutionContext,
  ): Promise<ResolvedImage | null> {
    throw new Error(`${NOT_IMPLEMENTED}: SeoResolver.resolveOgImage`);
  }

  /**
   * @throws Always in M2. Depends on `buildPath()` which is itself stubbed
   *         pending M3 hreflang / locale rules.
   */
  resolveCanonical(
    _seoable: Seoable,
    _ctx: SeoResolutionContext,
  ): { absolute: string; relative: string } {
    throw new Error(`${NOT_IMPLEMENTED}: SeoResolver.resolveCanonical`);
  }

  /**
   * @throws Always in M2. Needs an adapter's `isIndexable()` — no adapters
   *         exist until M3.
   */
  resolveNoindex(_seoable: Seoable, _adapter: SeoAdapter): boolean {
    throw new Error(`${NOT_IMPLEMENTED}: SeoResolver.resolveNoindex`);
  }

  /**
   * @throws Always in M2. Merging requires an adapter's `toStructuredData()`.
   */
  mergeStructuredData(
    _seoable: Seoable,
    _adapter: SeoAdapter,
    _typeDefaults: PageTypeSeoDefault | null,
    _ctx: SeoResolutionContext,
  ): StructuredDataObject[] {
    throw new Error(`${NOT_IMPLEMENTED}: SeoResolver.mergeStructuredData`);
  }

  // ── Private helpers ───────────────────────────────────────────

  /**
   * Build the canonical relative path for a resolution.
   *
   * @throws Always in M2. Arrives in M3 alongside resolveCanonical().
   */
  private buildPath(_seoable: Seoable, _ctx: SeoResolutionContext): string {
    throw new Error(`${NOT_IMPLEMENTED}: SeoResolver.buildPath`);
  }

  /**
   * Map a resource type to the Open Graph `og:type` value.
   * Pure — fully implemented in M2 for use by M3's `resolve()`.
   */
  private ogTypeFor(
    resourceType: SeoResourceType,
  ): "website" | "article" | "product" {
    switch (resourceType) {
      case "article":
        return "article";
      case "product":
      case "accommodation":
        return "product";
      default:
        return "website";
    }
  }

  /**
   * Translate a BCP-47 locale (e.g. "sv") to an OG locale (e.g. "sv_SE").
   * Pure — fully implemented in M2 for use by M3's `resolve()`.
   *
   * Unknown locales pass through unchanged — Facebook's scraper tolerates
   * bare language codes, so this is graceful-degrade behaviour.
   */
  private toOgLocale(locale: string): string {
    const map: Record<string, string> = {
      sv: "sv_SE",
      en: "en_US",
      de: "de_DE",
    };
    return map[locale] ?? locale;
  }
}
