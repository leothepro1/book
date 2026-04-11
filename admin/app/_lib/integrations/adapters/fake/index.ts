/**
 * FakeAdapter — Development PMS Adapter
 *
 * Simulates a Swedish camping/hotel property with 8 room categories,
 * 3 accommodation types, realistic rate plans, and deterministic
 * blocked dates for partial availability.
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
  CreateBookingParams,
  BookingConfirmation,
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

// ── Deterministic hash — simple FNV-1a 32-bit ─────────────────

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

// ── Blocked dates generator ───────────────────────────────────

/** Known busy periods (month 0-indexed, day 1-indexed) */
const KNOWN_BUSY_PERIODS: Array<{ month: number; day: number; length: number }> = [
  { month: 1, day: 17, length: 5 },  // Sportlov (v8)
  { month: 3, day: 14, length: 5 },  // Påsk
  { month: 5, day: 20, length: 5 },  // Midsommar
  { month: 6, day: 10, length: 4 },  // Högsommar 1
  { month: 7, day: 5, length: 4 },   // Högsommar 2
  { month: 9, day: 28, length: 3 },  // Höstlov
  { month: 11, day: 23, length: 4 }, // Jul
];

type BlockedPeriod = { start: number; end: number }; // epoch ms

function generateBlockedPeriods(externalId: string, year: number): BlockedPeriod[] {
  const periods: BlockedPeriod[] = [];
  const seed = fnv1a(externalId);

  // Each accommodation blocks a subset of the known busy periods (seeded)
  for (let i = 0; i < KNOWN_BUSY_PERIODS.length; i++) {
    // Use seed + index to decide if this accommodation is blocked
    if ((seed + i * 7) % 3 === 0) continue; // ~1/3 chance to skip
    const bp = KNOWN_BUSY_PERIODS[i];
    const start = new Date(year, bp.month, bp.day).getTime();
    const end = start + bp.length * 86400000;
    periods.push({ start, end });
  }

  // Generate 2–3 "random" blocked periods per accommodation using hash
  const extraCount = 2 + (seed % 2); // 2 or 3
  for (let i = 0; i < extraCount; i++) {
    const monthOffset = ((seed >>> (i * 4)) % 10) + 1; // month 1–10
    const dayOffset = ((seed >>> (i * 3 + 2)) % 20) + 3; // day 3–22
    const length = 2 + ((seed >>> (i * 5 + 1)) % 4); // 2–5 nights
    const start = new Date(year, monthOffset, dayOffset).getTime();
    const end = start + length * 86400000;
    periods.push({ start, end });
  }

  return periods;
}

export function isAvailableForDates(externalId: string, checkIn: Date, checkOut: Date): boolean {
  const year = checkIn.getFullYear();
  const periods = [
    ...generateBlockedPeriods(externalId, year),
    ...generateBlockedPeriods(externalId, year + 1), // handle year boundary
  ];

  const searchStart = checkIn.getTime();
  const searchEnd = checkOut.getTime();

  // Unavailable if any night in range overlaps a blocked period
  for (const bp of periods) {
    if (searchStart < bp.end && searchEnd > bp.start) return false;
  }
  return true;
}

// ── Rate plan builders ────────────────────────────────────────

function buildRatePlans(
  cat: RoomCategory,
  nights: number,
  guests: number,
): Array<{
  externalId: string;
  name: string;
  description: string;
  cancellationPolicy: "FLEXIBLE" | "MODERATE" | "NON_REFUNDABLE";
  cancellationDescription: string;
  pricePerNight: number;
  totalPrice: number;
  currency: string;
  validFrom: null;
  validTo: null;
  includedAddons: Array<{ addonId: string; name: string; quantity: number }>;
}> {
  switch (cat.type) {
    case "HOTEL": {
      const flexPrice = cat.basePricePerNight;
      const packagePrice = Math.round(cat.basePricePerNight * 0.85);
      return [
        {
          externalId: `${cat.externalId}_flex_hotell`,
          name: "Flex Hotell",
          description: "Linneset, Avresestäd, 90% åter vid avbokning senast 2 dygn före ankomst, Frukostbuffé inkluderad",
          cancellationPolicy: "FLEXIBLE",
          cancellationDescription: "90% åter vid avbokning senast 2 dygn före ankomst",
          pricePerNight: flexPrice,
          totalPrice: flexPrice * nights,
          currency: "SEK",
          validFrom: null,
          validTo: null,
          includedAddons: [
            { addonId: "addon-breakfast", name: "Frukostbuffé", quantity: guests },
            { addonId: "addon-cleaning", name: "Avresestäd", quantity: 1 },
          ],
        },
        {
          externalId: `${cat.externalId}_weekend_paket`,
          name: "Weekendpaket",
          description: "Frukostbuffé, Spabesök 60 min, Sen utcheckning kl 13. Ej återbetalningsbar.",
          cancellationPolicy: "NON_REFUNDABLE",
          cancellationDescription: "Ej återbetalningsbar",
          pricePerNight: packagePrice,
          totalPrice: packagePrice * nights,
          currency: "SEK",
          validFrom: null,
          validTo: null,
          includedAddons: [
            { addonId: "addon-breakfast", name: "Frukostbuffé", quantity: guests },
            { addonId: "addon-spa", name: "Spabesök 60 min", quantity: guests },
          ],
        },
      ];
    }

    case "CAMPING": {
      const flexPrice = cat.basePricePerNight;
      const sparPrice = Math.round(cat.basePricePerNight * 0.80);
      return [
        {
          externalId: `${cat.externalId}_flex_camping`,
          name: "Flex Camping",
          description: "Inkluderar: 80% åter vid avbokning senast 2 dygn före ankomst",
          cancellationPolicy: "FLEXIBLE",
          cancellationDescription: "80% åter vid avbokning senast 2 dygn före ankomst",
          pricePerNight: flexPrice,
          totalPrice: flexPrice * nights,
          currency: "SEK",
          validFrom: null,
          validTo: null,
          includedAddons: [],
        },
        {
          externalId: `${cat.externalId}_fast_pris`,
          name: "Fast pris",
          description: "Lägsta pris — bokningsvillkor utan avbokningsmöjlighet.",
          cancellationPolicy: "NON_REFUNDABLE",
          cancellationDescription: "Ej återbetalningsbar",
          pricePerNight: sparPrice,
          totalPrice: sparPrice * nights,
          currency: "SEK",
          validFrom: null,
          validTo: null,
          includedAddons: [],
        },
      ];
    }

    default: {
      // CABIN and others
      const flexPrice = cat.basePricePerNight;
      const sparPrice = Math.round(cat.basePricePerNight * 0.85);
      return [
        {
          externalId: `${cat.externalId}_flexibel`,
          name: "Flexibel",
          description: "Avbokning utan avgift upp till 48 timmar före ankomst.",
          cancellationPolicy: "FLEXIBLE",
          cancellationDescription: "Fri avbokning till 48h före ankomst",
          pricePerNight: flexPrice,
          totalPrice: flexPrice * nights,
          currency: "SEK",
          validFrom: null,
          validTo: null,
          includedAddons: [],
        },
        {
          externalId: `${cat.externalId}_sparpris`,
          name: "Sparpris",
          description: "Lägre pris — ej återbetalningsbar.",
          cancellationPolicy: "NON_REFUNDABLE",
          cancellationDescription: "Ej återbetalningsbar",
          pricePerNight: sparPrice,
          totalPrice: sparPrice * nights,
          currency: "SEK",
          validFrom: null,
          validTo: null,
          includedAddons: [],
        },
      ];
    }
  }
}

// ── Room categories — Swedish camping/hotel property ────────

const FAKE_CATEGORIES: RoomCategory[] = [
  {
    externalId: "room_hotel_standard",
    name: "Hotell 1-4 personer",
    shortDescription: "Hotellboende med frukostbuffé och slutstädning.",
    longDescription: "Hotellboende där frukostbuffé och slutstädning ingår för upp till fyra personer.",
    type: "HOTEL",
    imageUrls: [
      "https://images.bookvisit.com/img/ce9cac03-0b03-4a86-b247-ea16a0eed91c.jpg?maxwidth=1000&maxheight=1000&scale=downscaleonly",
      "https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1445308394109-4ec2920981b1?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800&h=600&fit=crop",
    ],
    maxGuests: 4,
    facilities: ["frukost", "städning", "wifi", "kök", "tv", "terrass"],
    basePricePerNight: 149900,
  },
  {
    externalId: "room_hotel_single",
    name: "Enkelrum Hotell",
    shortDescription: "Hotellboende med högsta komfort.",
    longDescription: "Vårt hotellboende ger dig högsta komfort.",
    type: "HOTEL",
    imageUrls: [
      "https://images.bookvisit.com/img/fba2b9e9-9dda-45ba-9cc7-062c70b89e37.jpg?maxwidth=1000&maxheight=1000&scale=downscaleonly",
      "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1595576508898-0ad5c879a061?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1540518614846-7eded433c457?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800&h=600&fit=crop",
    ],
    maxGuests: 1,
    facilities: ["frukost", "städning", "wifi", "kök"],
    basePricePerNight: 99900,
  },
  {
    externalId: "room_cabin_large",
    name: "Stuga 1-6 personer",
    shortDescription: "Stuga med komplett kök och badrum.",
    longDescription: "Stugan är utrustad med komplett kök, badrum.",
    type: "CABIN",
    imageUrls: [
      "https://images.bookvisit.com/img/21534197-2fa1-4b7c-8f09-64d980842325.jpg?maxwidth=1000&maxheight=1000&scale=downscaleonly",
      "https://images.unsplash.com/photo-1587061949409-02df41d5e562?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1432303492674-642e9d0944b2?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1588880331179-bc9b93a8cb5e?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800&h=600&fit=crop",
    ],
    maxGuests: 6,
    facilities: ["kök", "badrum", "uteplats", "parkering"],
    basePricePerNight: 179900,
  },
  {
    externalId: "room_cabin_small",
    name: "Campingstuga",
    shortDescription: "Liten campingstuga på 10 kvm.",
    longDescription: "Den lilla campingstugan på 10 kvm.",
    type: "CABIN",
    imageUrls: [
      "https://images.bookvisit.com/img/351b8d3d-cc09-49cf-8577-8fe483be95d7.jpg?maxwidth=1000&maxheight=1000&scale=downscaleonly",
      "https://images.unsplash.com/photo-1499696010180-025ef6e1a8f9?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1534187886935-1e1236e856c3?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1517824806704-9040b037703b?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop",
    ],
    maxGuests: 2,
    facilities: ["kylskåp", "micro", "tv", "altan"],
    basePricePerNight: 69900,
  },
  {
    externalId: "room_camping_south",
    name: "Camping 8 m Södra",
    shortDescription: "Campingtomt ca 90-100 kvm med el.",
    longDescription: "Campingtomt på ca 90-100 kvm med el 10 ampere.",
    type: "CAMPING",
    imageUrls: [
      "https://images.bookvisit.com/img/5e1f2e0c-e882-462b-8a12-e034e4642367.jpg?maxwidth=1000&maxheight=1000&scale=downscaleonly",
      "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1478827536114-da961b7f86d2?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1525811902-f2342640856e?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1537905569824-f89f14cceb68?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1445308394109-4ec2920981b1?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1487730116645-74489c95b41b?w=800&h=600&fit=crop",
    ],
    maxGuests: 6,
    facilities: ["el", "servicehus", "parkering"],
    basePricePerNight: 39900,
  },
  {
    externalId: "room_camping_motorhome_10",
    name: "Husbil 10 m",
    shortDescription: "Plats enbart för husbil.",
    longDescription: "Platsen är gjord enbart för husbil.",
    type: "CAMPING",
    imageUrls: [
      "https://images.bookvisit.com/img/c1262edd-5ab9-4e9f-82c2-632eb2ab2ed5.jpg?maxwidth=1000&maxheight=1000&scale=downscaleonly",
      "https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1533575770077-052fa2c609fc?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1543731068-7e0f5beff43a?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1527786356703-4b100091cd2c?w=800&h=600&fit=crop",
    ],
    maxGuests: 4,
    facilities: ["el", "servicehus"],
    basePricePerNight: 44900,
  },
  {
    externalId: "room_camping_caravan_premium",
    name: "Husvagn 9 m Premium",
    shortDescription: "Våra finaste husvagnstomter.",
    longDescription: "Våra finaste husvagnstomter.",
    type: "CAMPING",
    imageUrls: [
      "https://images.bookvisit.com/img/5aa024d4-b3f7-4d1d-9f0d-c40237c8c929.jpg?maxwidth=1000&maxheight=1000&scale=downscaleonly",
      "https://images.unsplash.com/photo-1571863533956-01c88e496cba?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1596649299486-4cdea56fd59d?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1414016642493-13571d76b22c?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1596178065887-1198b6148b2b?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1506197603052-3cc9c3a209c8?w=800&h=600&fit=crop",
    ],
    maxGuests: 6,
    facilities: ["el", "vatten", "avlopp", "servicehus"],
    basePricePerNight: 54900,
  },
  {
    externalId: "room_camping_motorhome_7",
    name: "Husbil 7 m",
    shortDescription: "Plats för husbil med markis.",
    longDescription: "Platsen passar för husbil med markis.",
    type: "CAMPING",
    imageUrls: [
      "https://images.bookvisit.com/img/ae3c30a7-5635-415a-bc27-29b73f343f91.jpg?maxwidth=1000&maxheight=1000&scale=downscaleonly",
      "https://images.unsplash.com/photo-1534187886935-1e1236e856c3?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1517824806704-9040b037703b?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1470770841497-7b3202e2cd72?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1472396961693-142e6e269027?w=800&h=600&fit=crop",
    ],
    maxGuests: 4,
    facilities: ["el", "servicehus", "hårdgjord"],
    basePricePerNight: 39900,
  },
];

// ── Availability unit counts per type ───────────────────────

function getAvailableUnits(type: string): number {
  switch (type) {
    case "CAMPING": return 12;
    case "HOTEL": return 5;
    case "CABIN": return 3;
    default: return 2;
  }
}

// ── Adapter ─────────────────────────────────────────────────

export class FakeAdapter implements PmsAdapter {
  readonly provider: PmsProvider = "fake";
  private readonly config: FakeCredentials;

  constructor(config: FakeCredentials) {
    this.config = config;
  }

  private async delay(): Promise<void> {
    if (this.config.scenario === "slow") {
      await sleep(1500);
    } else if (this.config.delayMs > 0) {
      await sleep(this.config.delayMs);
    }
  }

  async getAvailability(
    _tenantId: string,
    params: AvailabilityParams,
  ): Promise<AvailabilityResult> {
    await this.delay();

    if (this.config.scenario === "error") throw new Error("Fake PMS: Connection refused");

    const nights = Math.round((params.checkOut.getTime() - params.checkIn.getTime()) / 86400000);

    if (this.config.scenario === "empty") {
      return { categories: [], checkIn: params.checkIn, checkOut: params.checkOut, nights, guests: params.guests, searchId: `fake_${Date.now()}` };
    }

    let categories = FAKE_CATEGORIES;

    if (params.types && params.types.length > 0) {
      categories = categories.filter((c) => params.types!.includes(c.type));
    }

    // Filter out unavailable accommodations (blocked dates)
    const available = categories.filter((cat) =>
      isAvailableForDates(cat.externalId, params.checkIn, params.checkOut),
    );

    return {
      categories: available.map((cat) => {
        const plans = buildRatePlans(cat, nights, params.guests);
        const lowestPrice = Math.min(...plans.map((p) => p.totalPrice));
        return {
          category: cat,
          ratePlans: plans,
          lowestTotalPrice: lowestPrice,
          availableUnits: getAvailableUnits(cat.type),
        };
      }),
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
    return [];
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
      categoryName: "Hotell 1-4 personer",
      checkIn: new Date(Date.now() + 3 * 86400000),
      checkOut: new Date(Date.now() + 7 * 86400000),
      guests: 2,
      status: "confirmed",
      totalAmount: 599600, // 4 nights × 1499 kr
      currency: "SEK",
      ratePlanName: "Flex Hotell",
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
      totalAmount: 599600,
      paidAmount: 599600,
      outstandingBalance: 0,
      currency: "SEK",
      status: "PAID",
    };
  }

  async getUnitAvailability(
    _tenantId: string,
    externalIds: string[],
    checkIn: Date,
    checkOut: Date,
  ): Promise<Map<string, boolean>> {
    await this.delay();
    if (this.config.scenario === "error") throw new Error("Fake PMS: Connection refused");

    const result = new Map<string, boolean>();
    for (const id of externalIds) {
      result.set(id, isAvailableForDates(id, checkIn, checkOut));
    }
    return result;
  }

  async createBooking(
    _tenantId: string,
    params: CreateBookingParams,
  ): Promise<BookingConfirmation> {
    await this.delay();
    if (this.config.scenario === "error") throw new Error("Fake PMS: Booking creation failed");

    const nights = Math.round(
      (new Date(params.checkOut).getTime() - new Date(params.checkIn).getTime()) / 86400000,
    );
    // Look up the category to use its real price
    const category = FAKE_CATEGORIES.find((c) => c.externalId === params.categoryId);
    const pricePerNight = category?.basePricePerNight ?? 149900;

    const year = new Date().getFullYear();
    const ref = Math.floor(1000 + Math.random() * 9000);

    return {
      externalId: `fake-booking-${Date.now()}`,
      confirmationNumber: `BK-${year}-${ref}`,
      status: "CONFIRMED",
      totalAmount: pricePerNight * nights,
      currency: "SEK",
      cancellationDeadline: null,
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
