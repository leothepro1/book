"use server";

/**
 * Server Action: fetchPricing
 * ═══════════════════════════
 *
 * Wraps resolveAccommodationPrice() for client consumption.
 * Returns a PricingSummary or a CommerceError — never throws.
 *
 * Pricing is always computed server-side. The client hook
 * calls this action and displays the result. No arithmetic
 * happens in the browser.
 */

import { resolveAccommodationPrice } from "@/app/_lib/accommodations/pricing";
import type { AccommodationPriceError } from "@/app/_lib/accommodations/pricing";
import { log } from "@/app/_lib/logger";
import type {
  AccommodationSelection,
  SelectedAddon,
  PricingSummary,
  PricingLineItem,
  CommerceError,
  FetchPricingResult,
} from "../types";

// ─── Constants ────────────────────────────────────────────

const PMS_TIMEOUT_MS = 8_000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Error Mapping ────────────────────────────────────────

const PMS_ERROR_MAP: Record<string, CommerceError> = {
  ACCOMMODATION_NOT_FOUND: {
    code: "NOT_AVAILABLE",
    message: "Boendet kunde inte hittas.",
  },
  PMS_UNAVAILABLE: {
    code: "PRICING_FAILED",
    message: "Prissystemet är tillfälligt otillgängligt. Försök igen.",
  },
  CATEGORY_NOT_AVAILABLE: {
    code: "NOT_AVAILABLE",
    message: "Boendet är inte tillgängligt för valda datum.",
  },
  RATE_PLAN_NOT_FOUND: {
    code: "RATE_PLAN_NOT_FOUND",
    message: "Det valda prisalternativet är inte längre tillgängligt.",
  },
  INVALID_DATES: {
    code: "INVALID_PARAMS",
    message: "Ogiltiga datum. Kontrollera in- och utcheckningsdatum.",
  },
};

// ─── Validation ────────────────────────────────────────────

function validateSelection(
  selection: AccommodationSelection,
  tenantId: string,
): CommerceError | null {
  if (!tenantId) {
    return { code: "INVALID_PARAMS", message: "Tenant saknas." };
  }
  if (!selection.accommodationId) {
    return { code: "INVALID_PARAMS", message: "Boende saknas." };
  }
  if (!selection.ratePlanId) {
    return { code: "INVALID_PARAMS", message: "Prisalternativ saknas." };
  }
  if (!selection.checkIn || !ISO_DATE.test(selection.checkIn)) {
    return { code: "INVALID_PARAMS", message: "Ogiltigt incheckningsdatum." };
  }
  if (!selection.checkOut || !ISO_DATE.test(selection.checkOut)) {
    return { code: "INVALID_PARAMS", message: "Ogiltigt utcheckningsdatum." };
  }
  if (selection.checkIn >= selection.checkOut) {
    return { code: "INVALID_PARAMS", message: "Utcheckning måste vara efter incheckning." };
  }
  if (!Number.isInteger(selection.adults) || selection.adults < 1) {
    return { code: "INVALID_PARAMS", message: "Minst en vuxen krävs." };
  }
  if (!Number.isInteger(selection.children) || selection.children < 0) {
    return { code: "INVALID_PARAMS", message: "Ogiltigt antal barn." };
  }
  return null;
}

// ─── Build Summary ─────────────────────────────────────────

function buildPricingSummary(
  result: Awaited<ReturnType<typeof resolveAccommodationPrice>>,
  addons: SelectedAddon[],
): PricingSummary | null {
  const baseTotal = result.totalPrice;

  // Sum addon totals — values are ören integers from server-side resolution.
  // Non-authoritative preview; checkout route re-validates all addon prices.
  let addonsTotal = 0;
  for (const addon of addons) {
    addonsTotal += addon.totalPrice;
  }

  // ── Build typed line items ──

  const lineItems: PricingLineItem[] = [];

  // 1. Accommodation line item — always present
  const accommodationLine: PricingLineItem = {
    type: "accommodation",
    label: result.ratePlan.name,
    amount: result.pricePerNight * result.nights,
    nights: result.nights,
    perNight: result.pricePerNight,
  };
  lineItems.push(accommodationLine);

  // 2. Package items — included addons from the rate plan (display only)
  for (const included of result.ratePlan.includedAddons) {
    lineItems.push({
      type: "package_item",
      label: included.name,
      amount: 0,
      isIncluded: true,
    });
  }

  // 3. Addon line items (future phase — skip for now)
  for (const addon of addons) {
    lineItems.push({
      type: "addon",
      label: `${addon.productId}`,
      amount: addon.totalPrice,
      quantity: addon.quantity,
    });
  }

  // ── Verify: accommodation line item must equal baseTotal ──
  // Only check accommodation (not addons — those are a separate total)
  const accommodationSum = lineItems
    .filter((li) => li.type === "accommodation")
    .reduce((sum, li) => sum + li.amount, 0);

  if (accommodationSum !== baseTotal) {
    log("error", "commerce.pricing_line_item_mismatch", {
      accommodationSum,
      baseTotal,
      nights: result.nights,
      pricePerNight: result.pricePerNight,
      ratePlan: result.ratePlan.name,
    });
    // This is a bug — nights × perNight should always equal baseTotal.
    // Return error instead of serving inconsistent data.
    return null;
  }

  return {
    baseTotal,
    addonsTotal,
    discountAmount: 0,
    total: baseTotal + addonsTotal,
    currency: result.currency,
    nights: result.nights,
    lineItems,
    ratePlanName: result.ratePlan.name,
    pricePerNight: result.pricePerNight,
    isFrozen: false,
  };
}

// ─── Server Action ─────────────────────────────────────────

export async function fetchPricingAction(
  tenantId: string,
  selection: AccommodationSelection,
  addons: SelectedAddon[],
): Promise<FetchPricingResult> {
  const start = Date.now();

  // ── Validate ──
  const validationError = validateSelection(selection, tenantId);
  if (validationError) {
    log("warn", "commerce.pricing_validation_failed", {
      tenantId,
      accommodationId: selection.accommodationId,
      code: validationError.code,
    });
    return { pricing: null, error: validationError };
  }

  // ── Fetch with timeout ──
  try {
    const pmsPromise = resolveAccommodationPrice({
      tenantId,
      accommodationId: selection.accommodationId,
      ratePlanId: selection.ratePlanId,
      checkIn: new Date(selection.checkIn),
      checkOut: new Date(selection.checkOut),
      guests: selection.adults + selection.children,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("PMS_TIMEOUT")),
        PMS_TIMEOUT_MS,
      );
    });

    const result = await Promise.race([pmsPromise, timeoutPromise]);
    const duration = Date.now() - start;

    const pricing = buildPricingSummary(result, addons);

    if (!pricing) {
      return {
        pricing: null,
        error: {
          code: "PRICING_FAILED",
          message: "Prisberäkningen misslyckades. Försök igen.",
        },
      };
    }

    log("info", "commerce.pricing_resolved", {
      tenantId,
      accommodationId: selection.accommodationId,
      ratePlanId: selection.ratePlanId,
      baseTotal: pricing.baseTotal,
      addonsTotal: pricing.addonsTotal,
      total: pricing.total,
      currency: pricing.currency,
      nights: pricing.nights,
      addonCount: addons.length,
      duration,
    });

    return { pricing, error: null };
  } catch (err: unknown) {
    const duration = Date.now() - start;

    // Timeout
    if (err instanceof Error && err.message === "PMS_TIMEOUT") {
      log("error", "commerce.pricing_timeout", {
        tenantId,
        accommodationId: selection.accommodationId,
        duration,
      });
      return {
        pricing: null,
        error: {
          code: "PMS_TIMEOUT",
          message: "Prissystemet svarade inte i tid. Försök igen.",
        },
      };
    }

    // AccommodationPriceError (typed PMS errors)
    const pmsErr = err as AccommodationPriceError;
    if (pmsErr.code && PMS_ERROR_MAP[pmsErr.code]) {
      log("error", "commerce.pricing_pms_error", {
        tenantId,
        accommodationId: selection.accommodationId,
        code: pmsErr.code,
        duration,
      });
      return { pricing: null, error: PMS_ERROR_MAP[pmsErr.code] };
    }

    // Unknown error
    log("error", "commerce.pricing_unknown_error", {
      tenantId,
      accommodationId: selection.accommodationId,
      error: err instanceof Error ? err.message : "Unknown",
      duration,
    });
    return {
      pricing: null,
      error: {
        code: "PRICING_FAILED",
        message: "Kunde inte hämta pris. Försök igen.",
      },
    };
  }
}
