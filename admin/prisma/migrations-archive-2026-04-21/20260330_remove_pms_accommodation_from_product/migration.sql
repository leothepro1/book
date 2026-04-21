-- Step 1: Update existing PMS_ACCOMMODATION products to STANDARD before enum change
UPDATE "Product" SET "productType" = 'STANDARD' WHERE "productType" = 'PMS_ACCOMMODATION';

-- Step 2: Drop columns that only existed for PMS_ACCOMMODATION
ALTER TABLE "Product" DROP COLUMN IF EXISTS "pmsSourceId";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "pmsProvider";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "pmsSyncedAt";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "pmsData";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "titleOverride";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "descriptionOverride";

-- Step 3: Drop indexes that reference removed columns
DROP INDEX IF EXISTS "Product_tenantId_pmsProvider_pmsSourceId_idx";
DROP INDEX IF EXISTS "Product_tenantId_pmsSourceId_pmsProvider_key";

-- Step 4: Drop accommodation-specific columns from ProductCollection
ALTER TABLE "ProductCollection" DROP COLUMN IF EXISTS "isAccommodationType";
ALTER TABLE "ProductCollection" DROP COLUMN IF EXISTS "addonCollectionId";

-- Step 5: Alter ProductType enum — remove PMS_ACCOMMODATION, add GIFT_CARD
-- PostgreSQL requires creating a new enum type and swapping
ALTER TYPE "ProductType" RENAME TO "ProductType_old";
CREATE TYPE "ProductType" AS ENUM ('STANDARD', 'GIFT_CARD');
ALTER TABLE "Product" ALTER COLUMN "productType" DROP DEFAULT;
ALTER TABLE "Product" ALTER COLUMN "productType" TYPE "ProductType" USING ("productType"::text::"ProductType");
ALTER TABLE "Product" ALTER COLUMN "productType" SET DEFAULT 'STANDARD';
DROP TYPE "ProductType_old";
