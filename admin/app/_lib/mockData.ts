/**
 * GLOBAL MOCK DATA - Emma Andersson
 */

import type { NormalizedBooking } from "./integrations/types";

export const MOCK_GUEST = {
  firstName: "Emma",
  lastName: "Andersson",
  email: "emma@exempel.se",
  phone: "+46 70 123 45 67",
  street: "Storgatan 12",
  postalCode: "123 45",
  city: "Stockholm",
  country: "Sverige",
};

/**
 * Random Unsplash images for variety
 */
const UNSPLASH_IMAGES = [
  "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800&q=80", // Camping 1
  "https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=800&q=80", // Camping 2
  "https://images.unsplash.com/photo-1445308394109-4ec2920981b1?w=800&q=80", // Camping 3
  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80", // Lake view
  "https://images.unsplash.com/photo-1504851149312-7a075b496cc7?w=800&q=80", // Forest
];

function getRandomImage() {
  return UNSPLASH_IMAGES[Math.floor(Math.random() * UNSPLASH_IMAGES.length)];
}

/**
 * Skapar NUVARANDE (active) booking
 */
export function createGlobalMockBooking(tenantId: string) {
  const now = new Date();
  const arrival = new Date(now);
  arrival.setDate(arrival.getDate() - 1); // Checked in yesterday
  
  const departure = new Date(now);
  departure.setDate(departure.getDate() + 2); // Leaves in 2 days

  return {
    id: "MOCK-BOOKING-CURRENT",
    tenantId,
    
    firstName: MOCK_GUEST.firstName,
    lastName: MOCK_GUEST.lastName,
    guestEmail: MOCK_GUEST.email,
    phone: MOCK_GUEST.phone,
    street: MOCK_GUEST.street,
    postalCode: MOCK_GUEST.postalCode,
    city: MOCK_GUEST.city,
    country: MOCK_GUEST.country,
    
    arrival,
    departure,
    adults: 2,
    children: 1,
    unit: "Hotellrum 2",
    pitchNumber: "A14",

    status: "ACTIVE" as const,
    checkedInAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    checkedOutAt: null,
    
    signature: null,
    signedAt: null,
    
    imageUrl: getRandomImage(),
    
    createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    updatedAt: now,
  };
}

/**
 * Skapar 2 tidigare bokningar (completed)
 */
export function createGlobalMockHistory(tenantId: string) {
  const now = new Date();
  
  // Booking 1: Last summer (COMPLETED)
  const b1Arrival = new Date(now);
  b1Arrival.setMonth(now.getMonth() - 8); // 8 months ago
  const b1Departure = new Date(b1Arrival);
  b1Departure.setDate(b1Arrival.getDate() + 5);
  
  const booking1 = {
    id: "MOCK-BOOKING-PAST-1",
    tenantId,
    firstName: MOCK_GUEST.firstName,
    lastName: MOCK_GUEST.lastName,
    guestEmail: MOCK_GUEST.email,
    phone: MOCK_GUEST.phone,
    street: MOCK_GUEST.street,
    postalCode: MOCK_GUEST.postalCode,
    city: MOCK_GUEST.city,
    country: MOCK_GUEST.country,
    arrival: b1Arrival,
    departure: b1Departure,
    adults: 2,
    children: 1,
    unit: "Hotellrum 2",
    pitchNumber: "B7",
    status: "COMPLETED" as const,
    checkedInAt: b1Arrival,
    checkedOutAt: b1Departure,
    signature: null,
    signedAt: null,
    imageUrl: getRandomImage(),
    createdAt: new Date(b1Arrival.getTime() - 60 * 24 * 60 * 60 * 1000),
    updatedAt: b1Departure,
  };

  // Booking 2: Two years ago (COMPLETED)
  const b2Arrival = new Date(now);
  b2Arrival.setFullYear(now.getFullYear() - 2);
  b2Arrival.setMonth(6); // July
  const b2Departure = new Date(b2Arrival);
  b2Departure.setDate(b2Arrival.getDate() + 7);
  
  const booking2 = {
    id: "MOCK-BOOKING-PAST-2",
    tenantId,
    firstName: MOCK_GUEST.firstName,
    lastName: MOCK_GUEST.lastName,
    guestEmail: MOCK_GUEST.email,
    phone: MOCK_GUEST.phone,
    street: MOCK_GUEST.street,
    postalCode: MOCK_GUEST.postalCode,
    city: MOCK_GUEST.city,
    country: MOCK_GUEST.country,
    arrival: b2Arrival,
    departure: b2Departure,
    adults: 2,
    children: 0,
    unit: "Hotellrum 2",
    pitchNumber: "C3",
    status: "COMPLETED" as const,
    checkedInAt: b2Arrival,
    checkedOutAt: b2Departure,
    signature: null,
    signedAt: null,
    imageUrl: getRandomImage(),
    createdAt: new Date(b2Arrival.getTime() - 90 * 24 * 60 * 60 * 1000),
    updatedAt: b2Departure,
  };

  return [booking1, booking2];
}

/**
 * Returnerar ALLA 3 bookings (1 active + 2 completed)
 */
export function getAllMockBookings(tenantId: string) {
  const current = createGlobalMockBooking(tenantId);
  const history = createGlobalMockHistory(tenantId);
  return [current, ...history];
}

/**
 * Create mock bookings in NormalizedBooking shape.
 * Used by stays page and other adapter-aware components in preview/test mode.
 */
export function createMockNormalizedBookings(tenantId: string): NormalizedBooking[] {
  const current = createGlobalMockBooking(tenantId);
  const history = createGlobalMockHistory(tenantId);
  const all = [current, ...history];

  return all.map((b) => ({
    externalId: b.id,
    tenantId: b.tenantId,
    firstName: b.firstName,
    lastName: b.lastName,
    guestName: `${b.firstName} ${b.lastName}`,
    guestEmail: b.guestEmail,
    guestPhone: b.phone ?? null,
    arrival: b.arrival,
    departure: b.departure,
    unit: b.unit,
    unitType: null,
    status: b.status === "ACTIVE" ? "active" as const
      : b.status === "COMPLETED" ? "completed" as const
      : "upcoming" as const,
    adults: b.adults ?? 0,
    children: b.children ?? 0,
    extras: [],
    rawSource: "manual" as const,
    checkedInAt: b.checkedInAt ?? null,
    checkedOutAt: b.checkedOutAt ?? null,
    signatureCapturedAt: null,
  }));
}
