/**
 * Accommodation Price Resolution — Single Source of Truth
 * ════════════════════════════════════════════════════════
 *
 * resolveAccommodationPrice() is the ONLY function that calls
 * adapter.getAvailability() for pricing/checkout purposes.
 *
 * All checkout flows must call this — never duplicate the adapter call.
 *
 * The availability search route (/api/availability) calls the adapter
 * separately for display — that is a different concern.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { log } from "@/app/_lib/logger";
import type { RatePlan } from "@/app/_lib/integrations/types";

// ── Types ──────────────────────────────────────────────────────

export type AccommodationPriceParams = {
  tenantId: string;
  accommodationId: string; // Accommodation.id (primary key)
  ratePlanId?: string | null; // optional — if provided, must match this rate plan's externalId
  checkIn: Date;
  checkOut: Date;
  guests: number;
};

export type AccommodationPriceResult = {
  ratePlan: RatePlan;
  pricePerNight: number; // ören
  totalPrice: number; // ören
  nights: number;
  currency: string;
  accommodationId: string;
  externalId: string; // PMS category externalId — needed for createBooking()
};

export class AccommodationPriceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "ACCOMMODATION_NOT_FOUND"
      | "PMS_UNAVAILABLE"
      | "CATEGORY_NOT_AVAILABLE"
      | "RATE_PLAN_NOT_FOUND"
      | "INVALID_DATES",
  ) {
    super(message);
    this.name = "AccommodationPriceError";
  }
}

// ── Main function ──────────────────────────────────────────────

/**
 * resolveAccommodationPrice — the single source of truth for accommodation pricing.
 *
 * Throws AccommodationPriceError for all known failure modes.
 */
export async function resolveAccommodationPrice(
  params: AccommodationPriceParams,
): Promise<AccommodationPriceResult> {
  const { tenantId, accommodationId, ratePlanId, checkIn, checkOut, guests } = params;

  // 1. Validate dates
  const nights = Math.round(
    (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (nights < 1) {
    throw new AccommodationPriceError(
      "checkOut must be after checkIn",
      "INVALID_DATES",
    );
  }

  // 2. Load Accommodation to get externalId
  const accommodation = await prisma.accommodation.findFirst({
    where: { id: accommodationId, tenantId, archivedAt: null },
    select: { id: true, externalId: true, pmsProvider: true, basePricePerNight: true, currency: true },
  });

  if (!accommodation) {
    throw new AccommodationPriceError(
      `Accommodation ${accommodationId} not found for tenant ${tenantId}`,
      "ACCOMMODATION_NOT_FOUND",
    );
  }

  if (!accommodation.externalId) {
    throw new AccommodationPriceError(
      `Accommodation ${accommodationId} has no PMS externalId — manual pricing not yet supported`,
      "PMS_UNAVAILABLE",
    );
  }

  // 3. Call PMS adapter for live pricing
  const adapter = await resolveAdapter(tenantId);
  let availabilityResult;

  try {
    availabilityResult = await adapter.getAvailability(tenantId, {
      checkIn,
      checkOut,
      guests,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "accommodation_pricing.get_availability_failed", {
      tenantId,
      accommodationId,
      error: msg,
    });
    throw new AccommodationPriceError(
      `PMS unavailable: ${msg}`,
      "PMS_UNAVAILABLE",
    );
  }

  // 4. Find the matching category
  const entry = availabilityResult.categories.find(
    (e) => e.category.externalId === accommodation.externalId,
  );

  if (!entry || entry.availableUnits <= 0 || entry.ratePlans.length === 0) {
    throw new AccommodationPriceError(
      `Accommodation ${accommodationId} (externalId: ${accommodation.externalId}) not available for the requested dates`,
      "CATEGORY_NOT_AVAILABLE",
    );
  }

  // 5. Select rate plan
  let selectedRatePlan: RatePlan;

  if (ratePlanId) {
    const found = entry.ratePlans.find((r) => r.externalId === ratePlanId);
    if (!found) {
      throw new AccommodationPriceError(
        `Rate plan ${ratePlanId} not found or not available`,
        "RATE_PLAN_NOT_FOUND",
      );
    }
    selectedRatePlan = found;
  } else {
    // Default: first rate plan (adapter returns them sorted)
    selectedRatePlan = entry.ratePlans[0]!;
  }

  // 6. Return prices — adapter already returns ören
  // (FakeAdapter: basePricePerNight=149900 = 1499kr, totalPrice=149900*nights)
  return {
    ratePlan: selectedRatePlan,
    pricePerNight: selectedRatePlan.pricePerNight,
    totalPrice: selectedRatePlan.totalPrice,
    nights,
    currency: selectedRatePlan.currency,
    accommodationId: accommodation.id,
    externalId: accommodation.externalId,
  };
}
