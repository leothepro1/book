/**
 * Accommodation Domain Types
 * ══════════════════════════
 *
 * Canonical types for the Accommodation model and its relations.
 * These replace RoomCategory for all new code going forward.
 * The PmsAdapter continues to return RoomCategory — a mapper converts it.
 *
 * Never import Accommodation types from @prisma/client directly in UI or
 * business logic. Import from this file instead.
 */

import type {
  Accommodation,
  AccommodationFacility,
  AccommodationMedia,
  AccommodationUnit,
  AccommodationCategoryItem,
  BedConfiguration,
  RatePlan,
  AccommodationRestriction,
  AccommodationType as PrismaAccommodationType,
  AccommodationStatus as PrismaAccommodationStatus,
  FacilityType as PrismaFacilityType,
  FacilitySource as PrismaFacilitySource,
  BedType as PrismaBedType,
  RatePlanCancellationPolicy as PrismaRatePlanCancellationPolicy,
  RatePlanStatus as PrismaRatePlanStatus,
  RestrictionType as PrismaRestrictionType,
  AccommodationUnitStatus as PrismaAccommodationUnitStatus,
} from "@prisma/client";

// Re-export enums for convenience — consumers import from here, not @prisma/client
export type AccommodationType = PrismaAccommodationType;
export type AccommodationStatus = PrismaAccommodationStatus;
export type FacilityType = PrismaFacilityType;
export type FacilitySource = PrismaFacilitySource;
export type BedType = PrismaBedType;
export type RatePlanCancellationPolicy = PrismaRatePlanCancellationPolicy;
export type RatePlanStatus = PrismaRatePlanStatus;
export type RestrictionType = PrismaRestrictionType;
export type AccommodationUnitStatus = PrismaAccommodationUnitStatus;

// ── Full DB record with all relations loaded ────────────────────

export type AccommodationWithRelations = Accommodation & {
  facilities: AccommodationFacility[];
  bedConfigs: BedConfiguration[];
  ratePlans: RatePlan[];
  restrictions: AccommodationRestriction[];
  media: AccommodationMedia[];
  units: AccommodationUnit[];
  categoryItems: AccommodationCategoryItem[];
};

// ── Resolved/display type — what all UI and business logic consumes ──
// resolveAccommodation() produces this. Never read raw Accommodation fields directly.

export type ResolvedAccommodation = {
  // Identity
  id: string;
  tenantId: string;
  slug: string;
  externalId: string | null;
  pmsProvider: string | null;

  // Resolved display fields (override ?? raw)
  displayName: string;
  displayDescription: string;

  // Type & status
  accommodationType: PrismaAccommodationType;
  status: PrismaAccommodationStatus;

  // Capacity
  maxGuests: number;
  minGuests: number;
  defaultGuests: number | null;
  maxAdults: number | null;
  minAdults: number | null;
  maxChildren: number | null;
  minChildren: number | null;
  extraBeds: number;

  // Physical
  roomSizeSqm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;

  // Pricing snapshot
  basePricePerNight: number; // ören
  currency: string;

  // Tax
  taxRate: number; // basis points

  // Availability
  totalUnits: number;
  baseAvailability: number;

  // Relations (resolved)
  facilities: ResolvedFacility[];
  bedConfigs: ResolvedBedConfig[];
  ratePlans: ResolvedRatePlan[];
  restrictions: ResolvedRestriction[];
  media: ResolvedMedia[];
  highlights: ResolvedHighlight[];
  units: ResolvedUnit[];

  // Category membership
  categoryIds: string[];

  // Raw fields (kept for internal use only)
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ResolvedFacility = {
  id: string;
  facilityType: PrismaFacilityType;
  source: PrismaFacilitySource;
  overrideHidden: boolean;
  /** false if overrideHidden === true */
  isVisible: boolean;
};

export type ResolvedBedConfig = {
  id: string;
  bedType: PrismaBedType;
  quantity: number;
};

export type ResolvedRatePlan = {
  id: string;
  externalId: string | null;
  name: string;
  description: string | null;
  cancellationPolicy: PrismaRatePlanCancellationPolicy;
  cancellationDescription: string | null;
  pricePerNight: number; // ören — snapshot only
  currency: string;
  status: PrismaRatePlanStatus;
  validFrom: Date | null;
  validTo: Date | null;
};

export type ResolvedRestriction = {
  id: string;
  restrictionType: PrismaRestrictionType;
  date: Date;
  value: number | null;
  source: PrismaFacilitySource;
};

export type ResolvedMedia = {
  id: string;
  url: string;
  altText: string | null;
  sortOrder: number;
  source: PrismaFacilitySource;
};

export type ResolvedHighlight = {
  id: string;
  icon: string;
  text: string;
  description: string;
  sortOrder: number;
};

export type ResolvedUnit = {
  id: string;
  name: string;
  externalId: string | null;
  floor: number | null;
  notes: string | null;
  status: PrismaAccommodationUnitStatus;
};

// ── Prisma select shape ────────────────────────────────────────
// Always use this select — never select ad-hoc fields from Accommodation.
// All queries that feed resolveAccommodation() must use this.

export const ACCOMMODATION_SELECT = {
  id: true,
  tenantId: true,
  name: true,
  slug: true,
  shortName: true,
  externalCode: true,
  externalId: true,
  pmsProvider: true,
  pmsSyncedAt: true,
  accommodationType: true,
  status: true,
  nameOverride: true,
  descriptionOverride: true,
  description: true,
  maxGuests: true,
  minGuests: true,
  defaultGuests: true,
  maxAdults: true,
  minAdults: true,
  maxChildren: true,
  minChildren: true,
  extraBeds: true,
  roomSizeSqm: true,
  bedrooms: true,
  bathrooms: true,
  floorNumber: true,
  basePricePerNight: true,
  currency: true,
  taxRate: true,
  totalUnits: true,
  baseAvailability: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
  facilities: {
    select: {
      id: true,
      facilityType: true,
      source: true,
      overrideHidden: true,
    },
  },
  bedConfigs: {
    select: {
      id: true,
      bedType: true,
      quantity: true,
    },
  },
  ratePlans: {
    where: { status: "ACTIVE" as const },
    select: {
      id: true,
      externalId: true,
      name: true,
      description: true,
      cancellationPolicy: true,
      cancellationDescription: true,
      pricePerNight: true,
      currency: true,
      status: true,
      validFrom: true,
      validTo: true,
    },
    orderBy: { pricePerNight: "asc" as const },
  },
  restrictions: {
    select: {
      id: true,
      restrictionType: true,
      date: true,
      value: true,
      source: true,
    },
  },
  media: {
    select: {
      id: true,
      url: true,
      altText: true,
      sortOrder: true,
      source: true,
    },
    orderBy: { sortOrder: "asc" as const },
  },
  highlights: {
    select: {
      id: true,
      icon: true,
      text: true,
      description: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: "asc" as const },
  },
  units: {
    select: {
      id: true,
      name: true,
      externalId: true,
      floor: true,
      notes: true,
      status: true,
    },
    orderBy: { name: "asc" as const },
  },
  categoryItems: {
    select: {
      categoryId: true,
    },
  },
} as const;
