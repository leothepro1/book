import type { NormalizedBooking } from "@/app/_lib/integrations/types";

/**
 * Mock booking för preview mode.
 *
 * Innehåller alla möjliga states för att visa full functionality:
 * - Active status (så check-in/check-out visas)
 * - Alla fält ifyllda
 * - Realistic dates
 */
export function createMockBooking(tenantId: string): NormalizedBooking {
  const now = new Date();
  const arrival = new Date(now);
  arrival.setDate(arrival.getDate() - 1); // Checked in yesterday

  const departure = new Date(now);
  departure.setDate(departure.getDate() + 2); // Leaves in 2 days

  return {
    externalId: "preview-booking-1",
    tenantId,
    firstName: "Emma",
    lastName: "Andersson",
    guestName: "Emma Andersson",
    guestEmail: "emma.andersson@example.com",
    guestPhone: "+46 70 123 45 67",
    arrival,
    departure,
    unit: "Strandhus 12",
    unitType: null,
    status: "active",
    adults: 2,
    children: 1,
    extras: [],
    rawSource: "manual",
    checkedInAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    checkedOutAt: null,
    signatureCapturedAt: null,
  };
}

/**
 * Mock booking history (previous stays)
 */
export function createMockBookingHistory(tenantId: string, guestEmail: string): NormalizedBooking[] {
  const now = new Date();

  const prevArrival1 = new Date(now);
  prevArrival1.setMonth(prevArrival1.getMonth() - 8);
  const prevDeparture1 = new Date(prevArrival1);
  prevDeparture1.setDate(prevDeparture1.getDate() + 5);

  const prevArrival2 = new Date(now);
  prevArrival2.setFullYear(prevArrival2.getFullYear() - 2);
  prevArrival2.setMonth(6);
  const prevDeparture2 = new Date(prevArrival2);
  prevDeparture2.setDate(prevDeparture2.getDate() + 7);

  return [
    {
      externalId: "preview-booking-past-1",
      tenantId,
      firstName: "Emma",
      lastName: "Andersson",
      guestName: "Emma Andersson",
      guestEmail,
      guestPhone: "+46 70 123 45 67",
      arrival: prevArrival1,
      departure: prevDeparture1,
      unit: "Strandhus 12",
      unitType: null,
      status: "completed",
      adults: 2,
      children: 1,
      extras: [],
      rawSource: "manual",
      checkedInAt: prevArrival1,
      checkedOutAt: prevDeparture1,
      signatureCapturedAt: null,
    },
    {
      externalId: "preview-booking-past-2",
      tenantId,
      firstName: "Emma",
      lastName: "Andersson",
      guestName: "Emma Andersson",
      guestEmail,
      guestPhone: "+46 70 123 45 67",
      arrival: prevArrival2,
      departure: prevDeparture2,
      unit: "Strandhus 12",
      unitType: null,
      status: "completed",
      adults: 2,
      children: 0,
      extras: [],
      rawSource: "manual",
      checkedInAt: prevArrival2,
      checkedOutAt: prevDeparture2,
      signatureCapturedAt: null,
    },
  ];
}
