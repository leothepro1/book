/**
 * Tax provider registry — module-level. Adapters call
 * `registerTaxProvider` at import time; `getTaxProvider(key)` and
 * `listTaxProviders()` are the read paths.
 *
 * Tax-0 ships the framework only. Tax-1 registers the `builtin`
 * provider; Tax-8 adds Avalara.
 */

import type { TaxProvider } from "./interface";

const registeredProviders = new Map<string, TaxProvider>();

export function registerTaxProvider(provider: TaxProvider): void {
  if (registeredProviders.has(provider.key)) {
    throw new Error(`TaxProvider key collision: ${provider.key}`);
  }
  registeredProviders.set(provider.key, provider);
}

export function getTaxProvider(key: string): TaxProvider | undefined {
  return registeredProviders.get(key);
}

export function listTaxProviders(): readonly TaxProvider[] {
  return Array.from(registeredProviders.values());
}

/**
 * Test-only helper. Production code MUST NOT call this — it would
 * deregister adapters that other modules depend on. Exported here so
 * unit tests can reset the singleton between cases.
 */
export function __resetTaxProviderRegistryForTests(): void {
  registeredProviders.clear();
}
