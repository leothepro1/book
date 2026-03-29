-- AlterEnum — add new condition types
ALTER TYPE "DiscountConditionType" ADD VALUE 'SPECIFIC_COLLECTIONS';
ALTER TYPE "DiscountConditionType" ADD VALUE 'SPECIFIC_CUSTOMERS';

-- AlterTable — add targeting flags and minimum requirements to Discount
ALTER TABLE "Discount" ADD COLUMN "appliesToAllCustomers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "appliesToAllProducts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "minimumAmount" INTEGER,
ADD COLUMN "minimumQuantity" INTEGER;

-- CreateTable
CREATE TABLE "DiscountProduct" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "DiscountProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCollection" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "DiscountCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountSegment" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "DiscountSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCustomer" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "guestAccountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "DiscountCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscountProduct_discountId_productId_key" ON "DiscountProduct"("discountId", "productId");
CREATE INDEX "DiscountProduct_discountId_idx" ON "DiscountProduct"("discountId");
CREATE INDEX "DiscountProduct_tenantId_productId_idx" ON "DiscountProduct"("tenantId", "productId");

CREATE UNIQUE INDEX "DiscountCollection_discountId_collectionId_key" ON "DiscountCollection"("discountId", "collectionId");
CREATE INDEX "DiscountCollection_discountId_idx" ON "DiscountCollection"("discountId");
CREATE INDEX "DiscountCollection_tenantId_collectionId_idx" ON "DiscountCollection"("tenantId", "collectionId");

CREATE UNIQUE INDEX "DiscountSegment_discountId_segmentId_key" ON "DiscountSegment"("discountId", "segmentId");
CREATE INDEX "DiscountSegment_discountId_idx" ON "DiscountSegment"("discountId");
CREATE INDEX "DiscountSegment_tenantId_segmentId_idx" ON "DiscountSegment"("tenantId", "segmentId");

CREATE UNIQUE INDEX "DiscountCustomer_discountId_guestAccountId_key" ON "DiscountCustomer"("discountId", "guestAccountId");
CREATE INDEX "DiscountCustomer_discountId_idx" ON "DiscountCustomer"("discountId");
CREATE INDEX "DiscountCustomer_tenantId_guestAccountId_idx" ON "DiscountCustomer"("tenantId", "guestAccountId");

-- AddForeignKey
ALTER TABLE "DiscountProduct" ADD CONSTRAINT "DiscountProduct_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscountProduct" ADD CONSTRAINT "DiscountProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiscountCollection" ADD CONSTRAINT "DiscountCollection_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscountCollection" ADD CONSTRAINT "DiscountCollection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ProductCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiscountSegment" ADD CONSTRAINT "DiscountSegment_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscountSegment" ADD CONSTRAINT "DiscountSegment_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "GuestSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiscountCustomer" ADD CONSTRAINT "DiscountCustomer_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscountCustomer" ADD CONSTRAINT "DiscountCustomer_guestAccountId_fkey" FOREIGN KEY ("guestAccountId") REFERENCES "GuestAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
