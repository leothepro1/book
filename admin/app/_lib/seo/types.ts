/**
 * SEO Engine — Types & Schemas
 * ════════════════════════════
 *
 * Single source of truth for the shapes the SEO engine reads and writes.
 *
 * The engine is entity-agnostic: adapters lift concrete Prisma entities
 * (Accommodation, Product, ...) into the `Seoable` contract, and the
 * resolver consumes only `Seoable` + `SeoResolutionContext` — no entity
 * type leaks in here.
 *
 * JSONB storage:
 *   Tenant.seoDefaults          → SeoDefaults   (validated via SeoDefaultsSchema)
 *   <Entity>.seo                → SeoMetadata   (validated via SeoMetadataSchema)
 *
 * Both are validated at the trust boundary (when reading from Prisma)
 * via safeParseSeoDefaults / safeParseSeoMetadata. The rest of the engine
 * trusts the parsed shapes.
 */

import { z } from "zod";
import { log } from "../logger";

// ── Resource types ─────────────────────────────────────────────

/**
 * Every page type that can be resolved by the SEO engine.
 * Kept as a const tuple so both the TypeScript union and the runtime
 * array are generated from the same source.
 */
export const SeoResourceTypes = [
  "homepage",
  "accommodation",
  "accommodation_category",
  "accommodation_index",
  "product",
  "product_collection",
  "product_index",
  "page",
  "article",
  "blog",
  "search",
] as const;

/** A resource type that the engine knows how to resolve. */
export type SeoResourceType = (typeof SeoResourceTypes)[number];

// ── Per-entity SEO overrides ───────────────────────────────────

/**
 * Shape of the `seo` JSONB column on every seoable entity.
 * All fields are optional — merchants fill only what they want to override.
 *
 * Validation rules:
 *   - title trimmed, max 255 chars (SEO titles > 255 are ignored by Google)
 *   - description trimmed, max 500 chars (we store 500; Google renders ~155)
 *   - canonicalPath must start with "/" — absolute paths rejected
 *   - twitterCardType limited to the two cards Twitter still supports
 *   - noindex / nofollow default to false (Zod .default() applies on parse)
 *
 * `.strict()` rejects unknown keys — merchants cannot smuggle arbitrary
 * JSON into SEO metadata.
 */
export const SeoMetadataSchema = z
  .object({
    title: z.string().trim().max(255).optional(),
    description: z.string().trim().max(500).optional(),
    canonicalPath: z.string().startsWith("/").optional(),
    ogImageId: z.string().optional(),
    ogImageAlt: z.string().max(420).optional(),
    twitterCardType: z.enum(["summary", "summary_large_image"]).optional(),
    noindex: z.boolean().default(false),
    nofollow: z.boolean().default(false),
    structuredDataExtensions: z
      .array(z.record(z.string(), z.unknown()))
      .optional(),
  })
  .strict();

/** Parsed, validated per-entity SEO override. */
export type SeoMetadata = z.infer<typeof SeoMetadataSchema>;

// ── Per-tenant SEO defaults ────────────────────────────────────

/**
 * Hard length limits for merchant-facing homepage SEO fields.
 *
 * Tuned to Google's SERP truncation behaviour so merchants see in the
 * live SERP preview roughly what will actually ship. Exceeding these
 * limits is rejected at save; the admin counter goes amber at 80% and
 * red at 100%.
 *
 * These are the single source of truth for:
 *   - Zod schema validation on save.
 *   - Admin character-counter thresholds.
 *   - Server-action input-validator length bounds.
 */
export const SEO_HOMEPAGE_TITLE_MAX = 70;
export const SEO_HOMEPAGE_DESCRIPTION_MAX = 150;

/** Fraction at which the character counter transitions to warn state. */
export const SEO_CHAR_COUNTER_WARN_THRESHOLD = 0.8;

/**
 * Shape of Tenant.seoDefaults JSONB.
 *
 * `titleTemplate` has a sensible default so every tenant resolves titles
 * even if they never open the SEO settings screen.
 *
 * `twitterSite` requires the leading `@` — Twitter's own format. Reject
 * anything else so we don't emit `twitter:site="bedfront"` which is invalid.
 *
 * `homepage` (M5): merchant-configured overrides for the `/` route.
 * Whole object is optional for backward compatibility — existing tenants
 * with `seoDefaults = null` or without a `homepage` key continue to
 * parse. When present, `homepage.title` must be a non-empty trimmed
 * string (whitespace-only rejected) — merchants who want to clear the
 * title should remove the key entirely.
 */
export const SeoDefaultsSchema = z
  .object({
    titleTemplate: z.string().default("{entityTitle} | {siteName}"),
    descriptionDefault: z.string().optional(),
    ogImageId: z.string().optional(),
    faviconId: z.string().optional(),
    twitterSite: z
      .string()
      .regex(/^@/, "twitterSite must start with @")
      .optional(),
    organizationSchema: z.record(z.string(), z.unknown()).optional(),
    localBusinessSchema: z.record(z.string(), z.unknown()).optional(),
    homepage: z
      .object({
        title: z
          .string()
          .trim()
          .min(1, "Titel kan inte vara tom")
          .max(SEO_HOMEPAGE_TITLE_MAX)
          .optional(),
        description: z
          .string()
          .trim()
          .max(SEO_HOMEPAGE_DESCRIPTION_MAX)
          .optional(),
        /**
         * MediaAsset.id (cuid) — NOT Cloudinary publicId. The admin
         * save action resolves publicId → MediaAsset.id before
         * persisting, so what lives in JSONB is always an id the
         * ImageService can look up directly.
         */
        ogImageId: z.string().optional(),
        noindex: z.boolean().default(false),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Parsed, validated per-tenant SEO defaults. */
export type SeoDefaults = z.infer<typeof SeoDefaultsSchema>;

// ── Seoable contract ───────────────────────────────────────────

/**
 * The contract every entity must satisfy to be resolvable by the SEO
 * engine. Adapters produce this; the resolver consumes it.
 *
 * All fields are `readonly` because a Seoable is a snapshot — the
 * resolver must never mutate what an adapter returned.
 */
export interface Seoable {
  readonly resourceType: SeoResourceType;
  readonly id: string;
  readonly tenantId: string;
  /** Canonical relative path, e.g. "/accommodations/stuga-1". */
  readonly path: string;
  /** Human title — used as a fallback source for the SEO title. */
  readonly title: string;
  /** Plain-text description (rich-text stripped by the adapter). */
  readonly description?: string | null;
  /** Media asset ID for the fallback OG image. */
  readonly featuredImageId?: string | null;
  /** Parsed, trusted entity override — or null if nothing set. */
  readonly seoOverrides?: SeoMetadata | null;
  readonly updatedAt: Date;
  readonly publishedAt?: Date | null;
  /** Locale of the entity content (not necessarily the request locale). */
  readonly locale: string;
}

/**
 * Runtime validator for `Seoable`. Used at the resolver boundary to
 * verify adapter output before it enters the resolution pipeline.
 *
 * If an adapter returns a malformed Seoable (missing `path`, empty
 * `title`, wrong type), the resolver logs `seo.adapter.output_invalid`
 * and substitutes a safe fallback rather than propagating the bug
 * into merchant-facing SEO. This is a defense-in-depth layer:
 * adapters are authored in TS with compile-time contracts, but
 * Prisma shape drift, runtime casts, and future refactors can still
 * produce shapes that would 500 the resolver.
 *
 * Constraints beyond the TypeScript interface:
 *   - `path` must start with "/" (we construct absolute URLs by
 *     concatenating origin + path; a path missing the leading slash
 *     yields `https://domain.comsubpath` which is invalid and
 *     silently corrupts every sitemap entry).
 *   - `title` must be non-empty and non-whitespace — an empty title
 *     emitted into `<title>` breaks every SERP snippet.
 *   - `id` and `tenantId` must be non-empty — downstream logs key
 *     on these for correlation, empty strings muddy observability.
 */
export const SeoableSchema = z
  .object({
    resourceType: z.enum(SeoResourceTypes),
    id: z.string().min(1),
    tenantId: z.string().min(1),
    path: z.string().startsWith("/"),
    title: z.string().trim().min(1),
    description: z.string().nullable().optional(),
    featuredImageId: z.string().nullable().optional(),
    seoOverrides: SeoMetadataSchema.nullable().optional(),
    updatedAt: z.date(),
    publishedAt: z.date().nullable().optional(),
    locale: z.string().min(1),
  })
  .strict();

// ── Tenant context ─────────────────────────────────────────────

/**
 * Minimal tenant shape the SEO engine needs. Constructed at the boundary
 * (M3 will add a `tenantToSeoContext()` helper that converts Prisma
 * `Tenant` + `TenantLocale[]` into this shape).
 *
 * Kept separate from Prisma's `Tenant` so the engine doesn't depend on
 * the dozens of unrelated Tenant fields (stripeAccountId, email settings,
 * feature toggles, etc.).
 */
export interface SeoTenantContext {
  readonly id: string;
  /** Display name used in title templates and OG siteName. */
  readonly siteName: string;
  /** Bare domain WITHOUT protocol, e.g. "apelviken-x.rutgr.com". */
  readonly primaryDomain: string;
  /** BCP-47 code of the tenant's default locale, e.g. "sv". */
  readonly defaultLocale: string;
  /** Parsed, trusted tenant-level defaults (defaults filled in). */
  readonly seoDefaults: SeoDefaults;
  /** All published locales. Used by hreflang resolution in M8. */
  readonly activeLocales: readonly string[];
  /**
   * Best-available signal for when tenant-level content last changed.
   * Currently sourced from `Tenant.updatedAt`, which overshoots (moves
   * on non-content mutations like Stripe reconnect or email settings
   * changes) but never undershoots. Used as the `lastmod` source for
   * synthetic pages (homepage, accommodation-index) that have no
   * per-entity `updatedAt`.
   *
   * TODO(post-m7): migrate to a dedicated `Tenant.settingsPublishedAt`
   * column so `lastmod` fires only on actual `publishDraft`. One-line
   * source swap — every callsite reads through this field.
   */
  readonly contentUpdatedAt: Date;
}

// ── Resolution IO ──────────────────────────────────────────────

/**
 * Input to SeoResolver.resolve(). Adapters dispatch on `resourceType`
 * and cast `entity` to their domain type internally.
 *
 * `requestId` correlates every structured log emitted during one
 * resolution (resolver + adapters + helpers) back to a single HTTP
 * request. Generated by `resolveSeoForRequest` via
 * `crypto.randomUUID()` when callers don't provide one. Optional
 * so unit tests can omit it without ceremony.
 */
export interface SeoResolutionContext {
  readonly tenant: SeoTenantContext;
  readonly resourceType: SeoResourceType;
  /** Opaque to the resolver; the adapter for `resourceType` knows the type. */
  readonly entity: unknown;
  /** BCP-47 locale of the current request. */
  readonly locale: string;
  readonly pagination?: { page: number; totalPages: number };
  readonly tags?: readonly string[];
  readonly searchQuery?: string;
  /** Per-request correlation id. See type-level doc above. */
  readonly requestId?: string;
}

/**
 * Minimal per-log context available to adapter methods that emit
 * structured logs. The resolver constructs this from its own
 * `SeoResolutionContext` before calling adapter hooks that can log
 * (currently `toStructuredData`). Kept as a separate shape so the
 * adapter contract does not depend on the full `SeoResolutionContext`
 * — adapters only get the fields they need for correlation.
 */
export interface SeoLogContext {
  readonly requestId?: string;
}

/** Resolved OG / Twitter image metadata. */
export interface ResolvedImage {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string | null;
}

/**
 * Canonical output of the SEO engine. Every consumer (Next.js metadata
 * converter, admin SERP preview, sitemap, JSON-LD renderer) reads this
 * one shape. Adding a field here is a platform-wide change.
 */
export interface ResolvedSeo {
  readonly title: string;
  readonly description: string | null;
  readonly canonicalUrl: string;
  readonly canonicalPath: string;
  readonly noindex: boolean;
  readonly nofollow: boolean;
  readonly openGraph: {
    /**
     * `og:type`. Narrowed to values Next.js's Metadata OpenGraph union
     * accepts. Facebook's spec also defines `product`, but Next's types
     * reject it and Shopify-grade sites emit `website` on product pages
     * anyway; we follow the same convention. Merchants who want
     * `og:type=product` can emit it via `structuredDataExtensions`.
     */
    readonly type: "website" | "article";
    readonly url: string;
    readonly title: string;
    readonly description: string | null;
    readonly siteName: string;
    readonly locale: string;
    readonly image: ResolvedImage | null;
  };
  readonly twitterCard: {
    readonly card: "summary" | "summary_large_image";
    readonly site: string | null;
    readonly title: string;
    readonly description: string | null;
    readonly image: ResolvedImage | null;
  };
  readonly hreflang: ReadonlyArray<{ readonly code: string; readonly url: string }>;
  readonly structuredData: readonly StructuredDataObject[];
}

/**
 * A single JSON-LD object. Always has `@context` and `@type`, plus
 * arbitrary schema.org fields.
 */
export type StructuredDataObject = Record<string, unknown> & {
  "@context": "https://schema.org";
  "@type": string;
};

// ── Safe parsers for the trust boundary ────────────────────────

/**
 * Validate a value that arrived as Prisma.JsonValue (or equivalent) and
 * either return a typed SeoMetadata or `null`.
 *
 * `null` / `undefined` input is the common "no override set" case — we
 * return `null` without logging. Malformed input (object shape wrong,
 * extra keys, wrong types) is an anomaly — we log and return `null` so
 * the fallback chain still works instead of 500-ing the page.
 */
export function safeParseSeoMetadata(jsonValue: unknown): SeoMetadata | null {
  if (jsonValue === null || jsonValue === undefined) return null;
  const parsed = SeoMetadataSchema.safeParse(jsonValue);
  if (!parsed.success) {
    log("warn", "seo.metadata.parse_failed", {
      reason: parsed.error.message,
    });
    return null;
  }
  return parsed.data;
}

/**
 * Validate a value that arrived as Prisma.JsonValue and always return a
 * usable `SeoDefaults`.
 *
 * `null` / `undefined` is the common "tenant has not configured SEO yet"
 * case — we return the schema defaults silently. Malformed input is an
 * anomaly — we log and fall back to schema defaults so we never 500.
 */
export function safeParseSeoDefaults(jsonValue: unknown): SeoDefaults {
  if (jsonValue === null || jsonValue === undefined) {
    return SeoDefaultsSchema.parse({});
  }
  const parsed = SeoDefaultsSchema.safeParse(jsonValue);
  if (!parsed.success) {
    log("warn", "seo.defaults.parse_failed", {
      reason: parsed.error.message,
    });
    return SeoDefaultsSchema.parse({});
  }
  return parsed.data;
}
