-- CreateTable
CREATE TABLE "AccommodationCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL,
    "imageUrl" TEXT,
    "status" "AccommodationStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "pmsRef" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccommodationCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationCategoryItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccommodationCategoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccommodationCategory_tenantId_slug_key" ON "AccommodationCategory"("tenantId", "slug");
CREATE INDEX "AccommodationCategory_tenantId_idx" ON "AccommodationCategory"("tenantId");
CREATE INDEX "AccommodationCategory_tenantId_status_idx" ON "AccommodationCategory"("tenantId", "status");
CREATE INDEX "AccommodationCategory_tenantId_sortOrder_idx" ON "AccommodationCategory"("tenantId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AccommodationCategoryItem_categoryId_accommodationId_key" ON "AccommodationCategoryItem"("categoryId", "accommodationId");
CREATE INDEX "AccommodationCategoryItem_categoryId_sortOrder_idx" ON "AccommodationCategoryItem"("categoryId", "sortOrder");
CREATE INDEX "AccommodationCategoryItem_accommodationId_idx" ON "AccommodationCategoryItem"("accommodationId");

-- AddForeignKey
ALTER TABLE "AccommodationCategory" ADD CONSTRAINT "AccommodationCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccommodationCategoryItem" ADD CONSTRAINT "AccommodationCategoryItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AccommodationCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccommodationCategoryItem" ADD CONSTRAINT "AccommodationCategoryItem_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
