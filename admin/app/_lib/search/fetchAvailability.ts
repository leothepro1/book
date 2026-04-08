/**
 * fetchAvailability
 * ═════════════════
 *
 * Client-side wrapper for GET /api/availability.
 * Never throws — always returns a result object.
 * Implements 10-second timeout via AbortController.
 * Validates response shape before returning.
 *
 * All search UIs call this function. None call fetch() directly.
 */

import type {
  SearchParams,
  SearchResult,
  SearchEngineError,
  AvailabilityResponse,
} from "./types";

export interface FetchAvailabilityResult {
  results: SearchResult[];
  error: SearchEngineError | null;
  response: AvailabilityResponse | null;
}

const TIMEOUT_MS = 18_000;

export async function fetchAvailability(
  tenantId: string,
  params: SearchParams,
): Promise<FetchAvailabilityResult> {
  if (!params.checkIn || !params.checkOut) {
    return {
      results: [],
      error: { code: "INVALID_DATE", message: "Datum saknas." },
      response: null,
    };
  }

  const url = new URL("/api/availability", window.location.origin);
  url.searchParams.set("tenantId", tenantId);
  url.searchParams.set("checkIn", params.checkIn);
  url.searchParams.set("checkOut", params.checkOut);
  url.searchParams.set("guests", String(params.adults + params.children));
  if (params.categoryIds.length > 0) {
    url.searchParams.set("categories", params.categoryIds.join(","));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        results: [],
        error: { code: "TIMEOUT", message: "Sökningen tog för lång tid. Försök igen." },
        response: null,
      };
    }
    return {
      results: [],
      error: { code: "NETWORK_ERROR", message: "Kunde inte nå servern. Kontrollera din anslutning." },
      response: null,
    };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const status = res.status;
    if (status === 503) {
      return {
        results: [],
        error: { code: "PMS_ERROR", message: "Bokningssystemet är tillfälligt otillgängligt." },
        response: null,
      };
    }
    if (status === 400) {
      return {
        results: [],
        error: { code: "INVALID_DATE", message: "Ogiltiga sökparametrar." },
        response: null,
      };
    }
    return {
      results: [],
      error: { code: "NETWORK_ERROR", message: "Ett oväntat fel uppstod." },
      response: null,
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      results: [],
      error: { code: "INVALID_RESPONSE", message: "Ogiltigt svar från servern." },
      response: null,
    };
  }

  // Validate response shape
  if (
    !body ||
    typeof body !== "object" ||
    !("results" in body) ||
    !Array.isArray((body as AvailabilityResponse).results) ||
    !("searchParams" in body)
  ) {
    return {
      results: [],
      error: { code: "INVALID_RESPONSE", message: "Ogiltigt svar från servern." },
      response: null,
    };
  }

  const data = body as AvailabilityResponse;

  // Check X-Bedfront-Partial header for partial results
  const isPartial = res.headers.get("X-Bedfront-Partial") === "true";
  const error: SearchEngineError | null = isPartial
    ? { code: "PARTIAL_RESULTS", message: "Vissa boenden kunde inte hämtas." }
    : null;

  return {
    results: data.results,
    error,
    response: data,
  };
}
