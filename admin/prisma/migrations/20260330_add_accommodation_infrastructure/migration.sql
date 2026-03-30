-- CreateEnum
CREATE TYPE "AccommodationType" AS ENUM ('HOTEL', 'CABIN', 'CAMPING', 'APARTMENT', 'PITCH');

-- CreateEnum
CREATE TYPE "AccommodationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AccommodationUnitStatus" AS ENUM ('AVAILABLE', 'MAINTENANCE', 'BLOCKED', 'RETIRED');

-- CreateEnum
CREATE TYPE "BedType" AS ENUM ('SINGLE', 'DOUBLE', 'QUEEN', 'KING', 'SOFA_BED', 'BUNK_BED', 'FRENCH', 'FUTON', 'TATAMI', 'FOLDABLE', 'EXTRA_BED');

-- CreateEnum
CREATE TYPE "FacilityType" AS ENUM ('AIR_CONDITIONING', 'HEATING', 'FAN', 'FIREPLACE', 'BATHTUB', 'SHOWER', 'SAUNA', 'HOT_TUB', 'HAIRDRYER', 'BATHROBES', 'SLIPPERS', 'FREE_TOILETRIES', 'BIDET', 'WC', 'KITCHEN', 'KITCHENETTE', 'REFRIGERATOR', 'FREEZER', 'MICROWAVE', 'OVEN', 'STOVE', 'DISHWASHER', 'KETTLE', 'COFFEE_MAKER', 'TOASTER', 'COOKWARE', 'MINIBAR', 'WIFI', 'FIBER', 'TV', 'FLAT_SCREEN_TV', 'CABLE_TV', 'SATELLITE_TV', 'PAY_TV', 'BLUETOOTH_SPEAKER', 'APPLE_TV', 'CHROMECAST', 'DVD_PLAYER', 'CD_PLAYER', 'GAME_CONSOLE', 'LAPTOP_STORAGE', 'WARDROBE', 'SOFA', 'SOFA_BED_LIVING', 'DESK', 'IRONING_BOARD', 'IRON', 'TROUSER_PRESS', 'WASHER', 'DRYER', 'DRYING_CABINET', 'STEAMER', 'DUMBBELL', 'BALCONY', 'TERRACE', 'PATIO', 'PRIVATE_POOL', 'GARDEN_VIEW', 'POOL_VIEW', 'SEA_VIEW', 'LAKE_VIEW', 'MOUNTAIN_VIEW', 'CITY_VIEW', 'CANAL_VIEW', 'RIVER_VIEW', 'FJORD_VIEW', 'PRIVATE_ENTRANCE', 'STORAGE_BOX', 'PETS_ALLOWED', 'PETS_NOT_ALLOWED', 'NO_SMOKING', 'SOUNDPROOFED', 'WHEELCHAIR_ACCESSIBLE', 'EV_CHARGER', 'SKI_STORAGE', 'MOTOR_HEATER', 'WAKE_UP_SERVICE', 'ALARM_CLOCK', 'LATE_CHECKOUT', 'DEPARTURE_CLEANING');

-- CreateEnum
CREATE TYPE "FacilitySource" AS ENUM ('PMS', 'MANUAL');

-- CreateEnum
CREATE TYPE "RatePlanCancellationPolicy" AS ENUM ('FLEXIBLE', 'MODERATE', 'NON_REFUNDABLE');

-- CreateEnum
CREATE TYPE "RatePlanStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RestrictionType" AS ENUM ('MIN_STAY', 'MAX_STAY', 'CLOSED_TO_ARRIVAL', 'CLOSED_TO_DEPARTURE', 'NO_CHECK_IN', 'NO_CHECK_OUT');

-- CreateTable
CREATE TABLE "Accommodation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "shortName" TEXT,
    "externalCode" TEXT,
    "externalId" TEXT,
    "pmsProvider" TEXT,
    "pmsSyncedAt" TIMESTAMP(3),
    "pmsData" JSONB,
    "accommodationType" "AccommodationType" NOT NULL,
    "status" "AccommodationStatus" NOT NULL DEFAULT 'ACTIVE',
    "nameOverride" TEXT,
    "descriptionOverride" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "maxGuests" INTEGER NOT NULL,
    "minGuests" INTEGER NOT NULL DEFAULT 1,
    "defaultGuests" INTEGER,
    "maxAdults" INTEGER,
    "minAdults" INTEGER,
    "maxChildren" INTEGER,
    "minChildren" INTEGER,
    "extraBeds" INTEGER NOT NULL DEFAULT 0,
    "roomSizeSqm" DOUBLE PRECISION,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "floorNumber" INTEGER,
    "basePricePerNight" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "taxRate" INTEGER NOT NULL DEFAULT 0,
    "totalUnits" INTEGER NOT NULL DEFAULT 1,
    "baseAvailability" INTEGER NOT NULL DEFAULT 1,
    "roomTypeGroupId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Accommodation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationUnit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalId" TEXT,
    "floor" INTEGER,
    "notes" TEXT,
    "status" "AccommodationUnitStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccommodationUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationFacility" (
    "id" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "facilityType" "FacilityType" NOT NULL,
    "source" "FacilitySource" NOT NULL DEFAULT 'MANUAL',
    "overrideHidden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AccommodationFacility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BedConfiguration" (
    "id" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "bedType" "BedType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BedConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cancellationPolicy" "RatePlanCancellationPolicy" NOT NULL DEFAULT 'FLEXIBLE',
    "cancellationDescription" TEXT,
    "pricePerNight" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "status" "RatePlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationRestriction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "restrictionType" "RestrictionType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "value" INTEGER,
    "source" "FacilitySource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccommodationRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationMedia" (
    "id" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "source" "FacilitySource" NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "AccommodationMedia_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add new columns to Booking
ALTER TABLE "Booking" ADD COLUMN "accommodationId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "orderId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "ratePlanId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "checkIn" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "checkOut" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "guestCount" INTEGER;
ALTER TABLE "Booking" ADD COLUMN "specialRequests" TEXT;
ALTER TABLE "Booking" ADD COLUMN "pmsBookingRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Accommodation_tenantId_slug_key" ON "Accommodation"("tenantId", "slug");
CREATE UNIQUE INDEX "Accommodation_tenantId_externalId_pmsProvider_key" ON "Accommodation"("tenantId", "externalId", "pmsProvider");
CREATE INDEX "Accommodation_tenantId_idx" ON "Accommodation"("tenantId");
CREATE INDEX "Accommodation_tenantId_status_idx" ON "Accommodation"("tenantId", "status");
CREATE INDEX "Accommodation_tenantId_accommodationType_idx" ON "Accommodation"("tenantId", "accommodationType");
CREATE INDEX "Accommodation_tenantId_sortOrder_idx" ON "Accommodation"("tenantId", "sortOrder");
CREATE INDEX "Accommodation_tenantId_archivedAt_idx" ON "Accommodation"("tenantId", "archivedAt");
CREATE INDEX "Accommodation_tenantId_pmsProvider_externalId_idx" ON "Accommodation"("tenantId", "pmsProvider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "AccommodationUnit_tenantId_accommodationId_name_key" ON "AccommodationUnit"("tenantId", "accommodationId", "name");
CREATE INDEX "AccommodationUnit_tenantId_idx" ON "AccommodationUnit"("tenantId");
CREATE INDEX "AccommodationUnit_accommodationId_idx" ON "AccommodationUnit"("accommodationId");
CREATE INDEX "AccommodationUnit_tenantId_status_idx" ON "AccommodationUnit"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AccommodationFacility_accommodationId_facilityType_key" ON "AccommodationFacility"("accommodationId", "facilityType");
CREATE INDEX "AccommodationFacility_accommodationId_idx" ON "AccommodationFacility"("accommodationId");

-- CreateIndex
CREATE UNIQUE INDEX "BedConfiguration_accommodationId_bedType_key" ON "BedConfiguration"("accommodationId", "bedType");
CREATE INDEX "BedConfiguration_accommodationId_idx" ON "BedConfiguration"("accommodationId");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlan_accommodationId_externalId_key" ON "RatePlan"("accommodationId", "externalId");
CREATE INDEX "RatePlan_tenantId_idx" ON "RatePlan"("tenantId");
CREATE INDEX "RatePlan_accommodationId_idx" ON "RatePlan"("accommodationId");
CREATE INDEX "RatePlan_accommodationId_status_idx" ON "RatePlan"("accommodationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AccommodationRestriction_accommodationId_restrictionType_da_key" ON "AccommodationRestriction"("accommodationId", "restrictionType", "date");
CREATE INDEX "AccommodationRestriction_tenantId_idx" ON "AccommodationRestriction"("tenantId");
CREATE INDEX "AccommodationRestriction_accommodationId_idx" ON "AccommodationRestriction"("accommodationId");
CREATE INDEX "AccommodationRestriction_accommodationId_date_idx" ON "AccommodationRestriction"("accommodationId", "date");

-- CreateIndex
CREATE INDEX "AccommodationMedia_accommodationId_idx" ON "AccommodationMedia"("accommodationId");
CREATE INDEX "AccommodationMedia_accommodationId_sortOrder_idx" ON "AccommodationMedia"("accommodationId", "sortOrder");

-- CreateIndex (Booking new columns)
CREATE INDEX "Booking_accommodationId_idx" ON "Booking"("accommodationId");
CREATE INDEX "Booking_orderId_idx" ON "Booking"("orderId");
CREATE INDEX "Booking_tenantId_accommodationId_idx" ON "Booking"("tenantId", "accommodationId");

-- AddForeignKey
ALTER TABLE "Accommodation" ADD CONSTRAINT "Accommodation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationUnit" ADD CONSTRAINT "AccommodationUnit_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationFacility" ADD CONSTRAINT "AccommodationFacility_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedConfiguration" ADD CONSTRAINT "BedConfiguration_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlan" ADD CONSTRAINT "RatePlan_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationRestriction" ADD CONSTRAINT "AccommodationRestriction_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationMedia" ADD CONSTRAINT "AccommodationMedia_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
