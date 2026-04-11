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
} from "../../types";
import type { MewsCredentials } from "./credentials";
import { MewsClient } from "./client";
import {
  MewsGetServicesResponseSchema,
  MewsGetResourceCategoriesResponseSchema,
  MewsGetFilesResponseSchema,
  MewsGetRatesResponseSchema,
  MewsGetServiceAvailabilityResponseSchema,
  MewsGetCustomersResponseSchema,
  MewsCustomerAddResponseSchema,
  MewsGetAgeCategoriesResponseSchema,
  MewsReservationAddResponseSchema,
  MewsReservationUpdateResponseSchema,
  MewsGetResourceBlocksResponseSchema,
  MewsGetResourcesResponseSchema,
} from "./mews-types";
import type {
  MewsResource,
  MewsResourceCategory,
  MewsGetServicesResponse,
  MewsGetResourceCategoriesResponse,
  MewsGetFilesResponse,
  MewsGetRatesResponse,
  MewsGetServiceAvailabilityResponse,
  MewsGetCustomersResponse,
  MewsCustomerAddResponse,
  MewsGetAgeCategoriesResponse,
  MewsReservationAddResponse,
  MewsReservationUpdateResponse,
  MewsGetResourceBlocksResponse,
  MewsGetResourcesResponse,
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

    // Fire all three API calls in parallel
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

    // Filter to active, enabled, public rates with inline pricing
    const activeRates = rates.Rates.filter(
      (r) => r.IsActive && r.IsEnabled && r.IsPublic,
    );

    // Extract per-night price from inline Pricing on each rate.
    // Mews rates include Pricing.BaseRatePricing.Amount with a GrossValue
    // (price per night in major currency units, e.g. 350 SEK).
    // Dependent rates (non-base) derive pricing from their BaseRateId.
    const rateBasePrices = new Map<string, { grossPerNight: number; currency: string }>();
    for (const rate of activeRates) {
      const amount = rate.Pricing?.BaseRatePricing?.Amount;
      if (amount && amount.GrossValue > 0) {
        rateBasePrices.set(rate.Id, {
          grossPerNight: amount.GrossValue,
          currency: amount.Currency,
        });
      } else if (rate.BaseRateId) {
        // Dependent rate — inherit from base rate if available
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

    // Collect all image IDs for available categories
    const allImageIds: string[] = [];
    for (const cat of categories) {
      if (availableCategoryIds.has(cat.Id) && cat.ImageIds) {
        allImageIds.push(...cat.ImageIds);
      }
    }
    const imageUrlMap = await this.fetchImageUrls(allImageIds);

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

      // Build rate plans for this category using inline rate pricing
      const ratePlans: RatePlan[] = [];
      for (const rate of activeRates) {
        const basePrice = rateBasePrices.get(rate.Id);
        if (!basePrice) continue;

        const pricePerNightOren = toOren(basePrice.grossPerNight);
        const totalOren = pricePerNightOren * nights;

        ratePlans.push({
          externalId: rate.Id,
          name: pickLocalized(rate.Names) || "Standard",
          description: pickLocalized(rate.ShortDescriptions ?? rate.Description),
          cancellationPolicy: "FLEXIBLE",
          cancellationDescription: "",
          pricePerNight: pricePerNightOren,
          totalPrice: totalOren,
          currency: basePrice.currency,
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
    _tenantId: string,
    externalIds: string[],
    checkIn: Date,
    checkOut: Date,
  ): Promise<Map<string, boolean>> {
    if (externalIds.length === 0) {
      return new Map();
    }

    try {
      const serviceId = await this.getStayServiceId();

      // Fetch resource blocks (out-of-order periods) for the date range
      const blocksRaw = await this.client.post<Record<string, unknown>, MewsGetResourceBlocksResponse>(
        "resourceBlocks/getAll",
        {
          ServiceIds: [serviceId],
          TimeFilter: "Colliding",
          StartUtc: checkIn.toISOString(),
          EndUtc: checkOut.toISOString(),
          ActivityStates: ["Active"],
        },
      );
      const blocks = MewsGetResourceBlocksResponseSchema.parse(blocksRaw);

      // Build set of resource IDs that have an active block overlapping the range
      const blockedResourceIds = new Set<string>();
      const searchStart = checkIn.getTime();
      const searchEnd = checkOut.getTime();

      for (const block of blocks.ResourceBlocks) {
        const blockStart = new Date(block.StartUtc).getTime();
        const blockEnd = new Date(block.EndUtc).getTime();
        if (searchStart < blockEnd && searchEnd > blockStart) {
          blockedResourceIds.add(block.ResourceId);
        }
      }

      // Map requested externalIds to availability
      const result = new Map<string, boolean>();
      for (const id of externalIds) {
        result.set(id, !blockedResourceIds.has(id));
      }
      return result;
    } catch {
      // Fail open — if Mews call fails, assume all units available
      const result = new Map<string, boolean>();
      for (const id of externalIds) {
        result.set(id, true);
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

  async lookupBooking(
    _tenantId: string,
    _reference: string,
  ): Promise<BookingLookup | null> {
    // TODO: Call Mews reservations/getAll with ConfirmationNumber filter
    return null;
  }

  // ── 5. Guest Data ───────────────────────────────────────────

  async getGuest(
    _tenantId: string,
    _bookingExternalId: string,
  ): Promise<GuestData | null> {
    // TODO: Call Mews customers/getAll with reservation CustomerId
    return null;
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

    // Derive total amount from rate inline pricing
    const ratesRaw = await this.client.post<Record<string, unknown>, MewsGetRatesResponse>(
      "rates/getAll",
      { ServiceIds: [serviceId] },
    );
    const rates = MewsGetRatesResponseSchema.parse(ratesRaw);
    const matchedRate = rates.Rates.find((r) => r.Id === params.ratePlanId);
    const grossPerNight = matchedRate?.Pricing?.BaseRatePricing?.Amount?.GrossValue ?? 0;
    const currency = matchedRate?.Pricing?.BaseRatePricing?.Amount?.Currency ?? "SEK";
    const totalAmountOren = toOren(grossPerNight) * nights;

    return {
      externalId: reservation.Id,
      confirmationNumber: reservation.Number ?? reservation.Id,
      status: "CONFIRMED",
      totalAmount: totalAmountOren,
      currency,
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
}

// ── Type guard ──────────────────────────────────────────────

/** Check if an adapter is a MewsAdapter (has getResources method for unit sync). */
export function isMewsAdapter(adapter: PmsAdapter): adapter is MewsAdapter {
  return "getResources" in adapter && typeof (adapter as Record<string, unknown>).getResources === "function";
}
