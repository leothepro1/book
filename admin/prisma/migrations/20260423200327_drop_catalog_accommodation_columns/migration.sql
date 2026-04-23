/*
  FAS 6.2B — Accommodation / B2B boundary cleanup.

  Drops the three `accommodationId` columns from the Catalog-family tables.
  B2B catalogs apply to products (variants + collections) only;
  accommodation pricing is PMS-authoritative and never flows through these
  tables — see Pass 3 Risk #8 and computeAccommodationLinePrice.

  Data survey confirmed zero rows with accommodationId IS NOT NULL across
  all three tables before this migration; dropping the column is a no-op
  on stored data.

  Note: the three raw-SQL partial unique indexes created by migration
  20260422170733_b2b_polymorphic_partial_unique reference these columns.
  Postgres refuses DROP COLUMN while an index depends on it, so we drop
  the indexes first.
*/

-- Drop raw-SQL partial unique indexes that reference the accommodationId columns.
DROP INDEX IF EXISTS "CatalogFixedPrice_catalogId_accommodationId_partial_key";
DROP INDEX IF EXISTS "CatalogInclusion_catalogId_accommodationId_partial_key";
DROP INDEX IF EXISTS "CatalogQuantityRule_catalogId_accommodationId_partial_key";

-- AlterTable
ALTER TABLE "CatalogFixedPrice" DROP COLUMN "accommodationId";

-- AlterTable
ALTER TABLE "CatalogInclusion" DROP COLUMN "accommodationId";

-- AlterTable
ALTER TABLE "CatalogQuantityRule" DROP COLUMN "accommodationId";
