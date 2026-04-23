-- CreateEnum
CREATE TYPE "DraftOrderStatus" AS ENUM ('OPEN', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'INVOICED', 'PAID', 'OVERDUE', 'COMPLETING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DraftBuyerKind" AS ENUM ('GUEST', 'COMPANY', 'WALK_IN');

-- CreateEnum
CREATE TYPE "DraftLineItemType" AS ENUM ('ACCOMMODATION', 'PRODUCT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DraftHoldState" AS ENUM ('NOT_PLACED', 'PLACING', 'PLACED', 'RELEASED', 'FAILED', 'CONFIRMED');

-- CreateTable
CREATE TABLE "DraftOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "displayNumber" TEXT NOT NULL,
    "status" "DraftOrderStatus" NOT NULL DEFAULT 'OPEN',
    "buyerKind" "DraftBuyerKind" NOT NULL,
    "guestAccountId" TEXT,
    "companyLocationId" TEXT,
    "companyContactId" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "contactFirstName" TEXT,
    "contactLastName" TEXT,
    "poNumber" TEXT,
    "subtotalCents" BIGINT NOT NULL DEFAULT 0,
    "orderDiscountCents" BIGINT NOT NULL DEFAULT 0,
    "shippingCents" BIGINT NOT NULL DEFAULT 0,
    "totalTaxCents" BIGINT NOT NULL DEFAULT 0,
    "totalCents" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "taxesIncluded" BOOLEAN NOT NULL DEFAULT true,
    "pricesFrozenAt" TIMESTAMP(3),
    "appliedDiscountId" TEXT,
    "appliedDiscountCode" TEXT,
    "appliedDiscountAmount" BIGINT,
    "appliedDiscountType" "DiscountValueType",
    "paymentTermsId" TEXT,
    "paymentTermsFrozen" JSONB,
    "depositPercent" DECIMAL(5,2),
    "shareLinkToken" TEXT,
    "shareLinkExpiresAt" TIMESTAMP(3),
    "invoiceUrl" TEXT,
    "invoiceSentAt" TIMESTAMP(3),
    "invoiceEmailSubject" TEXT,
    "invoiceEmailMessage" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedOrderId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "internalNote" TEXT,
    "customerNote" TEXT,
    "metafields" JSONB,
    "tags" TEXT[],

    CONSTRAINT "DraftOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftLineItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "draftOrderId" TEXT NOT NULL,
    "lineType" "DraftLineItemType" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "accommodationId" TEXT,
    "checkInDate" TIMESTAMP(3),
    "checkOutDate" TIMESTAMP(3),
    "nights" INTEGER,
    "guestCounts" JSONB,
    "ratePlanId" TEXT,
    "ratePlanName" TEXT,
    "ratePlanCancellationPolicy" TEXT,
    "selectedAddons" JSONB,
    "productVariantId" TEXT,
    "productId" TEXT,
    "variantTitle" TEXT,
    "sku" TEXT,
    "imageUrl" TEXT,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "taxCode" TEXT,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceCents" BIGINT NOT NULL,
    "subtotalCents" BIGINT NOT NULL,
    "lineDiscountCents" BIGINT NOT NULL DEFAULT 0,
    "taxAmountCents" BIGINT NOT NULL DEFAULT 0,
    "totalCents" BIGINT NOT NULL,
    "appliedCatalogId" TEXT,
    "appliedRule" TEXT,
    "lineDiscountTitle" TEXT,
    "lineDiscountType" "DiscountValueType",
    "lineDiscountValue" DECIMAL(10,4),
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "draftOrderId" TEXT NOT NULL,
    "draftLineItemId" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "ratePlanId" TEXT,
    "checkInDate" TIMESTAMP(3) NOT NULL,
    "checkOutDate" TIMESTAMP(3) NOT NULL,
    "guestCounts" JSONB NOT NULL,
    "holdExternalId" TEXT,
    "holdExpiresAt" TIMESTAMP(3),
    "holdState" "DraftHoldState" NOT NULL DEFAULT 'NOT_PLACED',
    "holdLastAttemptAt" TIMESTAMP(3),
    "holdLastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftOrderEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "draftOrderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "actorUserId" TEXT,
    "actorSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftOrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DraftOrder_shareLinkToken_key" ON "DraftOrder"("shareLinkToken");

-- CreateIndex
CREATE UNIQUE INDEX "DraftOrder_completedOrderId_key" ON "DraftOrder"("completedOrderId");

-- CreateIndex
CREATE INDEX "DraftOrder_tenantId_status_idx" ON "DraftOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DraftOrder_tenantId_expiresAt_idx" ON "DraftOrder"("tenantId", "expiresAt");

-- CreateIndex
CREATE INDEX "DraftOrder_tenantId_companyLocationId_idx" ON "DraftOrder"("tenantId", "companyLocationId");

-- CreateIndex
CREATE INDEX "DraftOrder_tenantId_guestAccountId_idx" ON "DraftOrder"("tenantId", "guestAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftOrder_tenantId_displayNumber_key" ON "DraftOrder"("tenantId", "displayNumber");

-- CreateIndex
CREATE INDEX "DraftLineItem_draftOrderId_position_idx" ON "DraftLineItem"("draftOrderId", "position");

-- CreateIndex
CREATE INDEX "DraftLineItem_tenantId_idx" ON "DraftLineItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftReservation_draftLineItemId_key" ON "DraftReservation"("draftLineItemId");

-- CreateIndex
CREATE INDEX "DraftReservation_draftOrderId_idx" ON "DraftReservation"("draftOrderId");

-- CreateIndex
CREATE INDEX "DraftReservation_accommodationId_checkInDate_checkOutDate_idx" ON "DraftReservation"("accommodationId", "checkInDate", "checkOutDate");

-- CreateIndex
CREATE INDEX "DraftReservation_holdExpiresAt_idx" ON "DraftReservation"("holdExpiresAt");

-- CreateIndex
CREATE INDEX "DraftReservation_tenantId_idx" ON "DraftReservation"("tenantId");

-- CreateIndex
CREATE INDEX "DraftOrderEvent_draftOrderId_createdAt_idx" ON "DraftOrderEvent"("draftOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "DraftOrderEvent_tenantId_type_idx" ON "DraftOrderEvent"("tenantId", "type");

-- AddForeignKey
ALTER TABLE "DraftLineItem" ADD CONSTRAINT "DraftLineItem_draftOrderId_fkey" FOREIGN KEY ("draftOrderId") REFERENCES "DraftOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftReservation" ADD CONSTRAINT "DraftReservation_draftOrderId_fkey" FOREIGN KEY ("draftOrderId") REFERENCES "DraftOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftOrderEvent" ADD CONSTRAINT "DraftOrderEvent_draftOrderId_fkey" FOREIGN KEY ("draftOrderId") REFERENCES "DraftOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial unique indexes (not expressible in Prisma DSL)
-- Within a single draft, the same accommodation cannot be booked twice for
-- the same date range. Accommodation lines only; null columns are excluded
-- so that non-accommodation lines and partially-filled lines don't collide.
CREATE UNIQUE INDEX "DraftLineItem_accommodation_dates_unique"
  ON "DraftLineItem" ("draftOrderId", "accommodationId", "checkInDate", "checkOutDate")
  WHERE "lineType" = 'ACCOMMODATION'
    AND "accommodationId" IS NOT NULL
    AND "checkInDate" IS NOT NULL
    AND "checkOutDate" IS NOT NULL;
