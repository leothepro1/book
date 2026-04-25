/**
 * SEO Engine — Resolver
 * ═════════════════════
 *
 * The single entry point every consumer (Next.js generateMetadata, admin
 * SERP preview, sitemap, JSON-LD renderer) calls to turn a tenant + entity
 * into a `ResolvedSeo` object.
 *
 * Orchestration (see `resolve()`):
 *   1. Look up the adapter for `ctx.resourceType`.
 *   2. Adapter lifts the raw entity to a `Seoable`.
 *   3. Fetch per-tenant per-page-type pattern defaults (may be null).
 *   4. Compute each output field via pure helpers, awaiting IO where needed.
 *   5. Assemble the canonical `ResolvedSeo` shape.
 *
 * Fallback chain (immutable architectural invariant):
 *   Entity override → PageType pattern → Tenant template / default
 *
 * Canonical path is computed BEFORE hreflang so both agree on the
 * overridden / non-overridden semantics.
 */

import type { PageTypeSeoDefault } from "@prisma/client";

import { log } from "../logger";

import { getSeoAdapter, type SeoAdapter } from "./adapters/base";
import type {
  ImageService,
  PageTypeSeoDefaultRepository,
} from "./dependencies";
import { resolveHreflang } from "./hreflang";
import { interpolate } from "./interpolation";
import { buildLocalePath } from "./paths";
import type {
  ResolvedImage,
  ResolvedSeo,
  Seoable,
  SeoLogContext,
  SeoResolutionContext,
  SeoResourceType,
  StructuredDataObject,
} from "./types";
import { SeoableSchema } from "./types";

/**
 * Resolves SEO metadata for any seoable entity.
 *
 * Dependencies are injected via the constructor so the real production
 * wiring (Prisma repo, Cloudinary image service) can be swapped for
 * test fakes without touching resolver logic.
 */
export class SeoResolver {
  constructor(
    private readonly imageService: ImageService,
    private readonly pageTypeDefaults: PageTypeSeoDefaultRepository,
  ) {}

  /**
   * Produce a fully-resolved SEO object for a request.
   *
   * Orchestrates adapter lookup → Seoable lift → IO-bearing sub-steps →
   * canonical output assembly. Never mutates `ctx`; never throws on
   * missing dependencies (OG image fallback chain reaches `null`;
   * adapter lookup is the only throw path, and only when no adapter
   * has been registered for `ctx.resourceType` — a bootstrap bug).
   */
  async resolve(ctx: SeoResolutionContext): Promise<ResolvedSeo> {
    const adapter = getSeoAdapter(ctx.resourceType);
    const seoable = validateSeoableOrFallback(
      adapter.toSeoable(ctx.entity, ctx.tenant),
      ctx,
    );
    const typeDefaults = await this.pageTypeDefaults.get(
      ctx.tenant.id,
      ctx.resourceType,
    );

    const title = this.resolveTitle(seoable, typeDefaults, ctx);
    const description = this.resolveDescription(seoable, typeDefaults, ctx);
    const canonical = this.resolveCanonical(seoable, ctx);
    const ogImage = await this.resolveOgImage(seoable, adapter, ctx);
    const noindex = this.resolveNoindex(seoable, adapter, ctx);
    const hreflang = resolveHreflang(seoable, ctx, canonical.relative);
    const structuredData = this.mergeStructuredData(
      seoable,
      adapter,
      typeDefaults,
      ctx,
    );

    return {
      title,
      description,
      canonicalUrl: canonical.absolute,
      canonicalPath: canonical.relative,
      noindex,
      nofollow: seoable.seoOverrides?.nofollow ?? false,
      openGraph: {
        type: this.ogTypeFor(ctx.resourceType),
        url: canonical.absolute,
        title,
        description,
        siteName: ctx.tenant.siteName,
        locale: this.toOgLocale(ctx.locale),
        image: ogImage,
      },
      twitterCard: {
        card: seoable.seoOverrides?.twitterCardType ?? "summary_large_image",
        site: ctx.tenant.seoDefaults.twitterSite ?? null,
        title,
        description,
        image: ogImage,
      },
      hreflang,
      structuredData,
    };
  }

  /**
   * Resolve the SEO title for an entity.
   *
   * Fallback chain:
   *   1. seoable.seoOverrides.title           (explicit merchant input)
   *   2. typeDefaults.titlePattern            (interpolated)
   *   3. tenant.seoDefaults.titleTemplate     (interpolated with entityTitle + siteName)
   *
   * Post-processing applied to whichever rung produced the title:
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
        { tenantId: ctx.tenant.id, requestId: ctx.requestId },
      );
    } else {
      title = interpolate(
        ctx.tenant.seoDefaults.titleTemplate,
        { entityTitle: seoable.title, siteName: ctx.tenant.siteName },
        { tenantId: ctx.tenant.id, requestId: ctx.requestId },
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
        { tenantId: ctx.tenant.id, requestId: ctx.requestId },
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
   * Resolve the OG image, walking the full fallback chain.
   *
   * Chain (first match wins, all others are short-circuited):
   *   1. seoable.seoOverrides.ogImageId → ImageService lookup
   *   2. adapter.getAdapterOgImage?() → synchronous adapter hook
   *   3. seoable.featuredImageId → ImageService lookup
   *   4. tenant.seoDefaults.ogImageId → ImageService lookup (tenant default)
   *   5. ImageService.generateDynamicOgImage → dynamic rendering (M10)
   *
   * Every step returns `null` on miss (never throws), so the chain
   * always terminates. Final `null` is a valid output.
   *
   * @internal Public for testability. Production callers must go through resolve().
   */
  public async resolveOgImage(
    seoable: Seoable,
    adapter: SeoAdapter,
    ctx: SeoResolutionContext,
  ): Promise<ResolvedImage | null> {
    const overrideId = seoable.seoOverrides?.ogImageId;
    if (overrideId) {
      const img = await this.imageService.getOgImage(
        overrideId,
        seoable.tenantId,
        { alt: seoable.seoOverrides?.ogImageAlt ?? null },
      );
      if (img) return img;
      // Merchant referenced a missing image — fall through rather than
      // rendering a broken OG. Logging happens in the ImageService only
      // on infra error, not on legitimate miss.
    }

    const adapterImage = adapter.getAdapterOgImage?.(ctx.entity, ctx.tenant);
    if (adapterImage) return adapterImage;

    if (seoable.featuredImageId) {
      const img = await this.imageService.getOgImage(
        seoable.featuredImageId,
        seoable.tenantId,
      );
      if (img) return img;
    }

    const tenantDefaultId = ctx.tenant.seoDefaults.ogImageId;
    if (tenantDefaultId) {
      const img = await this.imageService.getOgImage(
        tenantDefaultId,
        ctx.tenant.id,
      );
      if (img) return img;
    }

    return this.imageService.generateDynamicOgImage({
      title: seoable.title,
      siteName: ctx.tenant.siteName,
      tenantId: ctx.tenant.id,
    });
  }

  /**
   * Resolve the canonical URL for a request.
   *
   * If the merchant has set `seoOverrides.canonicalPath`, that exact
   * path is used verbatim (no locale prefixing — merchants overriding
   * canonical are opting out of per-locale canonicals deliberately).
   *
   * Otherwise, build the locale-prefixed path: default locale gets
   * the bare path; non-default locales get `/locale/...`. Each locale
   * is self-canonical — the `/en/x` page canonicals to `/en/x`, NOT
   * `/x`. Cross-locale linking is hreflang's job, not canonical's.
   *
   * @internal Public for testability. Production callers must go through resolve().
   */
  public resolveCanonical(
    seoable: Seoable,
    ctx: SeoResolutionContext,
  ): { absolute: string; relative: string } {
    const relative =
      seoable.seoOverrides?.canonicalPath ?? this.buildPath(seoable, ctx);
    const absolute = `https://${ctx.tenant.primaryDomain}${relative}`;
    return { absolute, relative };
  }

  /**
   * Resolve the effective `noindex` flag.
   *
   * Precedence:
   *   1. Entity override (`seoOverrides.noindex === true`) wins —
   *      a merchant who pinned a single product to noindex keeps that
   *      decision regardless of the storefront-wide switch.
   *   2. Tenant-wide default (`tenant.seoDefaults.noindex === true`) —
   *      the "discourage search engines" Preferences toggle (M6.6b).
   *      Applies to every entity unless overridden per-entity above.
   *   3. Otherwise defers to the adapter's `isIndexable(entity)` —
   *      the adapter knows the entity's publication state
   *      (status, archivedAt, etc.) that the resolver doesn't.
   *
   * @internal Public for testability. Production callers must go through resolve().
   */
  public resolveNoindex(
    seoable: Seoable,
    adapter: SeoAdapter,
    ctx: SeoResolutionContext,
  ): boolean {
    if (seoable.seoOverrides?.noindex === true) return true;
    if (ctx.tenant.seoDefaults.noindex === true) return true;
    return !adapter.isIndexable(ctx.entity);
  }

  /**
   * Merge structured data (JSON-LD objects) from three sources:
   *   1. Tenant-level schemas (Organization / LocalBusiness) — only on
   *      the homepage. Each is validated for required fields and
   *      dropped if malformed (better no JSON-LD than partial).
   *   2. Adapter-produced schemas (unless `structuredDataEnabled` is
   *      explicitly false on the PageTypeSeoDefault).
   *   3. Merchant-authored `structuredDataExtensions` — passed through
   *      with minimal validation (`@context`, `@type` required).
   *
   * @internal Public for testability. Production callers must go through resolve().
   */
  public mergeStructuredData(
    seoable: Seoable,
    adapter: SeoAdapter,
    typeDefaults: PageTypeSeoDefault | null,
    ctx: SeoResolutionContext,
  ): StructuredDataObject[] {
    const result: StructuredDataObject[] = [];

    // 1. Tenant-level schemas, homepage only.
    if (ctx.resourceType === "homepage") {
      const orgRaw = ctx.tenant.seoDefaults.organizationSchema;
      if (orgRaw) {
        const validated = validateOrganizationSchema(
          orgRaw,
          ctx.tenant.id,
          ctx.requestId,
        );
        if (validated) result.push(validated);
      }
      const lbRaw = ctx.tenant.seoDefaults.localBusinessSchema;
      if (lbRaw) {
        const validated = validateLocalBusinessSchema(
          lbRaw,
          ctx.tenant.id,
          ctx.requestId,
        );
        if (validated) result.push(validated);
      }
    }

    // 2. Adapter-produced schemas (gated by per-type toggle).
    if (typeDefaults?.structuredDataEnabled !== false) {
      const logContext: SeoLogContext = { requestId: ctx.requestId };
      result.push(
        ...adapter.toStructuredData(
          ctx.entity,
          ctx.tenant,
          ctx.locale,
          logContext,
        ),
      );
    }

    // 3. Merchant-authored extensions (minimal validation).
    const extensions = seoable.seoOverrides?.structuredDataExtensions;
    if (extensions) {
      for (const ext of extensions) {
        if (hasMinimumJsonLdShape(ext)) {
          result.push(ext as StructuredDataObject);
        } else {
          log("warn", "seo.structured_data.invalid_extension", {
            tenantId: ctx.tenant.id,
            resourceId: seoable.id,
            requestId: ctx.requestId ?? null,
          });
        }
      }
    }

    return result;
  }

  // ── Private helpers ───────────────────────────────────────────

  /**
   * Build the canonical relative path for a resolution.
   * Pure — fully implemented in M3.
   */
  private buildPath(seoable: Seoable, ctx: SeoResolutionContext): string {
    return buildLocalePath(ctx.tenant, ctx.locale, seoable.path);
  }

  /**
   * Map a resource type to the Open Graph `og:type` value.
   *
   * Narrowed to what Next.js's Metadata OpenGraph union accepts:
   * `website` and `article` only. Facebook's spec has `product` but
   * Next rejects it, and Shopify-grade storefronts emit `website`
   * on product pages anyway. Merchants wanting `og:type=product`
   * can add it via `structuredDataExtensions`.
   */
  private ogTypeFor(
    resourceType: SeoResourceType,
  ): "website" | "article" {
    return resourceType === "article" ? "article" : "website";
  }

  /**
   * Translate a BCP-47 locale (e.g. "sv") to an OG locale (e.g. "sv_SE").
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

// ──────────────────────────────────────────────────────────────
// Module-local validation helpers (kept outside the class so the
// class stays focused on orchestration and the validation logic is
// unit-testable without constructing a resolver instance).
// ──────────────────────────────────────────────────────────────

/** Minimum JSON-LD shape: has schema.org context and a string @type. */
function hasMinimumJsonLdShape(obj: Record<string, unknown>): boolean {
  return (
    obj["@context"] === "https://schema.org" &&
    typeof obj["@type"] === "string"
  );
}

/**
 * Validate tenant-level `Organization` schema. Requires a non-empty
 * `name`. Missing required fields log a warn and drop the entire
 * object (partial JSON-LD is worse than no JSON-LD).
 */
function validateOrganizationSchema(
  raw: Record<string, unknown>,
  tenantId: string,
  requestId: string | undefined,
): StructuredDataObject | null {
  if (!hasMinimumJsonLdShape(raw)) {
    log("warn", "seo.structured_data.missing_required_field", {
      tenantId,
      schema: "Organization",
      field: "@context or @type",
      requestId: requestId ?? null,
    });
    return null;
  }
  const name = raw.name;
  if (typeof name !== "string" || name.length === 0) {
    log("warn", "seo.structured_data.missing_required_field", {
      tenantId,
      schema: "Organization",
      field: "name",
      requestId: requestId ?? null,
    });
    return null;
  }
  return raw as StructuredDataObject;
}

/**
 * Validate tenant-level `LocalBusiness` schema. Requires a non-empty
 * `name` AND a non-empty `address.streetAddress`. Missing either
 * drops the entire object.
 */
function validateLocalBusinessSchema(
  raw: Record<string, unknown>,
  tenantId: string,
  requestId: string | undefined,
): StructuredDataObject | null {
  if (!hasMinimumJsonLdShape(raw)) {
    log("warn", "seo.structured_data.missing_required_field", {
      tenantId,
      schema: "LocalBusiness",
      field: "@context or @type",
      requestId: requestId ?? null,
    });
    return null;
  }
  const name = raw.name;
  if (typeof name !== "string" || name.length === 0) {
    log("warn", "seo.structured_data.missing_required_field", {
      tenantId,
      schema: "LocalBusiness",
      field: "name",
      requestId: requestId ?? null,
    });
    return null;
  }
  const address = raw.address;
  if (address === null || typeof address !== "object") {
    log("warn", "seo.structured_data.missing_required_field", {
      tenantId,
      schema: "LocalBusiness",
      field: "address",
      requestId: requestId ?? null,
    });
    return null;
  }
  const streetAddress = (address as Record<string, unknown>).streetAddress;
  if (typeof streetAddress !== "string" || streetAddress.length === 0) {
    log("warn", "seo.structured_data.missing_required_field", {
      tenantId,
      schema: "LocalBusiness",
      field: "address.streetAddress",
      requestId: requestId ?? null,
    });
    return null;
  }
  return raw as StructuredDataObject;
}

/**
 * Runtime-validate an adapter's `toSeoable` output. On success return
 * the value unchanged (typed cast — Zod parsed shape is structurally
 * identical to `Seoable`). On failure log
 * `seo.adapter.output_invalid` and substitute a safe synthetic
 * `Seoable` that:
 *
 *   - preserves `ctx.resourceType`, `tenantId`, `locale` for downstream
 *     consumers that key on those;
 *   - pins `path = "/"` — we have no reliable path, and `/` is a real
 *     URL the tenant always serves, so hreflang and canonical at least
 *     produce valid URLs;
 *   - sets `seoOverrides.noindex = true` — we don't know what we're
 *     indexing, so don't index it. Safe default under the "keep the
 *     page rendering" rule in the spec.
 *
 * Never throws. The resolver continues with the fallback Seoable so
 * the storefront page still renders `<head>` metadata.
 */
function validateSeoableOrFallback(
  candidate: Seoable,
  ctx: SeoResolutionContext,
): Seoable {
  const parsed = SeoableSchema.safeParse(candidate);
  if (parsed.success) {
    return candidate;
  }
  // The logger's context type accepts only primitives — serialize
  // the issue list to a JSON string so operators can still parse
  // individual failures out of structured logs.
  const issuesSerialized = JSON.stringify(
    parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      code: i.code,
      message: i.message,
    })),
  );
  log("error", "seo.adapter.output_invalid", {
    tenantId: ctx.tenant.id,
    resourceType: ctx.resourceType,
    // Best-effort resource id from the raw candidate — may itself be
    // invalid (wrong type, undefined), so we stringify defensively.
    resourceId:
      typeof (candidate as { id?: unknown }).id === "string"
        ? (candidate as { id: string }).id
        : null,
    issues: issuesSerialized,
    requestId: ctx.requestId ?? null,
  });
  return {
    resourceType: ctx.resourceType,
    id: `fallback-${ctx.tenant.id}`,
    tenantId: ctx.tenant.id,
    path: "/",
    title: ctx.tenant.siteName,
    description: null,
    featuredImageId: null,
    seoOverrides: { noindex: true, nofollow: false },
    updatedAt: new Date(),
    publishedAt: null,
    locale: ctx.locale,
  };
}
