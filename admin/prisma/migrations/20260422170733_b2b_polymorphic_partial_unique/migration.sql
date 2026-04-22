-- DropIndex
DROP INDEX "CatalogFixedPrice_catalogId_accommodationId_key";

-- DropIndex
DROP INDEX "CatalogFixedPrice_catalogId_productVariantId_key";

-- DropIndex
DROP INDEX "CatalogInclusion_catalogId_accommodationId_key";

-- DropIndex
DROP INDEX "CatalogInclusion_catalogId_collectionId_key";

-- DropIndex
DROP INDEX "CatalogInclusion_catalogId_productVariantId_key";

-- Partial unique indexes (not expressible in Prisma DSL)
-- Replace the NULLS-DISTINCT @@unique constraints with WHERE-clauses that
-- only enforce uniqueness over rows whose polymorphic ref column is set.
-- Rationale: the old constraints allowed degenerate all-null-ref rows to
-- race through and left CatalogQuantityRule entirely unenforced (it had
-- no @@unique at all). See schema.prisma docblocks on the three models.

CREATE UNIQUE INDEX "CatalogFixedPrice_catalogId_accommodationId_partial_key"
  ON "CatalogFixedPrice" ("catalogId", "accommodationId")
  WHERE "accommodationId" IS NOT NULL;

CREATE UNIQUE INDEX "CatalogFixedPrice_catalogId_productVariantId_partial_key"
  ON "CatalogFixedPrice" ("catalogId", "productVariantId")
  WHERE "productVariantId" IS NOT NULL;

CREATE UNIQUE INDEX "CatalogInclusion_catalogId_accommodationId_partial_key"
  ON "CatalogInclusion" ("catalogId", "accommodationId")
  WHERE "accommodationId" IS NOT NULL;

CREATE UNIQUE INDEX "CatalogInclusion_catalogId_productVariantId_partial_key"
  ON "CatalogInclusion" ("catalogId", "productVariantId")
  WHERE "productVariantId" IS NOT NULL;

CREATE UNIQUE INDEX "CatalogInclusion_catalogId_collectionId_partial_key"
  ON "CatalogInclusion" ("catalogId", "collectionId")
  WHERE "collectionId" IS NOT NULL;

CREATE UNIQUE INDEX "CatalogQuantityRule_catalogId_accommodationId_partial_key"
  ON "CatalogQuantityRule" ("catalogId", "accommodationId")
  WHERE "accommodationId" IS NOT NULL;

CREATE UNIQUE INDEX "CatalogQuantityRule_catalogId_productVariantId_partial_key"
  ON "CatalogQuantityRule" ("catalogId", "productVariantId")
  WHERE "productVariantId" IS NOT NULL;
