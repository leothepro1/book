-- Refactor SpotMap: remove AccommodationCategory link, add SpotMapAccommodation join table.
-- This is a destructive migration — existing SpotMap and SpotMarker data is dropped.

-- 1. Drop dependents first (markers reference spot maps)
DELETE FROM "SpotMarker";
DELETE FROM "SpotMap";

-- 2. Drop old columns and constraints from SpotMap
DROP INDEX IF EXISTS "SpotMap_accommodationCategoryId_idx";
DROP INDEX IF EXISTS "SpotMap_tenantAppId_accommodationCategoryId_key";
ALTER TABLE "SpotMap" DROP COLUMN IF EXISTS "accommodationCategoryId";

-- 3. Create SpotMapAccommodation join table
CREATE TABLE "SpotMapAccommodation" (
    "id" TEXT NOT NULL,
    "spotMapId" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpotMapAccommodation_pkey" PRIMARY KEY ("id")
);

-- 4. Unique constraint: each accommodation belongs to at most one map
CREATE UNIQUE INDEX "SpotMapAccommodation_accommodationId_key" ON "SpotMapAccommodation"("accommodationId");

-- 5. Index for lookups by spotMapId
CREATE INDEX "SpotMapAccommodation_spotMapId_idx" ON "SpotMapAccommodation"("spotMapId");

-- 6. Foreign keys
ALTER TABLE "SpotMapAccommodation" ADD CONSTRAINT "SpotMapAccommodation_spotMapId_fkey" FOREIGN KEY ("spotMapId") REFERENCES "SpotMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpotMapAccommodation" ADD CONSTRAINT "SpotMapAccommodation_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
