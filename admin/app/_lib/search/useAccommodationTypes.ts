"use client";

/**
 * useAccommodationTypes
 * ═════════════════════
 *
 * Client-side hook that fetches visible accommodation categories for a tenant.
 * Calls GET /api/accommodation-types (tenant resolved from Host header).
 *
 * Short-lived cache (30 seconds) — balances performance with freshness.
 * After an admin toggles category visibility and the server cache is
 * invalidated via revalidateTag, the next client fetch (within 30s) will
 * pick up the change.
 *
 * Never throws — swallows errors and returns empty array.
 */

import { useState, useEffect } from "react";
import type { SearchAccommodationType } from "./getAccommodationTypes";

const CACHE_TTL_MS = 30_000; // 30 seconds

type CacheEntry = {
  data: SearchAccommodationType[];
  fetchedAt: number;
};

const cache = new Map<string, CacheEntry>();

function getCached(tenantId: string): SearchAccommodationType[] | null {
  const entry = cache.get(tenantId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    cache.delete(tenantId);
    return null;
  }
  return entry.data;
}

export function useAccommodationTypes(tenantId: string): SearchAccommodationType[] {
  const [types, setTypes] = useState<SearchAccommodationType[]>(() => getCached(tenantId) ?? []);

  useEffect(() => {
    if (!tenantId) return;

    const cached = getCached(tenantId);
    if (cached) {
      setTypes(cached);
      return;
    }

    let cancelled = false;
    fetch("/api/accommodation-types", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        const fetched = Array.isArray(data.types) ? data.types as SearchAccommodationType[] : [];
        cache.set(tenantId, { data: fetched, fetchedAt: Date.now() });
        setTypes(fetched);
      })
      .catch(() => { /* swallow — returns empty array */ });

    return () => { cancelled = true; };
  }, [tenantId]);

  return types;
}
