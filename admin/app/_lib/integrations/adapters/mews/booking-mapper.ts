/**
 * Mews Reservation → NormalizedBooking Mapper
 *
 * Maps Mews-internal types to the platform's normalized contract.
 * Requires customer and resource data fetched separately.
 */

import type { MewsReservation, MewsCustomer, MewsResource } from "./mews-types";
import type { NormalizedBooking } from "../../types";
import { mapMewsState } from "./status-mapping";

export function mapMewsReservationToNormalized(
  reservation: MewsReservation,
  customer: MewsCustomer | null,
  resource: MewsResource | null,
  tenantId: string,
): NormalizedBooking {
  const firstName = customer?.FirstName ?? "";
  const lastName = customer?.LastName ?? "";
  const guestName = firstName || lastName
    ? `${firstName} ${lastName}`.trim()
    : "Unknown Guest";

  // Sum all person counts for total occupants
  const totalPersons = (reservation.PersonCounts ?? [])
    .reduce((sum, pc) => sum + pc.Count, 0);

  return {
    externalId: reservation.Id,
    tenantId,
    firstName,
    lastName,
    guestName,
    guestEmail: customer?.Email ?? "",
    guestPhone: customer?.Phone ?? null,
    arrival: new Date(reservation.ScheduledStartUtc),
    departure: new Date(reservation.ScheduledEndUtc),
    unit: resource?.Name ?? reservation.AssignedResourceId ?? "Unassigned",
    unitType: null,
    status: mapMewsState(reservation.State),
    adults: totalPersons,
    children: 0,
    extras: [],
    rawSource: "mews",
    checkedInAt: reservation.ActualStartUtc
      ? new Date(reservation.ActualStartUtc)
      : null,
    checkedOutAt: reservation.ActualEndUtc
      ? new Date(reservation.ActualEndUtc)
      : null,
    signatureCapturedAt: null,
  };
}

/** Map a MewsCustomer to NormalizedGuest. */
export function mapMewsCustomerToGuest(
  customer: MewsCustomer,
): import("../../types").NormalizedGuest {
  return {
    externalId: customer.Id,
    firstName: customer.FirstName ?? "",
    lastName: customer.LastName ?? "",
    email: customer.Email ?? "",
    phone: customer.Phone ?? null,
    address: {
      street: customer.Address?.Line1 ?? null,
      postalCode: customer.Address?.PostalCode ?? null,
      city: customer.Address?.City ?? null,
      country: customer.Address?.CountryCode ?? null,
    },
  };
}
