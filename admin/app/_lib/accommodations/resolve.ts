/**
 * resolveAccommodation — single source of truth for accommodation display data.
 *
 * Override chain for name:        nameOverride → name
 * Override chain for description:  descriptionOverride → description
 *
 * Never call this with a partial record. Always use ACCOMMODATION_SELECT when querying.
 * Never read raw Accommodation fields outside this function (except in sync).
 */

import type { AccommodationWithRelations, ResolvedAccommodation } from "./types";

export function resolveAccommodation(
  accommodation: AccommodationWithRelations,
): ResolvedAccommodation {
  return {
    // Identity
    id: accommodation.id,
    tenantId: accommodation.tenantId,
    slug: accommodation.slug,
    externalId: accommodation.externalId,
    pmsProvider: accommodation.pmsProvider,

    // Resolved display fields
    displayName: accommodation.nameOverride ?? accommodation.name,
    displayDescription:
      accommodation.descriptionOverride ?? accommodation.description,

    // Type & status
    accommodationType: accommodation.accommodationType,
    status: accommodation.status,

    // Capacity
    maxGuests: accommodation.maxGuests,
    minGuests: accommodation.minGuests,
    defaultGuests: accommodation.defaultGuests,
    maxAdults: accommodation.maxAdults,
    minAdults: accommodation.minAdults,
    maxChildren: accommodation.maxChildren,
    minChildren: accommodation.minChildren,
    extraBeds: accommodation.extraBeds,

    // Physical
    roomSizeSqm: accommodation.roomSizeSqm,
    bedrooms: accommodation.bedrooms,
    bathrooms: accommodation.bathrooms,

    // Pricing snapshot
    basePricePerNight: accommodation.basePricePerNight,
    currency: accommodation.currency,

    // Tax
    taxRate: accommodation.taxRate,

    // Availability
    totalUnits: accommodation.totalUnits,
    baseAvailability: accommodation.baseAvailability,

    // Timestamps
    sortOrder: accommodation.sortOrder,
    createdAt: accommodation.createdAt,
    updatedAt: accommodation.updatedAt,

    // Relations
    facilities: accommodation.facilities.map((f) => ({
      id: f.id,
      facilityType: f.facilityType,
      source: f.source,
      overrideHidden: f.overrideHidden,
      isVisible: !f.overrideHidden,
    })),

    bedConfigs: accommodation.bedConfigs.map((b) => ({
      id: b.id,
      bedType: b.bedType,
      quantity: b.quantity,
    })),

    ratePlans: accommodation.ratePlans.map((r) => ({
      id: r.id,
      externalId: r.externalId,
      name: r.name,
      description: r.description,
      cancellationPolicy: r.cancellationPolicy,
      cancellationDescription: r.cancellationDescription,
      pricePerNight: r.pricePerNight,
      currency: r.currency,
      status: r.status,
      validFrom: r.validFrom,
      validTo: r.validTo,
    })),

    restrictions: accommodation.restrictions.map((r) => ({
      id: r.id,
      restrictionType: r.restrictionType,
      date: r.date,
      value: r.value,
      source: r.source,
    })),

    media: accommodation.media.map((m) => ({
      id: m.id,
      url: m.url,
      altText: m.altText,
      sortOrder: m.sortOrder,
      source: m.source,
    })),

    units: accommodation.units.map((u) => ({
      id: u.id,
      name: u.name,
      externalId: u.externalId,
      floor: u.floor,
      notes: u.notes,
      status: u.status,
    })),
  };
}
