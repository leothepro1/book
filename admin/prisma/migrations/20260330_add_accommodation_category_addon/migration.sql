CREATE TABLE "AccommodationCategoryAddon" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccommodationCategoryAddon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccommodationCategoryAddon_categoryId_collectionId_key" ON "AccommodationCategoryAddon"("categoryId", "collectionId");
CREATE INDEX "AccommodationCategoryAddon_categoryId_sortOrder_idx" ON "AccommodationCategoryAddon"("categoryId", "sortOrder");
CREATE INDEX "AccommodationCategoryAddon_collectionId_idx" ON "AccommodationCategoryAddon"("collectionId");

ALTER TABLE "AccommodationCategoryAddon" ADD CONSTRAINT "AccommodationCategoryAddon_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AccommodationCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccommodationCategoryAddon" ADD CONSTRAINT "AccommodationCategoryAddon_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ProductCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
