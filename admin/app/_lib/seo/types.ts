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
 * Shape of Tenant.seoDefaults JSONB.
 *
 * `titleTemplate` has a sensible default so every tenant resolves titles
 * even if they never open the SEO settings screen.
 *
 * `twitterSite` requires the leading `@` — Twitter's own format. Reject
 * anything else so we don't emit `twitter:site="bedfront"` which is invalid.
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
}

// ── Resolution IO ──────────────────────────────────────────────

/**
 * Input to SeoResolver.resolve(). Adapters dispatch on `resourceType`
 * and cast `entity` to their domain type internally.
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
    readonly type: "website" | "article" | "product";
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
