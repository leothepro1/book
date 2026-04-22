/**
 * Adapter Resolution (with TTL cache)
 * ═════════════════════════════════════
 *
 * The ONLY function platform code calls to get an adapter.
 * No page, component, or API route ever calls getAdapter() directly.
 *
 * Resolution logic:
 *   1. Query TenantIntegration for this tenant
 *   2. If none exists or status !== "active", return ManualAdapter
 *   3. Otherwise, decrypt credentials and return the provider's adapter
 *
 * Caching:
 *   The webhook and reconciliation paths call resolveAdapter() many
 *   times per second for the same tenants. Hitting Postgres for the
 *   same TenantIntegration row on every call is wasted I/O and adds
 *   unnecessary latency to event processing. We keep a module-level
 *   TTL cache keyed by tenantId. 60s is short enough that credential
 *   rotations propagate promptly; for anything shorter than that we
 *   provide invalidateAdapterCache() for explicit invalidation (e.g.
 *   the admin "update PMS credentials" flow).
 */

import type { PmsAdapter } from "./adapter";
import type { PmsProvider } from "./types";
import { getAdapter } from "./registry";
import { decryptCredentials } from "./crypto";
import { prisma } from "@/app/_lib/db/prisma";

const CACHE_TTL_MS = 60_000;

interface CachedAdapter {
  adapter: PmsAdapter;
  expiresAt: number;
}

const adapterCache = new Map<string, CachedAdapter>();

/**
 * Explicitly invalidate the cached adapter for a tenant.
 * Call from admin flows that mutate TenantIntegration (credential
 * rotation, status change, disconnect). Safe to call for tenants
 * that aren't cached — it's a no-op then.
 */
export function invalidateAdapterCache(tenantId: string): void {
  adapterCache.delete(tenantId);
}

export async function resolveAdapter(tenantId: string): Promise<PmsAdapter> {
  const cached = adapterCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.adapter;
  }

  const adapter = await resolveAdapterFresh(tenantId);
  adapterCache.set(tenantId, {
    adapter,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return adapter;
}

async function resolveAdapterFresh(tenantId: string): Promise<PmsAdapter> {
  const integration = await prisma.tenantIntegration.findUnique({
    where: { tenantId },
  });

  if (!integration || integration.status !== "active") {
    return getAdapter("manual");
  }

  const provider = integration.provider as PmsProvider;

  if (provider === "manual") {
    return getAdapter("manual");
  }

  // If no encrypted credentials stored, fall back to FakeAdapter
  // (demo environment without real PMS credentials). In production,
  // getAdapter("fake") throws — this is intentional: a prod-mode
  // integration without creds is a misconfiguration and should
  // surface loudly rather than silently fake traffic.
  if (!integration.credentialsEncrypted) {
    return getAdapter("fake", { scenario: "happy", delayMs: "200" });
  }

  // Decrypt credentials and use the real adapter — even in demo mode,
  // real credentials take precedence so testConnection() hits the PMS.
  const credentials = decryptCredentials(
    Buffer.from(integration.credentialsEncrypted),
    Buffer.from(integration.credentialsIv),
  );

  return getAdapter(provider, credentials);
}
