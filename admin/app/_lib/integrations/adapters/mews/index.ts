/**
 * Mews PMS Adapter — Booking Engine
 *
 * Implementation of PmsAdapter for the Mews Connector API.
 * All Mews API calls are POST with auth tokens in the request body.
 *
 * Rate limit: 200 requests per AccessToken per 30 seconds.
 * Handled by database-backed rate limiter in MewsClient.
 *
 * TODO: Implement actual Mews API calls for availability, rates, etc.
 * Current implementation stubs all methods while preserving the
 * client/credentials/rate-limiting infrastructure.
 */

import type { PmsAdapter } from "../../adapter";
import { createHash } from "node:crypto";
import type {
  PmsProvider,
  AvailabilityParams,
  AvailabilityResult,
  AvailabilityEntry,
  RoomCategory,
  RatePlan,
  Restriction,
  BookingLookup,
  GuestData,
  Addon,
  PaymentStatus,
  CreateBookingParams,
  BookingConfirmation,
  ListBookingsParams,
  ListBookingsPage,
  ListBookingsBooking,
  PmsWebhookEvent,
  CancelBookingParams,
  CancelBookingResult,
  HoldParams,
  HoldResult,
} from "../../types";
import type { MewsCredentials } from "./credentials";
import { MewsClient } from "./client";
import { cancelBookingViaMews } from "./cancel";
import { log } from "@/app/_lib/logger";
import {
  MewsGetServicesResponseSchema,
  MewsGetResourceCategoriesResponseSchema,
  MewsGetFilesResponseSchema,
  MewsGetRatesResponseSchema,
  MewsGetRatePricingResponseSchema,
  MewsGetServiceAvailabilityResponseSchema,
  MewsGetCustomersResponseSchema,
  MewsCustomerAddResponseSchema,
  MewsGetAgeCategoriesResponseSchema,
  MewsReservationAddResponseSchema,
  MewsReservationUpdateResponseSchema,
  MewsGetResourceBlocksResponseSchema,
  MewsGetResourcesResponseSchema,
  MewsGetOrderItemsResponseSchema,
  MewsGetReservationsResponseSchema,
  MewsWebhookPayloadSchema,
} from "./mews-types";
import type {
  MewsResource,
  MewsResourceCategory,
  MewsGetServicesResponse,
  MewsGetResourceCategoriesResponse,
  MewsGetFilesResponse,
  MewsGetRatesResponse,
  MewsGetRatePricingResponse,
  MewsGetServiceAvailabilityResponse,
  MewsGetCustomersResponse,
  MewsCustomerAddResponse,
  MewsGetAgeCategoriesResponse,
  MewsReservationAddResponse,
  MewsReservationUpdateResponse,
  MewsGetResourceBlocksResponse,
  MewsGetResourcesResponse,
  MewsGetOrderItemsResponse,
  MewsGetReservationsResponse,
} from "./mews-types";

// ── Derived types ───────────────────────────────────────────

/** MewsResource with CategoryId resolved from ResourceCategoryAssignments. */
export type MewsResourceWithCategory = MewsResource & { CategoryId: string | null };

// ── Helpers ──────────────────────────────────────────────────

/** Extract the best localized string (sv → en → first available → "") */
function pickLocalized(map: Record<string, string> | null | undefined): string {
  if (!map) return "";
  return map["sv-SE"] ?? map["en-US"] ?? map["en-GB"] ?? Object.values(map)[0] ?? "";
}

/** Map Mews Classification string to our accommodation type */
function mapClassification(classification: string | null | undefined): string {
  switch (classification) {
    case "Apartment": return "APARTMENT";
    case "Suite": return "SUITE";
    case "Room":
    default:
      return "HOTEL";
  }
}

/** Convert a monetary amount (float in major units) to ören (integer) */
function toOren(value: number | null | undefined): number {
  if (value == null) return 0;
  return Math.round(value * 100);
}

/**
 * Map Mews reservation state → BookingLookup status. Used by
 * listBookings() to feed the reliability-engine ingest chokepoint.
 * The mapping is deliberately conservative: unknown/intermediate
 * states (Inquired, Optional, Requested) land as "confirmed" so the
 * platform-side ingest path applies them; if the PMS later transitions
 * them to Canceled, the version vector will surface the change.
 */
function mapMewsStateToIngestStatus(
  state: "Inquired" | "Confirmed" | "Started" | "Processed" | "Canceled" | "Optional" | "Requested",
): "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show" {
  switch (state) {
    case "Started":
      return "checked_in";
    case "Processed":
      return "checked_out";
    case "Canceled":
      return "cancelled";
    case "Confirmed":
    case "Inquired":
    case "Optional":
    case "Requested":
      return "confirmed";
  }
}

// Module-level caches keyed by accessToken — survives across adapter instances.
// accessToken is unique per tenant, so no cross-tenant leakage.
const serviceIdCache = new Map<string, string>();
const ageCategoryIdCache = new Map<string, string>();

export class MewsAdapter implements PmsAdapter {
  readonly provider: PmsProvider = "mews";
  private readonly client: MewsClient;
  private readonly cacheKey: string;

  constructor(credentials: MewsCredentials) {
    this.client = new MewsClient(credentials);
    this.cacheKey = credentials.accessToken;
  }

  // ── Internal: resolve Stay service ID (module-level cache) ──

  private async getStayServiceId(): Promise<string> {
    const cached = serviceIdCache.get(this.cacheKey);
    if (cached) return cached;

    const raw = await this.client.post<Record<string, unknown>, MewsGetServicesResponse>(
      "services/getAll",
      {},
    );
    const parsed = MewsGetServicesResponseSchema.parse(raw);

    const stayService = parsed.Services.find(
      (s) => s.IsActive && s.Type === "Reservable",
    );
    if (!stayService) {
      throw new Error("No active Reservable service found in Mews");
    }

    serviceIdCache.set(this.cacheKey, stayService.Id);
    return stayService.Id;
  }

  // ── Internal: resolve Adult age category ID (module-level cache)

  private async getAdultAgeCategoryId(): Promise<string> {
    const cached = ageCategoryIdCache.get(this.cacheKey);
    if (cached) return cached;

    const serviceId = await this.getStayServiceId();
    const raw = await this.client.post<Record<string, unknown>, MewsGetAgeCategoriesResponse>(
      "ageCategories/getAll",
      { ServiceIds: [serviceId] },
    );
    const parsed = MewsGetAgeCategoriesResponseSchema.parse(raw);

    const adult = parsed.AgeCategories.find(
      (ac) => ac.Classification === "Adult",
    );
    if (!adult) {
      throw new Error("No Adult age category found in Mews");
    }

    ageCategoryIdCache.set(this.cacheKey, adult.Id);
    return adult.Id;
  }

  // ── Internal: find or create Mews customer ─────────────────

  private async findOrCreateCustomer(guestInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
  }): Promise<string> {
    // Try to find existing customer by email
    const searchRaw = await this.client.post<Record<string, unknown>, MewsGetCustomersResponse>(
      "customers/getAll",
      { Emails: [guestInfo.email] },
    );
    const searchResult = MewsGetCustomersResponseSchema.parse(searchRaw);

    if (searchResult.Customers.length > 0) {
      return searchResult.Customers[0].Id;
    }

    // Create new customer
    const createRaw = await this.client.post<Record<string, unknown>, MewsCustomerAddResponse>(
      "customers/add",
      {
        FirstName: guestInfo.firstName,
        LastName: guestInfo.lastName,
        Email: guestInfo.email,
        Phone: guestInfo.phone ?? null,
      },
    );
    const created = MewsCustomerAddResponseSchema.parse(createRaw);
    return created.Id;
  }

  // ── Internal: fetch resource categories ─────────────────────

  private async fetchResourceCategories(): Promise<MewsResourceCategory[]> {
    const serviceId = await this.getStayServiceId();

    const raw = await this.client.post<Record<string, unknown>, MewsGetResourceCategoriesResponse>(
      "resourceCategories/getAll",
      { ServiceIds: [serviceId] },
    );
    const parsed = MewsGetResourceCategoriesResponseSchema.parse(raw);
    return parsed.ResourceCategories.filter((rc) => rc.IsActive !== false);
  }

  // ── Internal: fetch image URLs by IDs ───────────────────────

  private async fetchImageUrls(imageIds: string[]): Promise<Map<string, string>> {
    if (imageIds.length === 0) return new Map();

    const raw = await this.client.post<Record<string, unknown>, MewsGetFilesResponse>(
      "files/getAll",
      { FileIds: imageIds },
    );
    const parsed = MewsGetFilesResponseSchema.parse(raw);

    const map = new Map<string, string>();
    for (const file of parsed.Files) {
      map.set(file.Id, file.Url);
    }
    return map;
  }

  // ── 1. Availability + Rates ─────────────────────────────────

  async getAvailability(
    _tenantId: string,
    params: AvailabilityParams,
  ): Promise<AvailabilityResult> {
    const nights = Math.round(
      (params.checkOut.getTime() - params.checkIn.getTime()) / 86400000,
    );
    const serviceId = await this.getStayServiceId();

    // Phase 1: Fire categories, availability, and rates in parallel
    const [categories, availabilityRaw, ratesRaw] = await Promise.all([
      this.fetchResourceCategories(),
      this.client.post<Record<string, unknown>, MewsGetServiceAvailabilityResponse>(
        "services/getAvailability",
        {
          ServiceId: serviceId,
          StartUtc: params.checkIn.toISOString(),
          EndUtc: params.checkOut.toISOString(),
        },
      ),
      this.client.post<Record<string, unknown>, MewsGetRatesResponse>(
        "rates/getAll",
        { ServiceIds: [serviceId] },
      ),
    ]);

    const availability = MewsGetServiceAvailabilityResponseSchema.parse(availabilityRaw);
    const rates = MewsGetRatesResponseSchema.parse(ratesRaw);

    // Build a set of category IDs that are available for ALL nights
    const availableCategoryIds = new Set<string>();
    const categoryMinUnits = new Map<string, number>();

    for (const ca of availability.CategoryAvailabilities) {
      // Availabilities array has one entry per night in the range
      const allAvailable = ca.Availabilities.length > 0 &&
        ca.Availabilities.every((count) => count > 0);
      if (allAvailable) {
        availableCategoryIds.add(ca.CategoryId);
        categoryMinUnits.set(
          ca.CategoryId,
          Math.min(...ca.Availabilities),
        );
      }
    }

    // Filter to active, enabled, public rates
    const activeRates = rates.Rates.filter(
      (r) => r.IsActive && r.IsEnabled && r.IsPublic,
    );

    // Phase 2: Fetch date-accurate pricing and images in parallel.
    // rates/getPricing returns per-night prices per category per rate —
    // unlike BaseRatePricing.Amount which is a static rate-level default.
    const activeRateIds = activeRates.map((r) => r.Id);

    // Mews expects StartUtc/EndUtc with time components for pricing
    const pricingStartUtc = new Date(params.checkIn);
    pricingStartUtc.setUTCHours(15, 0, 0, 0);
    const pricingEndUtc = new Date(params.checkOut);
    pricingEndUtc.setUTCHours(11, 0, 0, 0);

    const allImageIds: string[] = [];
    for (const cat of categories) {
      if (availableCategoryIds.has(cat.Id) && cat.ImageIds) {
        allImageIds.push(...cat.ImageIds);
      }
    }

    // pricingMap: rateId → categoryId → { totalPrice, pricePerNight, currency }
    type CategoryPricing = { totalPrice: number; pricePerNight: number; currency: string };
    const pricingMap = new Map<string, Map<string, CategoryPricing>>();
    let usedDatePricing = false;

    const [imageUrlMap] = await Promise.all([
      this.fetchImageUrls(allImageIds),
      // Fetch date-accurate pricing; on failure, fall back to static pricing
      (async () => {
        if (activeRateIds.length === 0) return;
        try {
          const pricingRaw = await this.client.post<Record<string, unknown>, MewsGetRatePricingResponse>(
            "rates/getPricing",
            {
              RateIds: activeRateIds,
              StartUtc: pricingStartUtc.toISOString(),
              EndUtc: pricingEndUtc.toISOString(),
            },
          );
          const pricing = MewsGetRatePricingResponseSchema.parse(pricingRaw);

          for (const ratePricing of pricing.RatePrices) {
            const categoryMap = new Map<string, CategoryPricing>();
            for (const catPricing of ratePricing.ResourceCategoryPrices) {
              const validPrices = catPricing.Prices
                .map((p) => p.Value)
                .filter((v): v is number => v != null && v > 0);

              // Skip if we don't have a price for every night
              if (validPrices.length < nights) continue;

              const totalOren = toOren(validPrices.reduce((sum, v) => sum + v, 0));
              categoryMap.set(catPricing.ResourceCategoryId, {
                totalPrice: totalOren,
                pricePerNight: Math.round(totalOren / nights),
                currency: catPricing.Prices[0]?.Currency ?? "SEK",
              });
            }
            if (categoryMap.size > 0) {
              pricingMap.set(ratePricing.RateId, categoryMap);
            }
          }
          usedDatePricing = pricingMap.size > 0;
        } catch (err) {
          log("warn", "mews.rates_get_pricing_failed", {
            error: err instanceof Error ? err.message : String(err),
            rateCount: activeRateIds.length,
          });
          // pricingMap stays empty → fallback to static pricing below
        }
      })(),
    ]);

    // Fallback: static pricing from BaseRatePricing.Amount.GrossValue
    // Used when rates/getPricing fails or returns no data.
    const rateBasePrices = new Map<string, { grossPerNight: number; currency: string }>();
    if (!usedDatePricing) {
      for (const rate of activeRates) {
        const amount = rate.Pricing?.BaseRatePricing?.Amount;
        if (amount && amount.GrossValue > 0) {
          rateBasePrices.set(rate.Id, {
            grossPerNight: amount.GrossValue,
            currency: amount.Currency,
          });
        } else if (rate.BaseRateId) {
          const baseRate = activeRates.find((r) => r.Id === rate.BaseRateId);
          const baseAmount = baseRate?.Pricing?.BaseRatePricing?.Amount;
          if (baseAmount && baseAmount.GrossValue > 0) {
            rateBasePrices.set(rate.Id, {
              grossPerNight: baseAmount.GrossValue,
              currency: baseAmount.Currency,
            });
          }
        }
      }
    }

    // Build AvailabilityEntry per available category
    const entries: AvailabilityEntry[] = [];

    for (const cat of categories) {
      if (!availableCategoryIds.has(cat.Id)) continue;

      const imageUrls = (cat.ImageIds ?? [])
        .map((id) => imageUrlMap.get(id))
        .filter((url): url is string => url != null);

      const roomCategory: RoomCategory = {
        externalId: cat.Id,
        name: pickLocalized(cat.Names),
        shortDescription: pickLocalized(cat.ShortDescriptions),
        longDescription: pickLocalized(cat.Descriptions),
        type: mapClassification(cat.Classification),
        imageUrls,
        maxGuests: cat.Capacity ?? 2,
        facilities: [],
        basePricePerNight: 0,
      };

      // Build rate plans for this category
      const ratePlans: RatePlan[] = [];
      for (const rate of activeRates) {
        let pricePerNightOren: number;
        let totalOren: number;
        let currency: string;

        if (usedDatePricing) {
          // Date-accurate, category-specific pricing from rates/getPricing
          const catPricing = pricingMap.get(rate.Id)?.get(cat.Id);
          if (!catPricing) continue;
          pricePerNightOren = catPricing.pricePerNight;
          totalOren = catPricing.totalPrice;
          currency = catPricing.currency;
        } else {
          // Fallback: static per-rate pricing (same price for all categories)
          const basePrice = rateBasePrices.get(rate.Id);
          if (!basePrice) continue;
          pricePerNightOren = toOren(basePrice.grossPerNight);
          totalOren = pricePerNightOren * nights;
          currency = basePrice.currency;
        }

        ratePlans.push({
          externalId: rate.Id,
          name: pickLocalized(rate.Names) || "Standard",
          description: pickLocalized(rate.ShortDescriptions ?? rate.Description),
          cancellationPolicy: "FLEXIBLE",
          cancellationDescription: "",
          pricePerNight: pricePerNightOren,
          totalPrice: totalOren,
          currency,
          validFrom: null,
          validTo: null,
          includedAddons: [],
        });
      }

      if (ratePlans.length === 0) continue;

      const lowestTotalPrice = Math.min(...ratePlans.map((rp) => rp.totalPrice));
      roomCategory.basePricePerNight = Math.min(...ratePlans.map((rp) => rp.pricePerNight));

      entries.push({
        category: roomCategory,
        ratePlans,
        lowestTotalPrice,
        availableUnits: categoryMinUnits.get(cat.Id) ?? 0,
      });
    }

    return {
      categories: entries,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      nights,
      guests: params.guests,
      searchId: `mews_${Date.now()}`,
    };
  }

  // ── 2. Room Types ───────────────────────────────────────────

  async getRoomTypes(_tenantId: string): Promise<RoomCategory[]> {
    const categories = await this.fetchResourceCategories();

    // Collect all image IDs
    const allImageIds: string[] = [];
    for (const cat of categories) {
      if (cat.ImageIds) allImageIds.push(...cat.ImageIds);
    }
    const imageUrlMap = await this.fetchImageUrls(allImageIds);

    return categories.map((cat) => {
      const imageUrls = (cat.ImageIds ?? [])
        .map((id) => imageUrlMap.get(id))
        .filter((url): url is string => url != null);

      return {
        externalId: cat.Id,
        name: pickLocalized(cat.Names),
        shortDescription: pickLocalized(cat.ShortDescriptions),
        longDescription: pickLocalized(cat.Descriptions),
        type: mapClassification(cat.Classification),
        imageUrls,
        maxGuests: cat.Capacity ?? 2,
        facilities: [],
        basePricePerNight: 0,
      };
    });
  }

  // ── Resources (physical units) ──────────────────────────────

  async getResources(_tenantId: string): Promise<MewsResourceWithCategory[]> {
    const serviceId = await this.getStayServiceId();

    const raw = await this.client.post<Record<string, unknown>, MewsGetResourcesResponse>(
      "resources/getAll",
      {
        ServiceIds: [serviceId],
        Extent: { Resources: true, ResourceCategoryAssignments: true },
      },
    );
    const parsed = MewsGetResourcesResponseSchema.parse(raw);

    // Build ResourceId → CategoryId map from assignments
    const resourceToCategory = new Map<string, string>();
    for (const assignment of parsed.ResourceCategoryAssignments ?? []) {
      if (assignment.IsActive !== false) {
        resourceToCategory.set(assignment.ResourceId, assignment.CategoryId);
      }
    }

    // Join CategoryId onto each Resource
    return parsed.Resources.map((r) => ({
      ...r,
      CategoryId: resourceToCategory.get(r.Id) ?? null,
    }));
  }

  // ── Unit-Level Availability ─────────────────────────────────

  async getUnitAvailability(
    tenantId: string,
    externalIds: string[],
    checkIn: Date,
    checkOut: Date,
  ): Promise<Map<string, boolean>> {
    if (externalIds.length === 0) {
      return new Map();
    }

    try {
      const serviceId = await this.getStayServiceId();

      // Fetch resource blocks AND reservations in parallel
      const [blocksSettled, reservationsSettled] = await Promise.allSettled([
        this.client.post<Record<string, unknown>, MewsGetResourceBlocksResponse>(
          "resourceBlocks/getAll",
          {
            ServiceIds: [serviceId],
            TimeFilter: "Colliding",
            StartUtc: checkIn.toISOString(),
            EndUtc: checkOut.toISOString(),
            ActivityStates: ["Active"],
          },
        ),
        this.client.post<Record<string, unknown>, MewsGetReservationsResponse>(
          "reservations/getAll/2023-06-06",
          {
            ServiceIds: [serviceId],
            CollidingUtc: {
              StartUtc: checkIn.toISOString(),
              EndUtc: checkOut.toISOString(),
            },
            States: ["Confirmed", "Started", "Optional", "Requested"],
            Limitation: { Count: 1000 },
          },
        ),
      ]);

      const blockedResourceIds = new Set<string>();
      const searchStart = checkIn.getTime();
      const searchEnd = checkOut.getTime();

      // Process resource blocks (out-of-order periods)
      if (blocksSettled.status === "fulfilled") {
        const blocks = MewsGetResourceBlocksResponseSchema.parse(blocksSettled.value);
        for (const block of blocks.ResourceBlocks) {
          const blockStart = new Date(block.StartUtc).getTime();
          const blockEnd = new Date(block.EndUtc).getTime();
          if (searchStart < blockEnd && searchEnd > blockStart) {
            blockedResourceIds.add(block.ResourceId);
          }
        }
      } else {
        log("warn", "mews.unit_availability.blocks_failed", {
          error: blocksSettled.reason instanceof Error ? blocksSettled.reason.message : String(blocksSettled.reason),
        });
      }

      // Process reservations (existing bookings assigned to a resource)
      if (reservationsSettled.status === "fulfilled") {
        const reservations = MewsGetReservationsResponseSchema.parse(reservationsSettled.value);
        for (const reservation of reservations.Reservations) {
          if (reservation.AssignedResourceId) {
            blockedResourceIds.add(reservation.AssignedResourceId);
          }
        }
      } else {
        log("warn", "mews.unit_availability.reservations_failed", {
          error: reservationsSettled.reason instanceof Error ? reservationsSettled.reason.message : String(reservationsSettled.reason),
        });
      }

      // Map requested externalIds to availability
      const result = new Map<string, boolean>();
      for (const id of externalIds) {
        result.set(id, !blockedResourceIds.has(id));
      }
      return result;
    } catch (err) {
      // Fail closed — never show unavailable unit as available
      log("warn", "mews.get_unit_availability_total_failure", {
        tenantId,
        externalIdCount: externalIds.length,
        error: err instanceof Error ? err.message : String(err),
      });
      const result = new Map<string, boolean>();
      for (const id of externalIds) {
        result.set(id, false);
      }
      return result;
    }
  }

  // ── 3. Restrictions ─────────────────────────────────────────

  async getRestrictions(
    _tenantId: string,
    _from: Date,
    _to: Date,
    _categoryExternalId?: string,
  ): Promise<Restriction[]> {
    // TODO: Call Mews restrictions/getAll → map to Restriction[]
    return [];
  }

  // ── 4. Booking Lookup ───────────────────────────────────────
  //
  // Single-reservation fetch used by the reliability engine's webhook
  // path. Given an externalId (Mews Reservation.Id), return the
  // normalized BookingLookup — including providerUpdatedAt, which is
  // the version vector for stale-event rejection.
  //
  // Implementation: `reservations/getAll/2023-06-06` with ReservationIds
  // filter (fetches exactly one), followed by a batched customers/getAll
  // call for the linked customer. Both calls go through MewsClient so
  // they respect the rate limiter and Sentry context. Missing booking
  // (deleted, wrong enterprise, etc.) returns null.

  async lookupBooking(
    tenantId: string,
    reference: string,
  ): Promise<BookingLookup | null> {
    const serviceId = await this.getStayServiceId();

    let reservationsRaw: MewsGetReservationsResponse;
    try {
      reservationsRaw = await this.client.post<
        Record<string, unknown>,
        MewsGetReservationsResponse
      >("reservations/getAll/2023-06-06", {
        ServiceIds: [serviceId],
        ReservationIds: [reference],
        Limitation: { Count: 1 },
      });
    } catch (err) {
      log("warn", "mews.lookup_booking.reservations_failed", {
        tenantId,
        reservationId: reference,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err; // caller decides: webhook route logs & retries, cron records BookingSyncError
    }

    const parsed = MewsGetReservationsResponseSchema.parse(reservationsRaw);
    const reservation = parsed.Reservations[0];
    if (!reservation) return null;

    // Guest info — Mews reservation only carries AccountId.
    // customers/getAll is batchable, and Mews returns a customer
    // object with name/email/phone.
    let customer: { firstName: string; lastName: string; email: string; phone: string | null } | null = null;
    if (reservation.AccountType === "Customer" && reservation.AccountId) {
      try {
        const customersRaw = await this.client.post<
          Record<string, unknown>,
          MewsGetCustomersResponse
        >("customers/getAll", {
          CustomerIds: [reservation.AccountId],
          Limitation: { Count: 1 },
        });
        const c = MewsGetCustomersResponseSchema.parse(customersRaw).Customers[0];
        if (c) {
          customer = {
            firstName: c.FirstName ?? "",
            lastName: c.LastName ?? "",
            email: c.Email ?? "",
            phone: c.Phone ?? null,
          };
        }
      } catch (err) {
        // Non-fatal: fall through with empty guest fields. The
        // ingest chokepoint's Zod validation will reject if email
        // is empty, and the caller records a BookingSyncError row
        // that retries next cycle — data loss impossible.
        log("warn", "mews.lookup_booking.customer_failed", {
          tenantId,
          reservationId: reference,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const startUtc = reservation.ScheduledStartUtc ?? reservation.StartUtc;
    const endUtc = reservation.ScheduledEndUtc ?? reservation.EndUtc;
    if (!startUtc || !endUtc) {
      // Reservation without stay dates is unusable. Treat as "not
      // found" — reconciliation will pick up a better snapshot later
      // if Mews eventually populates these fields.
      log("warn", "mews.lookup_booking.missing_dates", {
        tenantId,
        reservationId: reference,
      });
      return null;
    }

    return {
      externalId: reservation.Id,
      guestName: customer
        ? `${customer.firstName} ${customer.lastName}`.trim()
        : "",
      guestEmail: customer?.email ?? "",
      guestPhone: customer?.phone ?? null,
      categoryName: "", // category metadata comes from getRoomTypes cache if needed
      checkIn: new Date(startUtc),
      checkOut: new Date(endUtc),
      guests:
        reservation.PersonCounts?.reduce((sum, pc) => sum + pc.Count, 0) ?? 1,
      status: mapMewsStateToIngestStatus(reservation.State),
      totalAmount: 0, // enrichment deferred; not needed by reliability engine
      currency: "SEK",
      ratePlanName: null,
      createdAt: new Date(reservation.CreatedUtc),
      providerUpdatedAt: new Date(reservation.UpdatedUtc),
    };
  }

  // ── 5. Guest Data ───────────────────────────────────────────

  async getGuest(
    _tenantId: string,
    _bookingExternalId: string,
  ): Promise<GuestData | null> {
    // TODO: Call Mews customers/getAll with reservation CustomerId
    return null;
  }

  // ── 12. Availability Hold ──────────────────────────────────
  //
  // Mews supports "Optional" reservations — soft holds that auto-
  // release after `ReleasedUtc`. We create one here, let Mews enforce
  // the TTL, and promote it to "Confirmed" on payment success via
  // reservations/update.

  async holdAvailability(
    tenantId: string,
    params: HoldParams,
  ): Promise<HoldResult | null> {
    const [serviceId, adultAgeCategoryId, customerId] = await Promise.all([
      this.getStayServiceId(),
      this.getAdultAgeCategoryId(),
      this.findOrCreateCustomer(params.guestInfo),
    ]);

    const expiresAt = new Date(Date.now() + params.holdDurationMs);

    const raw = await this.client.post<
      Record<string, unknown>,
      MewsReservationAddResponse
    >("reservations/add", {
      ServiceId: serviceId,
      Reservations: [
        {
          State: "Optional",
          // Mews auto-releases an Optional reservation at ReleasedUtc
          // — this is the PMS-side TTL. We also run a local cron as
          // a safety net in case this field is ignored or interpreted
          // differently by a future Mews API version.
          ReleasedUtc: expiresAt.toISOString(),
          RateId: params.ratePlanId,
          RequestedCategoryId: params.categoryId,
          StartUtc: `${params.checkIn}T15:00:00Z`,
          EndUtc: `${params.checkOut}T11:00:00Z`,
          PersonCounts: [
            { AgeCategoryId: adultAgeCategoryId, Count: params.guests },
          ],
          CustomerId: customerId,
        },
      ],
    });
    const parsed = MewsReservationAddResponseSchema.parse(raw);
    if (parsed.Reservations.length === 0) {
      throw new Error(
        "Mews returned no reservations from reservations/add (hold)",
      );
    }
    const reservation = parsed.Reservations[0].Reservation;
    log("info", "mews.hold.created", {
      tenantId,
      externalId: reservation.Id,
      expiresAt: expiresAt.toISOString(),
    });
    return { externalId: reservation.Id, expiresAt };
  }

  async confirmHold(
    tenantId: string,
    holdExternalId: string,
  ): Promise<string> {
    // Idempotency: Mews reservations/update to State=Confirmed is
    // a no-op if already Confirmed. A separate ReleasedUtc=null
    // clears the TTL so it doesn't auto-release post-confirmation.
    await this.client.post<Record<string, unknown>, MewsReservationUpdateResponse>(
      "reservations/update",
      {
        ReservationUpdates: [
          {
            ReservationId: holdExternalId,
            State: { Value: "Confirmed" },
            ReleasedUtc: { Value: null },
          },
        ],
      },
    );
    log("info", "mews.hold.confirmed", { tenantId, externalId: holdExternalId });
    return holdExternalId;
  }

  async releaseHold(
    tenantId: string,
    holdExternalId: string,
  ): Promise<void> {
    // Transition Optional → Canceled. Mews treats a cancel of an
    // already-canceled reservation as a no-op, so this is idempotent
    // for our purposes. An already-Confirmed reservation would also
    // be canceled here — which is correct for the release-expired
    // use case (confirmHold runs first on payment; if we reach the
    // release path, the order is being rolled back anyway).
    await this.client.post<Record<string, unknown>, MewsReservationUpdateResponse>(
      "reservations/update",
      {
        ReservationUpdates: [
          {
            ReservationId: holdExternalId,
            State: { Value: "Canceled" },
          },
        ],
      },
    );
    log("info", "mews.hold.released", { tenantId, externalId: holdExternalId });
  }

  // ── 6. Add-ons ──────────────────────────────────────────────

  async getAddons(
    _tenantId: string,
    _categoryExternalId?: string,
  ): Promise<Addon[]> {
    // TODO: Call Mews products/getAll → map to Addon[]
    return [];
  }

  // ── 7. Payment Status ───────────────────────────────────────

  async getPaymentStatus(
    _tenantId: string,
    _bookingExternalId: string,
  ): Promise<PaymentStatus | null> {
    // TODO: Call Mews bills/getAll for the reservation
    return null;
  }

  // ── 9. Create Booking ──────────────────────────────────────

  async createBooking(
    _tenantId: string,
    params: CreateBookingParams,
  ): Promise<BookingConfirmation> {
    const [serviceId, adultAgeCategoryId, customerId] = await Promise.all([
      this.getStayServiceId(),
      this.getAdultAgeCategoryId(),
      this.findOrCreateCustomer(params.guestInfo),
    ]);

    // Calculate nights for total amount
    const checkInDate = new Date(params.checkIn);
    const checkOutDate = new Date(params.checkOut);
    const nights = Math.round(
      (checkOutDate.getTime() - checkInDate.getTime()) / 86400000,
    );

    // Step 1: Create reservation (category-level — Mews auto-assigns a resource)
    const reservationRaw = await this.client.post<Record<string, unknown>, MewsReservationAddResponse>(
      "reservations/add",
      {
        ServiceId: serviceId,
        Reservations: [
          {
            RateId: params.ratePlanId,
            RequestedCategoryId: params.categoryId,
            StartUtc: `${params.checkIn}T15:00:00Z`,
            EndUtc: `${params.checkOut}T11:00:00Z`,
            PersonCounts: [
              { AgeCategoryId: adultAgeCategoryId, Count: params.guests },
            ],
            CustomerId: customerId,
          },
        ],
      },
    );
    const reservationResult = MewsReservationAddResponseSchema.parse(reservationRaw);

    if (reservationResult.Reservations.length === 0) {
      throw new Error("Mews returned no reservations from reservations/add");
    }

    const reservation = reservationResult.Reservations[0].Reservation;

    // Step 2: Pin to specific physical unit via reservations/update (if requested)
    // Mews requires three sequential calls — AssignedResourceId and
    // AssignedResourceLocked cannot be sent in the same request.
    //   Call 1: Unlock the auto-assigned resource
    //   Call 2: Assign the requested resource (unlocked)
    //   Call 3: Lock the assignment
    // Each call is non-fatal — if any fails, the booking keeps whatever
    // Mews auto-assigned and we proceed normally.
    if (params.requestedResourceId) {
      const resId = reservation.Id;
      const targetResourceId = params.requestedResourceId;

      try {
        // Call 1: Unlock
        await this.client.post<Record<string, unknown>, MewsReservationUpdateResponse>(
          "reservations/update",
          { ReservationUpdates: [{ ReservationId: resId, AssignedResourceLocked: { Value: false } }] },
        );

        // Call 2: Assign
        await this.client.post<Record<string, unknown>, MewsReservationUpdateResponse>(
          "reservations/update",
          { ReservationUpdates: [{ ReservationId: resId, AssignedResourceId: { Value: targetResourceId } }] },
        );

        // Call 3: Lock
        await this.client.post<Record<string, unknown>, MewsReservationUpdateResponse>(
          "reservations/update",
          { ReservationUpdates: [{ ReservationId: resId, AssignedResourceLocked: { Value: true } }] },
        );
      } catch {
        // Non-fatal: booking exists in Mews, only the unit pin failed.
      }
    }

    // Step 3: Attach add-on line items as arbitrary order items via orders/add.
    // Uses the Mews "Items" array (custom name + amount, no ProductId needed).
    // Non-blocking: failure here must never roll back the reservation.
    if (params.addonLineItems && params.addonLineItems.length > 0) {
      try {
        await this.client.post<Record<string, unknown>, { OrderId: string }>(
          "orders/add",
          {
            ServiceId: serviceId,
            AccountId: customerId,
            LinkedReservationId: reservation.Id,
            Items: params.addonLineItems.map((addon) => ({
              Name: addon.title,
              UnitCount: addon.quantity,
              UnitAmount: {
                Currency: addon.currency,
                GrossValue: addon.totalAmount / 100, // öre → decimal
              },
            })),
          },
        );

        log("info", "mews.addons_attached", {
          reservationId: reservation.Id,
          addonCount: params.addonLineItems.length,
          titles: params.addonLineItems.map((a) => a.title).join(", "),
        });
      } catch (err) {
        log("error", "mews.addons_attach_failed", {
          reservationId: reservation.Id,
          addonCount: params.addonLineItems.length,
          error: err instanceof Error ? err.message : String(err),
        });
        // Non-fatal: reservation is created, add-ons will be reconciled later
      }
    }

    // Step 4: Derive total amount from what Mews actually charged.
    // Primary: orderItems/getAll returns revenue items posted to the reservation.
    // Fallback: rates/getPricing for date-accurate per-night pricing.
    let totalAmountOren = 0;
    let currency = "SEK";

    try {
      const orderItemsRaw = await this.client.post<Record<string, unknown>, MewsGetOrderItemsResponse>(
        "orderItems/getAll",
        {
          ServiceOrderIds: [reservation.Id],
          Limitation: { Count: 1000 },
        },
      );
      const orderItems = MewsGetOrderItemsResponseSchema.parse(orderItemsRaw);

      // Sum GrossValue from all items belonging to this reservation
      let grossSum = 0;
      let foundCurrency = false;
      for (const item of orderItems.OrderItems) {
        if (item.ServiceOrderId !== reservation.Id) continue;
        const gross = item.Amount?.GrossValue;
        if (gross != null) {
          grossSum += gross;
          if (!foundCurrency && item.Amount?.Currency) {
            currency = item.Amount.Currency;
            foundCurrency = true;
          }
        }
      }

      if (grossSum > 0) {
        totalAmountOren = toOren(grossSum);
      }
    } catch (err) {
      log("warn", "mews.order_items_fetch_failed", {
        reservationId: reservation.Id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Fallback: rates/getPricing for date-accurate pricing
    if (totalAmountOren === 0) {
      try {
        const pricingStartUtc = new Date(checkInDate);
        pricingStartUtc.setUTCHours(15, 0, 0, 0);
        const pricingEndUtc = new Date(checkOutDate);
        pricingEndUtc.setUTCHours(11, 0, 0, 0);

        const pricingRaw = await this.client.post<Record<string, unknown>, MewsGetRatePricingResponse>(
          "rates/getPricing",
          {
            RateIds: [params.ratePlanId],
            StartUtc: pricingStartUtc.toISOString(),
            EndUtc: pricingEndUtc.toISOString(),
          },
        );
        const pricing = MewsGetRatePricingResponseSchema.parse(pricingRaw);

        const ratePricing = pricing.RatePrices.find((rp) => rp.RateId === params.ratePlanId);
        const catPricing = ratePricing?.ResourceCategoryPrices.find(
          (cp) => cp.ResourceCategoryId === params.categoryId,
        );

        if (catPricing && catPricing.Prices.length >= nights) {
          let grossSum = 0;
          let allValid = true;
          for (const p of catPricing.Prices) {
            if (p.Value != null && p.Value > 0) {
              grossSum += p.Value;
            } else {
              allValid = false;
              break;
            }
            if (!currency && p.Currency) currency = p.Currency;
          }
          if (allValid && grossSum > 0) {
            totalAmountOren = toOren(grossSum);
            currency = catPricing.Prices[0]?.Currency ?? currency;
          }
        }
      } catch (err) {
        log("warn", "mews.rates_get_pricing_fallback_failed", {
          reservationId: reservation.Id,
          ratePlanId: params.ratePlanId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      externalId: reservation.Id,
      confirmationNumber: reservation.Number ?? reservation.Id,
      status: "CONFIRMED",
      totalAmount: totalAmountOren,
      currency,
    };
  }

  // ── 11. List Bookings (reliability engine) ──────────────────
  //
  // Calls Mews reservations/getAll with UpdatedUtc filter — the only
  // reliable way to catch webhook misses. The sweep returns every
  // reservation the PMS updated within [from, to), across all
  // lifecycle states (Confirmed, Started, Processed, Canceled,
  // Optional, Requested). Guest data is enriched via a single batched
  // customers/getAll call per page, avoiding N+1.
  //
  // Pagination: Mews returns a Cursor string; we pass it back
  // verbatim on the next call. A null/absent Cursor ends the stream.

  async listBookings(
    tenantId: string,
    params: ListBookingsParams,
  ): Promise<ListBookingsPage> {
    const serviceId = await this.getStayServiceId();
    const pageLimit = Math.min(params.limit ?? 500, 1000); // Mews caps at 1000

    // Step 1: fetch the reservations page
    const reservationsRaw = await this.client.post<
      Record<string, unknown>,
      MewsGetReservationsResponse
    >("reservations/getAll/2023-06-06", {
      ServiceIds: [serviceId],
      UpdatedUtc: {
        StartUtc: params.from.toISOString(),
        EndUtc: params.to.toISOString(),
      },
      States: [
        "Confirmed",
        "Started",
        "Processed",
        "Canceled",
        "Optional",
        "Requested",
      ],
      Limitation: {
        Count: pageLimit,
        ...(params.cursor ? { Cursor: params.cursor } : {}),
      },
    });

    const reservationsResp = MewsGetReservationsResponseSchema.parse(reservationsRaw);
    const reservations = reservationsResp.Reservations;

    if (reservations.length === 0) {
      return { bookings: [], nextCursor: null };
    }

    // Step 2: batch-fetch the customers referenced by this page.
    // Without this, mapping reservation.AccountId → guest email would
    // require one call per reservation (200+ requests per page).
    const customerIds = Array.from(
      new Set(
        reservations
          .filter((r) => r.AccountType === "Customer" && r.AccountId)
          .map((r) => r.AccountId as string),
      ),
    );

    const customersById = new Map<string, {
      firstName: string;
      lastName: string;
      email: string;
      phone: string | null;
    }>();

    if (customerIds.length > 0) {
      try {
        const customersRaw = await this.client.post<
          Record<string, unknown>,
          MewsGetCustomersResponse
        >("customers/getAll", {
          CustomerIds: customerIds,
          Limitation: { Count: customerIds.length },
        });
        const parsed = MewsGetCustomersResponseSchema.parse(customersRaw);
        for (const c of parsed.Customers) {
          customersById.set(c.Id, {
            firstName: c.FirstName ?? "",
            lastName: c.LastName ?? "",
            email: c.Email ?? "",
            phone: c.Phone ?? null,
          });
        }
      } catch (err) {
        // Partial failure: we still return reservations with empty
        // guest data. The ingest chokepoint's Zod validation will
        // reject those (invalid email) and they surface as
        // BookingSyncError rows — NOT silent data loss.
        log("warn", "mews.list_bookings.customers_batch_failed", {
          tenantId,
          customerCount: customerIds.length,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Step 3: map Mews reservations → ListBookingsBooking
    const bookings: ListBookingsBooking[] = [];
    for (const r of reservations) {
      const customer = r.AccountId ? customersById.get(r.AccountId) : undefined;
      const startUtc = r.ScheduledStartUtc ?? r.StartUtc;
      const endUtc = r.ScheduledEndUtc ?? r.EndUtc;

      // A reservation without stay dates is malformed — skip and log.
      // Missing UpdatedUtc would also be fatal, but Mews guarantees it.
      if (!startUtc || !endUtc) {
        log("warn", "mews.list_bookings.reservation_missing_dates", {
          tenantId,
          reservationId: r.Id,
        });
        continue;
      }

      bookings.push({
        externalId: r.Id,
        guestName: customer
          ? `${customer.firstName} ${customer.lastName}`.trim()
          : "",
        guestEmail: customer?.email ?? "",
        guestPhone: customer?.phone ?? null,
        categoryName: "", // resolved downstream from category cache if needed
        checkIn: new Date(startUtc),
        checkOut: new Date(endUtc),
        guests:
          r.PersonCounts?.reduce((sum, pc) => sum + pc.Count, 0) ?? 1,
        status: mapMewsStateToIngestStatus(r.State),
        totalAmount: 0, // Not needed for reconciliation; enrich if required
        currency: "SEK",
        ratePlanName: null,
        createdAt: new Date(r.CreatedUtc),
        providerUpdatedAt: new Date(r.UpdatedUtc),
      });
    }

    return {
      bookings,
      nextCursor: reservationsResp.Cursor ?? null,
    };
  }

  // ── 8. Connection & Webhooks ────────────────────────────────

  async testConnection(
    credentials: Record<string, string>,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const { MewsCredentialsSchema } = await import("./credentials");
      const parsed = MewsCredentialsSchema.parse(credentials);
      const testClient = new MewsClient(parsed);
      // Hit a lightweight endpoint to verify credentials
      await testClient.post("configuration/get", {});
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, error: message };
    }
  }

  resolveWebhookTenant(payload: unknown): string | null {
    if (
      payload &&
      typeof payload === "object" &&
      "EnterpriseId" in payload &&
      typeof (payload as Record<string, unknown>).EnterpriseId === "string"
    ) {
      return (payload as Record<string, string>).EnterpriseId;
    }
    return null;
  }

  async verifyWebhookSignature(
    _rawBody: Buffer,
    headers: Record<string, string>,
    credentials: Record<string, string>,
  ): Promise<boolean> {
    // Mews uses a simple token-in-URL approach
    const token = headers["x-forwarded-token"] ?? "";
    return token === credentials.webhookToken;
  }

  // ── 12. Cancellation ────────────────────────────────────────

  async cancelBooking(
    tenantId: string,
    params: CancelBookingParams,
  ): Promise<CancelBookingResult> {
    return cancelBookingViaMews({
      client: this.client,
      tenantId,
      cancellation: params,
    });
  }

  parseWebhookEvents(
    rawBody: Buffer,
    parsedPayload: unknown,
  ): PmsWebhookEvent[] | null {
    // Validate structure. Zod rejects anything that isn't the
    // documented Mews webhook shape — we return null and the route
    // responds 400. Invalid payloads never reach the inbox.
    const parsed = MewsWebhookPayloadSchema.safeParse(parsedPayload);
    if (!parsed.success) return null;

    const { EnterpriseId, Events } = parsed.data;

    // Mews webhooks carry no native event ID — the payload only has
    // a list of (Discriminator, Value.Id). To make the inbox dedup
    // key stable across retry deliveries of the SAME event, we hash
    // the full raw body. A re-delivery of the same event has
    // byte-identical body → same hash → same dedup key → deflected.
    // A *different* state change to the same reservation produces a
    // distinct body → distinct hash → processed normally.
    const bodyHash = createHash("sha256").update(rawBody).digest("hex");

    return Events.map((event, index) => ({
      externalEventId: `${EnterpriseId}:${bodyHash.slice(0, 16)}:${index}`,
      externalBookingId:
        event.Discriminator === "Reservation" ? event.Value.Id : null,
      eventType: event.Discriminator,
    }));
  }
}

// ── Type guard ──────────────────────────────────────────────

/** Check if an adapter is a MewsAdapter (has getResources method for unit sync). */
export function isMewsAdapter(adapter: PmsAdapter): adapter is MewsAdapter {
  return "getResources" in adapter && typeof (adapter as Record<string, unknown>).getResources === "function";
}
