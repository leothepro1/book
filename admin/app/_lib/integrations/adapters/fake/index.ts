/**
 * FakeAdapter — Development PMS Adapter
 *
 * Simulates a fully working booking engine PMS with controllable behavior.
 * Returns fake availability, room types, rates, and restrictions.
 * Used for UI development and edge case testing.
 * Never used in production.
 */

import { z } from "zod";
import type { PmsAdapter } from "../../adapter";
import type {
  PmsProvider,
  AvailabilityParams,
  AvailabilityResult,
  RoomCategory,
  Restriction,
  BookingLookup,
  GuestData,
  Addon,
  PaymentStatus,
} from "../../types";

export const FakeScenarioSchema = z.enum(["happy", "empty", "error", "slow", "cancelled"]);
export type FakeScenario = z.infer<typeof FakeScenarioSchema>;

export const FakeCredentialsSchema = z.object({
  scenario: FakeScenarioSchema,
  delayMs: z.coerce.number().default(800),
});
export type FakeCredentials = z.infer<typeof FakeCredentialsSchema>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Fake room categories ────────────────────────────────────

const FAKE_CATEGORIES: RoomCategory[] = [
  {
    externalId: "cat-camping",
    name: "Campingtomter",
    shortDescription: "Välskötta tomter med el och vatten nära stranden.",
    longDescription: "Rymliga campingtomter med direktaccess till strand och servicehus. El-uttag på varje tomt.",
    type: "CAMPING",
    imageUrls: ["https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600"],
    maxGuests: 6,
    facilities: ["el", "vatten", "wifi", "servicehus"],
    basePricePerNight: 35000, // 350 kr
  },
  {
    externalId: "cat-apartment",
    name: "Strandlägenheter",
    shortDescription: "Moderna lägenheter med havsutsikt och fullt kök.",
    longDescription: "Nybyggda lägenheter med balkong mot havet. Fullt utrustat kök, tvättmaskin och torktumlare.",
    type: "APARTMENT",
    imageUrls: ["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600"],
    maxGuests: 4,
    facilities: ["kök", "balkong", "tvättmaskin", "wifi", "parkering"],
    basePricePerNight: 195000, // 1950 kr
  },
  {
    externalId: "cat-hotel",
    name: "Hotellrum Havsutsikt",
    shortDescription: "Bekväma hotellrum med frukost och havsutsikt.",
    longDescription: "Ljusa och fräscha hotellrum med privat balkong. Frukostbuffé ingår varje morgon.",
    type: "HOTEL",
    imageUrls: ["https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=600"],
    maxGuests: 2,
    facilities: ["frukost", "städning", "wifi", "balkong"],
    basePricePerNight: 145000, // 1450 kr
  },
  {
    externalId: "cat-cabin",
    name: "Stugor",
    shortDescription: "Mysiga stugor med uteplats och grillplats.",
    longDescription: "Traditionella stugor i trä med fullt kök, uteplats och grillplats. Perfekt för familjer.",
    type: "CABIN",
    imageUrls: ["https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?w=600"],
    maxGuests: 6,
    facilities: ["kök", "uteplats", "grill", "husdjur_ok", "parkering"],
    basePricePerNight: 165000, // 1650 kr
  },
];

export class FakeAdapter implements PmsAdapter {
  readonly provider: PmsProvider = "fake";
  private readonly config: FakeCredentials;

  constructor(config: FakeCredentials) {
    this.config = config;
  }

  private async delay(): Promise<void> {
    if (this.config.delayMs > 0) await sleep(this.config.delayMs);
  }

  async getAvailability(
    _tenantId: string,
    params: AvailabilityParams,
  ): Promise<AvailabilityResult> {
    await this.delay();

    if (this.config.scenario === "error") throw new Error("Fake PMS: Connection refused");
    if (this.config.scenario === "empty") {
      const nights = Math.round((params.checkOut.getTime() - params.checkIn.getTime()) / 86400000);
      return { categories: [], checkIn: params.checkIn, checkOut: params.checkOut, nights, guests: params.guests, searchId: `fake_${Date.now()}` };
    }

    const nights = Math.round((params.checkOut.getTime() - params.checkIn.getTime()) / 86400000);
    let categories = FAKE_CATEGORIES;

    // Filter by type if specified
    if (params.types && params.types.length > 0) {
      categories = categories.filter((c) => params.types!.includes(c.type));
    }

    return {
      categories: categories.map((cat) => ({
        category: cat,
        ratePlans: [
          {
            externalId: `rp-flex-${cat.externalId}`,
            name: "Flexibel",
            description: "Fri avbokning upp till 24h före incheckning.",
            cancellationPolicy: "FLEXIBLE" as const,
            cancellationDescription: "Fri avbokning till 24h före ankomst",
            pricePerNight: cat.basePricePerNight,
            totalPrice: cat.basePricePerNight * nights,
            currency: "SEK",
            validFrom: null,
            validTo: null,
            includedAddons: cat.type === "HOTEL" ? [{ addonId: "addon-breakfast", name: "Frukost", quantity: params.guests }] : [],
          },
          {
            externalId: `rp-nonref-${cat.externalId}`,
            name: "Sparpris",
            description: "Lägre pris — ej återbetalningsbar.",
            cancellationPolicy: "NON_REFUNDABLE" as const,
            cancellationDescription: "Ej återbetalningsbar",
            pricePerNight: Math.round(cat.basePricePerNight * 0.85),
            totalPrice: Math.round(cat.basePricePerNight * 0.85) * nights,
            currency: "SEK",
            validFrom: null,
            validTo: null,
            includedAddons: [],
          },
        ],
        lowestTotalPrice: Math.round(cat.basePricePerNight * 0.85) * nights,
        availableUnits: cat.type === "CAMPING" ? 12 : cat.type === "HOTEL" ? 5 : 3,
      })),
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      nights,
      guests: params.guests,
      searchId: `fake_${Date.now()}`,
    };
  }

  async getRoomTypes(_tenantId: string): Promise<RoomCategory[]> {
    await this.delay();
    if (this.config.scenario === "error") throw new Error("Fake PMS: Connection refused");
    if (this.config.scenario === "empty") return [];
    return FAKE_CATEGORIES;
  }

  async getRestrictions(
    _tenantId: string,
    _from: Date,
    _to: Date,
    _categoryExternalId?: string,
  ): Promise<Restriction[]> {
    await this.delay();
    return []; // No restrictions in fake mode
  }

  async lookupBooking(
    _tenantId: string,
    reference: string,
  ): Promise<BookingLookup | null> {
    await this.delay();
    if (this.config.scenario === "error") throw new Error("Fake PMS: Connection refused");
    if (this.config.scenario === "empty") return null;

    return {
      externalId: reference,
      guestName: "Sofia Bergström",
      guestEmail: "sofia.bergstrom@example.com",
      guestPhone: "+46 70 111 22 33",
      categoryName: "Hotellrum Havsutsikt",
      checkIn: new Date(Date.now() + 3 * 86400000),
      checkOut: new Date(Date.now() + 7 * 86400000),
      guests: 2,
      status: "confirmed",
      totalAmount: 580000, // 5800 kr
      currency: "SEK",
      ratePlanName: "Flexibel",
      createdAt: new Date(Date.now() - 7 * 86400000),
    };
  }

  async getGuest(
    _tenantId: string,
    _bookingExternalId: string,
  ): Promise<GuestData | null> {
    await this.delay();
    return {
      externalId: "fake-guest-1",
      firstName: "Sofia",
      lastName: "Bergström",
      email: "sofia.bergstrom@example.com",
      phone: "+46 70 111 22 33",
      address: { street: "Kungsgatan 5", postalCode: "111 43", city: "Stockholm", country: "SE" },
    };
  }

  async getAddons(
    _tenantId: string,
    _categoryExternalId?: string,
  ): Promise<Addon[]> {
    await this.delay();
    return [
      { externalId: "addon-breakfast", name: "Frukost", description: "Frukostbuffé 07:00–10:00", price: 15000, currency: "SEK", pricingMode: "PER_PERSON_PER_NIGHT" },
      { externalId: "addon-parking", name: "Parkering", description: "Reserverad parkeringsplats", price: 10000, currency: "SEK", pricingMode: "PER_NIGHT" },
      { externalId: "addon-cleaning", name: "Slutstädning", description: "Professionell slutstädning", price: 45000, currency: "SEK", pricingMode: "PER_STAY" },
    ];
  }

  async getPaymentStatus(
    _tenantId: string,
    _bookingExternalId: string,
  ): Promise<PaymentStatus | null> {
    await this.delay();
    return {
      bookingExternalId: _bookingExternalId,
      totalAmount: 580000,
      paidAmount: 580000,
      outstandingBalance: 0,
      currency: "SEK",
      status: "PAID",
    };
  }

  async testConnection(
    credentials: Record<string, string>,
  ): Promise<{ ok: boolean; error?: string }> {
    const parsed = FakeCredentialsSchema.safeParse(credentials);
    if (!parsed.success) return { ok: false, error: "Ogiltiga uppgifter" };
    await sleep(parsed.data.delayMs);
    if (parsed.data.scenario === "error") return { ok: false, error: "Anslutningen nekades" };
    return { ok: true };
  }

  resolveWebhookTenant(_payload: unknown): string | null {
    return "fake-enterprise-id";
  }

  async verifyWebhookSignature(
    _rawBody: Buffer,
    _headers: Record<string, string>,
    _credentials: Record<string, string>,
  ): Promise<boolean> {
    return true;
  }
}
