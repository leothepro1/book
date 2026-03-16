// ── Config change channel ─────────────────────────────────────
//
// Module-level pub/sub singleton. Browser-safe. No React dependencies.
// Bridges PreviewContext (editor tree) → TranslationPanel (settings tree).
//
// PreviewContext emits on every config change.
// TranslationPanel subscribes and re-scans on debounced updates.

import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";

type ConfigListener = (config: TenantConfig) => void;

const listeners = new Set<ConfigListener>();

export const configChannel = {
  emit(config: TenantConfig): void {
    for (const listener of listeners) {
      listener(config);
    }
  },
  subscribe(fn: ConfigListener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};
