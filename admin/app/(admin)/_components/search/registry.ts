/**
 * Global search — provider registry.
 *
 * Single source of truth for which resource types contribute to the
 * global search modal. Modules register at module-load time:
 *
 *   import { registerSearchProvider } from "@/app/(admin)/_components/search/registry";
 *   registerSearchProvider({
 *     id: "orders",
 *     label: "Ordrar",
 *     icon: "inbox",
 *     search: async (q, signal) => { ... },
 *   });
 *
 * The registry is intentionally a module-level Map — there is exactly
 * one search engine per running app. Re-registering with the same id
 * replaces the previous provider (useful for dev hot-reload).
 */

import type { SearchProvider } from './types';

const providers = new Map<string, SearchProvider>();

/** Register a provider. Idempotent — replaces any existing with same id. */
export function registerSearchProvider(provider: SearchProvider): void {
  providers.set(provider.id, provider);
}

/** Remove a provider by id. No-op when not present. */
export function unregisterSearchProvider(id: string): void {
  providers.delete(id);
}

/** Snapshot of all currently registered providers, in insertion order. */
export function getSearchProviders(): SearchProvider[] {
  return Array.from(providers.values());
}

/** True when there are no registered providers — engine treats as no-op. */
export function hasSearchProviders(): boolean {
  return providers.size > 0;
}
