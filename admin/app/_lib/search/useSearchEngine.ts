"use client";

/**
 * useSearchEngine
 * ═══════════════
 *
 * Rendering-agnostic search motor. The same hook powers every theme's
 * search UI. The UI knows nothing about how data is fetched.
 * The motor knows nothing about how it is rendered.
 *
 * URL is the single source of truth:
 *   - On mount: hydrate SearchParams from URL searchParams
 *   - setParams(): updates local state only, does NOT navigate
 *   - commitToUrl(): serializes current params to URL via router.push()
 *   - search(): validates → fetches → updates results/status/error
 *   - On URL change: re-hydrate params, auto-trigger search() if complete
 *
 * Never throws. All errors surface as SearchEngineError in state.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, parseISO, startOfDay } from "date-fns";
import { fetchAvailability } from "./fetchAvailability";
import type {
  SearchParams,
  SearchResult,
  SearchEngineError,
  SearchStatus,
} from "./types";

// ── Helpers ─────────────────────────────────────────────────

function parseISOSafe(s: string | null): string | null {
  if (!s) return null;
  const d = parseISO(s);
  if (isNaN(d.getTime())) return null;
  return format(d, "yyyy-MM-dd");
}

const EMPTY_PARAMS: SearchParams = {
  checkIn: null,
  checkOut: null,
  adults: 2,
  children: 0,
  categoryIds: [],
};

const RETRY_DELAY = 1000;
const RETRYABLE_CODES = new Set(["TIMEOUT", "PMS_ERROR"]);

// ── Validation ──────────────────────────────────────────────

function validateParams(params: SearchParams): SearchEngineError | null {
  const today = format(startOfDay(new Date()), "yyyy-MM-dd");

  if (!params.checkIn || !params.checkOut) {
    return { code: "INVALID_DATE", message: "Datum saknas." };
  }

  if (params.checkIn < today) {
    return { code: "INVALID_DATE", message: "Incheckning kan inte vara i det förflutna." };
  }

  if (params.checkOut <= params.checkIn) {
    return { code: "INVALID_DATE_RANGE", message: "Utcheckning måste vara efter incheckning." };
  }

  // Night count check
  const checkInDate = parseISO(params.checkIn);
  const checkOutDate = parseISO(params.checkOut);
  const nights = Math.round(
    (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (nights < 1) {
    return { code: "INVALID_DATE_RANGE", message: "Minst 1 natt krävs." };
  }
  if (nights > 365) {
    return { code: "INVALID_DATE_RANGE", message: "Vistelse kan inte överstiga 365 nätter." };
  }

  if (params.adults < 1) {
    return { code: "INVALID_GUESTS", message: "Minst 1 vuxen krävs." };
  }

  if (params.children < 0 || params.children > 20) {
    return { code: "INVALID_GUESTS", message: "Ogiltigt antal barn." };
  }

  return null;
}

// ── URL Hydration ───────────────────────────────────────────

function hydrateFromUrl(sp: URLSearchParams): SearchParams {
  const checkIn = parseISOSafe(sp.get("checkIn"));
  const checkOut = parseISOSafe(sp.get("checkOut"));

  const guestsRaw = sp.get("guests");
  const guests = guestsRaw ? parseInt(guestsRaw, 10) : 0;
  const adults = !isNaN(guests) && guests > 0 ? guests : 2;

  const catRaw = sp.get("categories");
  const categoryIds: string[] = catRaw
    ? catRaw.split(",").filter(Boolean)
    : [];

  return { checkIn, checkOut, adults, children: 0, categoryIds };
}

// ── Hook ────────────────────────────────────────────────────

export interface UseSearchEngine {
  // State
  params: SearchParams;
  status: SearchStatus;
  error: SearchEngineError | null;
  results: SearchResult[];

  // Actions
  setParams: (patch: Partial<SearchParams>) => void;
  search: () => Promise<void>;
  reset: () => void;
  commitToUrl: () => void;
}

export function useSearchEngine(opts: {
  tenantId: string;
}): UseSearchEngine {
  const { tenantId } = opts;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [params, setParamsState] = useState<SearchParams>(() =>
    hydrateFromUrl(searchParams),
  );
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [error, setError] = useState<SearchEngineError | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);

  // Track whether we've done initial hydration
  const initialHydrationDone = useRef(false);
  // Track current search to avoid stale updates
  const searchVersion = useRef(0);

  // ── setParams: update local state only ──────────────────
  const setParams = useCallback((patch: Partial<SearchParams>) => {
    setParamsState((prev) => ({ ...prev, ...patch }));
  }, []);

  // ── search: validate → fetch → update state ────────────
  const search = useCallback(async () => {
    const currentParams = params; // capture at call time
    const validationError = validateParams(currentParams);
    if (validationError) {
      setError(validationError);
      setStatus("error");
      return;
    }

    const version = ++searchVersion.current;
    setStatus("loading");
    setError(null);

    const attempt = async (): Promise<{
      results: SearchResult[];
      error: SearchEngineError | null;
    }> => {
      const result = await fetchAvailability(tenantId, currentParams);
      return { results: result.results, error: result.error };
    };

    let result = await attempt();

    // Automatic single retry on TIMEOUT or PMS_ERROR
    if (result.error && RETRYABLE_CODES.has(result.error.code)) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY));
      if (searchVersion.current !== version) return; // stale
      console.error(
        `[SearchEngine] Retrying after ${result.error.code}`,
        { tenantId, params: currentParams, timestamp: new Date().toISOString() },
      );
      result = await attempt();
    }

    // Guard against stale updates
    if (searchVersion.current !== version) return;

    if (result.error && result.results.length === 0) {
      setResults([]);
      setError(result.error);
      setStatus("error");
      console.error(
        `[SearchEngine] Search failed: ${result.error.code}`,
        { tenantId, params: currentParams, message: result.error.message, timestamp: new Date().toISOString() },
      );
    } else {
      setResults(result.results);
      setError(result.error); // may be PARTIAL_RESULTS
      setStatus("success");
    }
  }, [params, tenantId]);

  // ── commitToUrl: serialize params to URL ────────────────
  const commitToUrl = useCallback(() => {
    const sp = new URLSearchParams();
    if (params.checkIn) sp.set("checkIn", params.checkIn);
    if (params.checkOut) sp.set("checkOut", params.checkOut);
    const totalGuests = params.adults + params.children;
    if (totalGuests > 0) sp.set("guests", String(totalGuests));
    if (params.categoryIds.length > 0) sp.set("categories", params.categoryIds.join(","));
    router.push(`/search?${sp.toString()}`, { scroll: false });
  }, [params, router]);

  // ── reset: clear everything ─────────────────────────────
  const reset = useCallback(() => {
    searchVersion.current++;
    setParamsState(EMPTY_PARAMS);
    setResults([]);
    setError(null);
    setStatus("idle");
  }, []);

  // ── Re-hydrate from URL when searchParams change ────────
  // This handles browser back/forward and external URL changes.
  // The engine only manages form state — result fetching is the
  // responsibility of downstream consumers (SearchResultsRenderer,
  // StaysClient) which listen to URL changes independently.
  useEffect(() => {
    if (!initialHydrationDone.current) {
      initialHydrationDone.current = true;
      return;
    }
    // On subsequent URL changes: update form params to stay in sync
    setParamsState(hydrateFromUrl(searchParams));
  }, [searchParams]);

  return {
    params,
    status,
    error,
    results,
    setParams,
    search,
    reset,
    commitToUrl,
  };
}
