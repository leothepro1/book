import type { Booking } from "@prisma/client";

/**
 * Mock booking för preview mode.
 * 
 * Innehåller alla möjliga states för att visa full functionality:
 * - Active status (så check-in/check-out visas)
 * - Alla fält ifyllda
 * - Realistic dates
 */
export function createMockBooking(tenantId: string): Booking {
  const now = new Date();
  const arrival = new Date(now);
  arrival.setDate(arrival.getDate() - 1); // Checked in yesterday
  
  const departure = new Date(now);
  departure.setDate(departure.getDate() + 2); // Leaves in 2 days

  return {
    id: "preview-booking-1",
    tenantId,
    
    // Guest info
    firstName: "Emma",
    lastName: "Andersson",
    guestEmail: "emma.andersson@example.com",
    phone: "+46 70 123 45 67",
    
    // Address
    street: "Storgatan 12",
    postalCode: "123 45",
    city: "Stockholm",
    country: "Sverige",
    
    // Booking details
    arrival,
    departure,
    adults: 2,
    children: 1,
    pitchNumber: "A14",
    
    // Status
    status: "ACTIVE", // So all features are enabled
    checkedInAt: new Date(now.getTime() - 24 * 60 * 60 * 1000), // 24h ago
    checkedOutAt: null,
    
    // Signature
    signature: null,
    unit: "Strandhus 12",
    signatureCapturedAt: null,
    signatureDataUrl: null,
    signedAt: null,
    
    // Timestamps
    createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // Booked 30 days ago
    updatedAt: now,
  } as Booking;
}

/**
 * Mock booking history (previous stays)
 */
export function createMockBookingHistory(tenantId: string, guestEmail: string): Booking[] {
  const now = new Date();
  
  // Previous booking 1 (last summer)
  const prevArrival1 = new Date(now);
  prevArrival1.setMonth(prevArrival1.getMonth() - 8);
  const prevDeparture1 = new Date(prevArrival1);
  prevDeparture1.setDate(prevDeparture1.getDate() + 5);
  
  const previousBooking1: Booking = {
    id: "preview-booking-past-1",
    tenantId,
    firstName: "Emma",
    lastName: "Andersson",
    guestEmail,
    phone: "+46 70 123 45 67",
    street: "Storgatan 12",
    postalCode: "123 45",
    city: "Stockholm",
    country: "Sverige",
    arrival: prevArrival1,
    departure: prevDeparture1,
    adults: 2,
    children: 1,
    pitchNumber: "B7",
    status: "COMPLETED",
    checkedInAt: prevArrival1,
    checkedOutAt: prevDeparture1,
    signature: null,
    unit: "Strandhus 12",
    signatureCapturedAt: null,
    signatureDataUrl: null,
    signedAt: null,
    createdAt: new Date(prevArrival1.getTime() - 60 * 24 * 60 * 60 * 1000),
    updatedAt: prevDeparture1,
  } as Booking;

  // Previous booking 2 (two years ago)
  const prevArrival2 = new Date(now);
  prevArrival2.setFullYear(prevArrival2.getFullYear() - 2);
  prevArrival2.setMonth(6); // July
  const prevDeparture2 = new Date(prevArrival2);
  prevDeparture2.setDate(prevDeparture2.getDate() + 7);
  
  const previousBooking2: Booking = {
    id: "preview-booking-past-2",
    tenantId,
    firstName: "Emma",
    lastName: "Andersson",
    guestEmail,
    phone: "+46 70 123 45 67",
    street: "Storgatan 12",
    postalCode: "123 45",
    city: "Stockholm",
    country: "Sverige",
    arrival: prevArrival2,
    departure: prevDeparture2,
    adults: 2,
    children: 0,
    pitchNumber: "C3",
    status: "COMPLETED",
    checkedInAt: prevArrival2,
    checkedOutAt: prevDeparture2,
    signature: null,
    unit: "Strandhus 12",
    signatureCapturedAt: null,
    signatureDataUrl: null,
    signedAt: null,
    createdAt: new Date(prevArrival2.getTime() - 90 * 24 * 60 * 60 * 1000),
    updatedAt: prevDeparture2,
  } as Booking;

  return [previousBooking1, previousBooking2];
}
