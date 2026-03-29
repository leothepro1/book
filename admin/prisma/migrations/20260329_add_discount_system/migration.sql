-- CreateEnum
CREATE TYPE "DiscountMethod" AS ENUM ('AUTOMATIC', 'CODE');

-- CreateEnum
CREATE TYPE "DiscountValueType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "DiscountTargetType" AS ENUM ('ORDER', 'LINE_ITEM');

-- CreateEnum
CREATE TYPE "DiscountStatus" AS ENUM ('ACTIVE', 'SCHEDULED', 'EXPIRED', 'DISABLED');

-- CreateEnum
CREATE TYPE "DiscountConditionType" AS ENUM ('MIN_NIGHTS', 'DAYS_IN_ADVANCE', 'ARRIVAL_WINDOW', 'MIN_ORDER_AMOUNT', 'MIN_ITEMS', 'SPECIFIC_PRODUCTS', 'CUSTOMER_SEGMENT', 'ONCE_PER_CUSTOMER');

-- CreateEnum
CREATE TYPE "DiscountEventType" AS ENUM ('CREATED', 'UPDATED', 'ENABLED', 'DISABLED', 'CODE_ADDED', 'CODE_REMOVED', 'USAGE_RECORDED');

-- AlterEnum — add discount event types to OrderEventType
ALTER TYPE "OrderEventType" ADD VALUE 'DISCOUNT_APPLIED';
ALTER TYPE "OrderEventType" ADD VALUE 'DISCOUNT_CODE_REDEEMED';
ALTER TYPE "OrderEventType" ADD VALUE 'DISCOUNT_REMOVED';

-- AlterTable — Order discount fields
ALTER TABLE "Order" ADD COLUMN "discountAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "discountCode" TEXT;

-- AlterTable — OrderLineItem discount field
ALTER TABLE "OrderLineItem" ADD COLUMN "discountAmount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable — Tenant feature toggle
ALTER TABLE "Tenant" ADD COLUMN "discountsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Discount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "method" "DiscountMethod" NOT NULL,
    "valueType" "DiscountValueType" NOT NULL,
    "value" INTEGER NOT NULL,
    "targetType" "DiscountTargetType" NOT NULL,
    "status" "DiscountStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "combinesWithProductDiscounts" BOOLEAN NOT NULL DEFAULT false,
    "combinesWithOrderDiscounts" BOOLEAN NOT NULL DEFAULT false,
    "combinesWithShippingDiscounts" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCode" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCondition" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "type" "DiscountConditionType" NOT NULL,
    "intValue" INTEGER,
    "stringValue" TEXT,
    "jsonValue" JSONB,

    CONSTRAINT "DiscountCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountAllocation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderLineItemId" TEXT,
    "discountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountUsage" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "discountCodeId" TEXT,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "guestAccountId" TEXT,
    "guestEmail" TEXT NOT NULL,
    "discountAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountEvent" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "DiscountEventType" NOT NULL,
    "message" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Discount_tenantId_status_idx" ON "Discount"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Discount_tenantId_method_idx" ON "Discount"("tenantId", "method");

-- CreateIndex
CREATE INDEX "Discount_tenantId_startsAt_endsAt_idx" ON "Discount"("tenantId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "DiscountCode_discountId_idx" ON "DiscountCode"("discountId");

-- CreateIndex
CREATE INDEX "DiscountCode_tenantId_isActive_idx" ON "DiscountCode"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCode_tenantId_code_key" ON "DiscountCode"("tenantId", "code");

-- CreateIndex
CREATE INDEX "DiscountCondition_discountId_idx" ON "DiscountCondition"("discountId");

-- CreateIndex
CREATE INDEX "DiscountCondition_discountId_type_idx" ON "DiscountCondition"("discountId", "type");

-- CreateIndex
CREATE INDEX "DiscountAllocation_orderId_idx" ON "DiscountAllocation"("orderId");

-- CreateIndex
CREATE INDEX "DiscountAllocation_discountId_idx" ON "DiscountAllocation"("discountId");

-- CreateIndex
CREATE INDEX "DiscountAllocation_tenantId_idx" ON "DiscountAllocation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountUsage_orderId_key" ON "DiscountUsage"("orderId");

-- CreateIndex
CREATE INDEX "DiscountUsage_discountId_createdAt_idx" ON "DiscountUsage"("discountId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscountUsage_tenantId_guestEmail_idx" ON "DiscountUsage"("tenantId", "guestEmail");

-- CreateIndex
CREATE INDEX "DiscountUsage_tenantId_discountId_idx" ON "DiscountUsage"("tenantId", "discountId");

-- CreateIndex
CREATE INDEX "DiscountEvent_discountId_createdAt_idx" ON "DiscountEvent"("discountId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscountEvent_tenantId_idx" ON "DiscountEvent"("tenantId");

-- AddForeignKey
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCode" ADD CONSTRAINT "DiscountCode_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCondition" ADD CONSTRAINT "DiscountCondition_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountAllocation" ADD CONSTRAINT "DiscountAllocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountAllocation" ADD CONSTRAINT "DiscountAllocation_orderLineItemId_fkey" FOREIGN KEY ("orderLineItemId") REFERENCES "OrderLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountAllocation" ADD CONSTRAINT "DiscountAllocation_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountUsage" ADD CONSTRAINT "DiscountUsage_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountUsage" ADD CONSTRAINT "DiscountUsage_discountCodeId_fkey" FOREIGN KEY ("discountCodeId") REFERENCES "DiscountCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountUsage" ADD CONSTRAINT "DiscountUsage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountEvent" ADD CONSTRAINT "DiscountEvent_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
