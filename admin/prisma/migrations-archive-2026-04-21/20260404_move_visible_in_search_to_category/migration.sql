-- Move visibleInSearch from Accommodation to AccommodationCategory
-- AccommodationCategory controls search filter visibility at the category level.
-- Individual accommodations no longer have their own search visibility toggle.

-- Step 1: Add visibleInSearch to AccommodationCategory (default true)
ALTER TABLE "AccommodationCategory" ADD COLUMN "visibleInSearch" BOOLEAN NOT NULL DEFAULT true;

-- Step 2: Create index for efficient filtering
CREATE INDEX "AccommodationCategory_tenantId_visibleInSearch_idx" ON "AccommodationCategory"("tenantId", "visibleInSearch");

-- Step 3: Drop index from Accommodation
DROP INDEX IF EXISTS "Accommodation_tenantId_visibleInSearch_idx";

-- Step 4: Remove column from Accommodation
ALTER TABLE "Accommodation" DROP COLUMN IF EXISTS "visibleInSearch";
