-- Allow multiple SpotMaps per TenantApp installation (one per accommodation category).
-- Previously: @@unique([tenantAppId]) — one map per installation.
-- Now: @@unique([tenantAppId, accommodationCategoryId]) — one map per category per installation.

-- Drop the old unique constraint (one map per installation)
DROP INDEX IF EXISTS "SpotMap_tenantAppId_key";

-- Add the new composite unique constraint (one map per category per installation)
CREATE UNIQUE INDEX "SpotMap_tenantAppId_accommodationCategoryId_key"
  ON "SpotMap" ("tenantAppId", "accommodationCategoryId");
