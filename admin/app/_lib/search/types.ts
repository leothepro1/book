/**
 * Search Engine Types
 * ═══════════════════
 *
 * Single source of truth for all search-related types.
 * Every search form, result renderer, and API consumer imports from here.
 *
 * All monetary values in ören (integers). Never floats.
 * All dates as ISO strings "YYYY-MM-DD" at boundaries. Never Date objects.
 */

// ── Search Parameters ───────────────────────────────────────

export interface SearchParams {
  checkIn: string | null;       // "YYYY-MM-DD"
  checkOut: string | null;      // "YYYY-MM-DD"
  adults: number;               // min 1
  children: number;             // min 0
  categoryIds: string[];        // AccommodationCategory IDs — empty = all
}

// ── Search Results ──────────────────────────────────────────

export interface SearchResultHighlight {
  icon: string;
  text: string;
}

export interface SearchResultCategory {
  externalId: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  type: string;
  imageUrls: string[];
  maxGuests: number;
  facilities: string[];
  highlights: SearchResultHighlight[];
  basePricePerNight: number;    // ören
}

export interface SearchResultRatePlan {
  externalId: string;
  name: string;
  description?: string;
  cancellationPolicy?: string;
  cancellationDescription?: string;
  nightlyAmount: number;        // ören
  totalAmount: number;          // ören
  currency: string;
}

export interface SearchResult {
  category: SearchResultCategory;
  ratePlans: SearchResultRatePlan[];
  availableUnits: number;
  available: boolean;
  restrictionViolations: string[];
  accommodationId: string | null;
}

export interface SearchResponseParams {
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
}

export interface AvailabilityResponse {
  results: SearchResult[];
  searchParams: SearchResponseParams;
  tenantId: string;
}

// ── Error Types ─────────────────────────────────────────────

export type SearchErrorCode =
  | "INVALID_DATE"
  | "INVALID_DATE_RANGE"
  | "INVALID_GUESTS"
  | "TIMEOUT"
  | "PMS_ERROR"
  | "PARTIAL_RESULTS"
  | "INVALID_RESPONSE"
  | "NETWORK_ERROR";

export interface SearchEngineError {
  code: SearchErrorCode;
  message: string;
}

// ── Engine State ────────────────────────────────────────────

export type SearchStatus = "idle" | "loading" | "success" | "error";
