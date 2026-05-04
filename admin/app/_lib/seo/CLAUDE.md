# SEO engine

Shopify-pattern SEO motor. Single resolver, adapter-per-entity-type,
canonical `ResolvedSeo` shape consumed by Next metadata, sitemap,
JSON-LD, OG generator, and admin preview.

> **Full architecture spec lives at the repo root**: `seoengine.md` (1143 lines).
> That document is the design contract — read it for any non-trivial SEO change.
> This file is the at-a-glance reference.

---

## The 7 core principles

1. **One central API**, not per-entity code. All SEO queries go through `SeoResolver`.
2. **Three-tier fallback**: `Tenant defaults` → `PageType pattern` → `Entity override`.
3. **`Seoable` is the contract.** Each entity type adapts itself to SEO via an adapter.
4. **`ResolvedSeo` is the canonical output shape** — every consumer reads the same shape.
5. **Lifting, not inheritance** — adapters are functions, not base classes (Shopify GraphQL pattern in TS).
6. **All resolution is tenant-scoped** — no global SEO state.
7. **Pure functions where possible** — interpolation, fallback, hreflang are deterministic and testable.

---

## Public API surface

Only `app/_lib/seo/index.ts` is consumed externally. It exports:

  SeoResolver                  — class, instance per request
  registerSeoAdapter / getSeoAdapter / getAllSeoAdapters
  createCloudinaryImageService — production image-service factory
  createPageTypeSeoDefaultRepository — production repo factory

NEVER import from `resolver.ts`, `adapters/base.ts`, `interpolation.ts`,
`paths.ts`, `hreflang.ts`, etc. directly. The barrel hides implementation
details so the engine can refactor freely.

---

## Adapter contract

```typescript
interface SeoAdapter<T> {
  resourceType: string;                          // "accommodation" | "product" | …
  resolve(entity: T, ctx: ResolutionContext): Promise<Seoable>;
  sitemapEntries?(tenantId: string): AsyncIterable<SitemapEntry>;
}
```

Each adapter translates its domain model to the canonical `Seoable` shape.
The resolver knows nothing about Accommodation, Product, Page, etc.

Built-in adapters: accommodation, accommodation-index, product, product-collection,
page, article, blog, search.

---

## Data model

Every seoable entity has `seo Json?` (validated via Zod `SeoMetadataSchema`).
JSONB chosen over a separate table because SEO data is always 1:1 with entity
and never queried cross-entity. Schema evolution via Zod, never `ALTER TABLE`.

`Tenant.seoDefaults Json?` — tenant-wide defaults.
`PageTypeSeoDefault` model — per-page-type patterns ("Theme SEO settings").
`SeoRedirect` model — 301-redirect history for changed handles.

---

## Consumers

- Next.js `generateMetadata()` → calls `resolver.resolve()` → `toNextMetadata()`
- `<StructuredData>` component — JSON-LD `<script>` tag in `<head>`
- `app/sitemap.ts` — iterates all adapters' `sitemapEntries()`
- `app/robots.ts` — per-tenant robots.txt
- Admin SEO panel — same Seoable shape, live preview via `previewSeoFromDraft`

All consumers read the same `ResolvedSeo` — adding a new consumer requires
zero adapter changes.

---

## Hreflang + multilocale

`hreflang.ts` resolves alternates for the current entity across published
locales. Self-canonical per locale. `x-default` points to the primary locale.
Sitemap emits `<xhtml:link rel="alternate" hreflang>` tags.

---

## Redirects

`redirects/` — handle-change tracking + middleware lookup. When a handle
changes, the old slug → new slug record is written to `SeoRedirect`. The
middleware checks before returning 404. Manual redirects also live here.

---

## Request cache

`request-cache.ts` — React `cache()` deduplication. Multiple consumers in
the same RSC render (metadata + page + JSON-LD) call resolve once, share
the result.

---

## Key files

- Public barrel: `app/_lib/seo/index.ts`
- Resolver: `app/_lib/seo/resolver.ts`
- Adapter base + registry: `app/_lib/seo/adapters/base.ts`
- Adapters: `app/_lib/seo/adapters/{accommodation,product,page,…}.ts`
- Interpolation (pattern variables): `app/_lib/seo/interpolation.ts`
- Hreflang: `app/_lib/seo/hreflang.ts`
- Path builders: `app/_lib/seo/paths.ts`
- Redirects: `app/_lib/seo/redirects/`
- Sitemap subsystem: `app/_lib/seo/sitemap/`
- Image service: `app/_lib/seo/image-service-impl.ts`
- Page-type defaults repo: `app/_lib/seo/page-type-defaults-impl.ts`
- Bootstrap (registers all adapters at boot): `app/_lib/seo/bootstrap.ts`
- Full design doc: `seoengine.md` (repo root)

---

## SEO invariants — never violate

1. **No hardcoded SEO logic in page components.** They call `resolveSeoCached` and return.
2. **All adapters implement the same interface.** Resource-type-specific
   methods belong on the adapter, never on the resolver.
3. **Fallback chain is always Override → Pattern → Fallback.** Never reorder per field.
4. Public API is `index.ts` only — never import from resolver/base/internals.
5. JSON-LD output passes through `json-ld-safe.ts` — escapes `</script>` injection.
6. OG image generation is async + cached — never blocks SSR.
7. Redirect lookup runs in middleware before any 404 — every old handle resolves.
8. `seo` JSONB on entity validated via Zod on read — never trust DB shape.
9. Pure functions stay pure — interpolation, paths, hreflang have no I/O.
10. New entity type = new adapter file + register call. Zero changes to resolver, sitemap, or admin panel.
