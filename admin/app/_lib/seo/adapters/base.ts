/**
 * SEO Engine — Adapter Contract & Registry
 * ════════════════════════════════════════
 *
 * Every seoable entity type (Accommodation, Product, Page, ...) exposes
 * itself to the engine via a `SeoAdapter` implementation. Adapters are
 * registered once at module load time and looked up by `SeoResourceType`.
 *
 * The resolver knows nothing about concrete entities — it only consumes
 * the `Seoable` contract produced by `toSeoable()`. Adding a new
 * entity type is purely additive: write an adapter, register it, done.
 *
 * Adapter methods take `SeoTenantContext` (not Prisma `Tenant`) so the
 * engine stays decoupled from the dozens of unrelated fields on the
 * Tenant row. Callers convert once via `tenantToSeoContext()`.
 */

import type {
  ResolvedImage,
  Seoable,
  SeoLogContext,
  SeoResourceType,
  SeoTenantContext,
  StructuredDataObject,
} from "../types";

// ── Sitemap entry ──────────────────────────────────────────────

/**
 * A single URL entry produced by `SeoAdapter.getSitemapEntries()`.
 * The shape matches the subset of sitemap.org the M7 sitemap generator
 * emits — one canonical URL plus optional hreflang alternates.
 */
export interface SitemapEntry {
  readonly url: string;
  readonly lastmod: Date;
  readonly alternates?: ReadonlyArray<{
    readonly hreflang: string;
    readonly url: string;
  }>;
}

// ── Adapter interface ──────────────────────────────────────────

/**
 * The contract every entity-type adapter must implement.
 *
 * Generic parameter `TEntity` is the concrete domain type (e.g. the
 * Prisma `Accommodation` model, plus any relations the adapter needs
 * included — see `adapters/accommodation.ts` for the exact shape).
 * The adapter owns the cast; callers treat adapters as
 * `SeoAdapter<unknown>` via the registry.
 *
 * All methods are pure aside from the implicit narrow rules:
 *   - `toSeoable`, `toStructuredData`, `isIndexable`,
 *     `getSitemapEntries`, `getAdapterOgImage` are sync and pure.
 *   - The resolver awaits the async dependencies (`ImageService`,
 *     `PageTypeSeoDefaultRepository`) on its own — adapters never
 *     perform IO.
 */
export interface SeoAdapter<TEntity = unknown> {
  /** Discriminator — matched against `SeoResolutionContext.resourceType`. */
  readonly resourceType: SeoResourceType;

  /**
   * Lift a concrete domain entity into the generic Seoable contract.
   * Pure — no side effects, no async.
   */
  toSeoable(entity: TEntity, tenant: SeoTenantContext): Seoable;

  /**
   * Produce adapter-specific JSON-LD objects (e.g. `Accommodation`,
   * `Product`). Runs only when `PageTypeSeoDefault.structuredDataEnabled`
   * is true for the tenant/page-type.
   *
   * `logContext` carries per-request correlation data (currently just
   * `requestId`) so that adapter-emitted logs can be tied back to the
   * originating HTTP request. Optional — tests and callers outside
   * the resolver can omit it.
   */
  toStructuredData(
    entity: TEntity,
    tenant: SeoTenantContext,
    locale: string,
    logContext?: SeoLogContext,
  ): StructuredDataObject[];

  /**
   * Whether this entity should appear in sitemaps and be indexed by
   * search engines. Typically: published + not soft-deleted +
   * `seoOverrides.noindex` not set.
   */
  isIndexable(entity: TEntity): boolean;

  /**
   * Produce one sitemap entry per locale the entity is published in.
   * Consumed by the M7 sitemap generator.
   */
  getSitemapEntries(
    entity: TEntity,
    tenant: SeoTenantContext,
    locales: readonly string[],
  ): SitemapEntry[];

  /**
   * Optional: adapter-specific OG image override.
   * Returning `null` falls through to the standard chain (entity
   * featuredImage → tenant default → dynamic generation).
   */
  getAdapterOgImage?(
    entity: TEntity,
    tenant: SeoTenantContext,
  ): ResolvedImage | null;
}

// ── Registry ───────────────────────────────────────────────────

/**
 * Module-level singleton map. One adapter per resource type.
 *
 * Note: this state persists across tests within a single vitest process.
 * Test suites that depend on a clean registry must call
 * `_clearSeoAdaptersForTests()` in `beforeEach`.
 */
const adapters = new Map<SeoResourceType, SeoAdapter>();

/**
 * Register an adapter. If one is already registered for this resource
 * type, it is replaced (Map semantics). This makes adapter registration
 * idempotent under module-reload, which is important during dev HMR.
 */
export function registerSeoAdapter<T>(adapter: SeoAdapter<T>): void {
  adapters.set(adapter.resourceType, adapter as SeoAdapter);
}

/**
 * Look up the adapter for a resource type.
 * @throws Error if no adapter has been registered for `resourceType` —
 *   indicates a bootstrap bug (adapter file not imported).
 */
export function getSeoAdapter(resourceType: SeoResourceType): SeoAdapter {
  const adapter = adapters.get(resourceType);
  if (!adapter) {
    throw new Error(
      `No SEO adapter registered for resource type "${resourceType}"`,
    );
  }
  return adapter;
}

/**
 * Return every registered adapter in insertion order (Map iteration order).
 * Used by the sitemap generator (M7) to enumerate seoable resources.
 */
export function getAllSeoAdapters(): SeoAdapter[] {
  return Array.from(adapters.values());
}

/**
 * Test-only: wipe the registry. NEVER call this in production code —
 * doing so would break every in-flight request relying on the engine.
 * The `_` prefix is a convention signalling "internal, test-only".
 */
export function _clearSeoAdaptersForTests(): void {
  adapters.clear();
}
