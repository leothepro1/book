'use client';

import { useEffect, useState } from 'react';
import { getSearchProviders } from './registry';
import type { SearchResultGroup } from './types';

/**
 * Search engine hook.
 *
 * Given a query, runs every registered provider in parallel and returns
 * grouped results. Handles three robustness invariants:
 *
 *   1. Debounce — ~180ms after the last keystroke before any provider
 *      runs. Avoids hammering remote/db backends as the user types.
 *   2. Cancellation — every keystroke supersedes the previous query.
 *      The hook fires `AbortController.abort()` on the previous round so
 *      providers that respect `signal` short-circuit their work.
 *   3. Out-of-order safety — the latest query holds a "round" id;
 *      results from older rounds are dropped on commit.
 *
 * Empty / whitespace-only query → `{ groups: [], isLoading: false }`.
 * No registered providers → same. Errors per provider are caught and
 * the provider's group is omitted (never crashes the modal).
 */

const DEBOUNCE_MS = 180;

export function useSearchEngine(query: string): {
  groups: SearchResultGroup[];
  isLoading: boolean;
} {
  const [groups, setGroups] = useState<SearchResultGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      // Clearing the result set when the input empties — terminal,
      // never cascades.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGroups([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoading(false);
      return;
    }

    const providers = getSearchProviders();
    if (providers.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGroups([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);

    const debounceTimer = setTimeout(async () => {
      const settled = await Promise.allSettled(
        providers.map(async (p) => {
          const max = p.maxResults ?? 5;
          const raw = await p.search(trimmed, controller.signal);
          return {
            providerId: p.id,
            label: p.label,
            results: raw.slice(0, max),
          } satisfies SearchResultGroup;
        }),
      );

      if (cancelled) return;

      const next: SearchResultGroup[] = [];
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value.results.length > 0) {
          next.push(r.value);
        }
      }
      // setState happens after the awaited provider work — async, not a
      // synchronous cascade from the effect body. Lint can't see the
      // boundary, so disable here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGroups(next);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoading(false);
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      controller.abort();
    };
  }, [query]);

  return { groups, isLoading };
}
