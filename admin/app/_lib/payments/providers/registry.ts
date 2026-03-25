/**
 * Payment Provider Registry
 * ═════════════════════════
 *
 * Single place where adapters are registered.
 * Adding a new provider = one adapter file + one registerPaymentAdapter() call.
 */

import type { PaymentAdapter } from "./types";

const registry = new Map<string, PaymentAdapter>();

export function registerPaymentAdapter(adapter: PaymentAdapter): void {
  if (registry.has(adapter.providerKey)) {
    throw new Error(
      `Payment adapter already registered: ${adapter.providerKey}`,
    );
  }
  registry.set(adapter.providerKey, adapter);
}

export function getPaymentAdapter(providerKey: string): PaymentAdapter {
  const adapter = registry.get(providerKey);
  if (!adapter) {
    throw new Error(
      `No payment adapter registered for provider: ${providerKey}. ` +
        `Registered: ${[...registry.keys()].join(", ")}`,
    );
  }
  return adapter;
}

export function listPaymentAdapters(): PaymentAdapter[] {
  return [...registry.values()];
}
