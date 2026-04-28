/**
 * Global search — types.
 *
 * Mirrors Shopify's spotlight-search architecture: a single global modal
 * fed by pluggable per-resource providers. Each module (orders,
 * customers, products, …) registers a provider that implements `search()`.
 *
 * The engine runs every registered provider in parallel, groups the
 * results, and renders them in the modal. No provider knows about any
 * other — adding a new resource type is one `registerSearchProvider()`
 * call.
 */

/** A single result row in the search modal. */
export type SearchResult = {
  /** Unique within a single provider's results — used as React key. */
  id: string;
  /** Primary line shown for this result. */
  title: string;
  /** Optional secondary line (e.g. order #, customer email). */
  subtitle?: string;
  /** URL the result links to when selected. */
  href: string;
  /** Material Symbols Rounded icon name (when no image). */
  icon?: string;
  /** Optional image URL — takes precedence over `icon` when set. */
  iconUrl?: string;
};

/** Results grouped under a provider's label in the modal. */
export type SearchResultGroup = {
  providerId: string;
  /** Section heading shown above the group. */
  label: string;
  results: SearchResult[];
};

/**
 * A pluggable search provider — one per resource type.
 *
 * `search()` is called with the user's query. It must return ALL matches
 * for that query (or `maxResults`-limited set). Implementations should
 * respect the optional `signal` and abort in-flight work when it fires;
 * the engine cancels superseded queries to avoid race conditions.
 */
export type SearchProvider = {
  /** Stable identifier — used as map key in the registry. */
  id: string;
  /** Human-readable label shown above this provider's group. */
  label: string;
  /** Optional Material Symbol shown next to the group label. */
  icon?: string;
  /** Cap on results returned by this provider per query (default 5). */
  maxResults?: number;
  /** Search implementation. Must be cancellation-aware. */
  search: (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
};
