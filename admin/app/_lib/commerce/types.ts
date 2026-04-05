/**
 * Commerce Engine Types
 * ═════════════════════
 *
 * Single source of truth for all commerce types used by the
 * booking flow: accommodation selection, pricing, addons, checkout.
 *
 * All monetary values in ören (integers). Never floats. Never strings.
 * All dates as ISO strings "YYYY-MM-DD". Never Date objects crossing boundaries.
 */

// ─── Status & Error ────────────────────────────────────────

export type CommerceStatus = "idle" | "loading" | "success" | "error";

export type CommerceErrorCode =
  | "NOT_AVAILABLE"
  | "RATE_PLAN_NOT_FOUND"
  | "PRICING_FAILED"
  | "CHECKOUT_FAILED"
  | "SESSION_EXPIRED"
  | "INVALID_PARAMS"
  | "PMS_TIMEOUT";

export type CommerceError = {
  code: CommerceErrorCode;
  message: string;
};

// ─── Selection ─────────────────────────────────────────────

export type AccommodationSelection = {
  accommodationId: string;
  ratePlanId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
};

// ─── Pricing ───────────────────────────────────────────────

export type PricingLineItem = {
  label: string;
  amount: number;
  nights?: number;
  perNight?: number;
};

export type PricingSummary = {
  baseTotal: number;
  addonsTotal: number;
  discountAmount: number;
  total: number;
  currency: string;
  nights: number;
  lineItems: PricingLineItem[];
  ratePlanName: string;
  pricePerNight: number;
  isFrozen: boolean;
};

// ─── Addons ────────────────────────────────────────────────

export type SelectedAddon = {
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  pricingMode: string;
};

// ─── Engine State ──────────────────────────────────────────

export type CommerceEngineState = {
  selection: AccommodationSelection | null;
  pricing: PricingSummary | null;
  pricingStatus: CommerceStatus;
  pricingError: CommerceError | null;
  selectedAddons: SelectedAddon[];
  checkoutSessionId: string | null;
  checkoutStatus: CommerceStatus;
  checkoutError: CommerceError | null;
};

// ─── Engine Actions ────────────────────────────────────────

export type CommerceEngineActions = {
  selectAccommodation: (selection: AccommodationSelection) => void;
  updateAddons: (addons: SelectedAddon[]) => void;
  fetchPricing: () => Promise<void>;
  initiateCheckout: () => Promise<{ token: string; redirect: string; hasAddons: boolean } | null>;
  reset: () => void;
};

// ─── Combined ──────────────────────────────────────────────

export type CommerceEngine = CommerceEngineState & CommerceEngineActions;

// ─── Server Action Result ──────────────────────────────────

export type FetchPricingResult =
  | { pricing: PricingSummary; error: null }
  | { pricing: null; error: CommerceError };
