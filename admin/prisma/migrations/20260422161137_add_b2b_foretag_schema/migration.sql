-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TaxSetting" AS ENUM ('COLLECT', 'EXEMPT', 'COLLECT_UNLESS_EXEMPT');

-- CreateEnum
CREATE TYPE "CheckoutMode" AS ENUM ('AUTO_SUBMIT', 'DRAFT_FOR_REVIEW');

-- CreateEnum
CREATE TYPE "ContactRole" AS ENUM ('ORDERING_ONLY', 'LOCATION_ADMIN');

-- CreateEnum
CREATE TYPE "PaymentTermsType" AS ENUM ('DUE_ON_RECEIPT', 'DUE_ON_FULFILLMENT', 'NET', 'FIXED_DATE');

-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('ACTIVE', 'DRAFT');

-- CreateEnum
CREATE TYPE "StoreCreditReason" AS ENUM ('ADMIN_ISSUE', 'REFUND', 'ORDER_PAYMENT', 'EXPIRATION', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AccountRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "balanceAmountCents" BIGINT,
ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "companyLocationId" TEXT,
ADD COLUMN     "depositAmountCents" BIGINT,
ADD COLUMN     "depositPercent" INTEGER,
ADD COLUMN     "paymentDueAt" TIMESTAMP(3),
ADD COLUMN     "paymentTermsSnapshot" JSONB,
ADD COLUMN     "poNumber" TEXT,
ADD COLUMN     "sourceCheckoutMode" "CheckoutMode";

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalId" TEXT,
    "tags" TEXT[],
    "note" TEXT,
    "metafields" JSONB,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "orderingApproved" BOOLEAN NOT NULL DEFAULT true,
    "mainContactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyLocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalId" TEXT,
    "billingAddress" JSONB NOT NULL,
    "shippingAddress" JSONB,
    "taxId" TEXT,
    "taxIdValidated" BOOLEAN NOT NULL DEFAULT false,
    "taxSetting" "TaxSetting" NOT NULL DEFAULT 'COLLECT',
    "taxExemptions" TEXT[],
    "paymentTermsId" TEXT,
    "depositPercent" INTEGER NOT NULL DEFAULT 0,
    "creditLimitCents" BIGINT,
    "checkoutMode" "CheckoutMode" NOT NULL DEFAULT 'AUTO_SUBMIT',
    "allowOneTimeShippingAddress" BOOLEAN NOT NULL DEFAULT true,
    "storeCreditBalanceCents" BIGINT NOT NULL DEFAULT 0,
    "metafields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyLocationContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyLocationId" TEXT NOT NULL,
    "guestAccountId" TEXT NOT NULL,
    "role" "ContactRole" NOT NULL DEFAULT 'ORDERING_ONLY',
    "isMainContact" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyLocationContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTerms" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "type" "PaymentTermsType" NOT NULL,
    "netDays" INTEGER,
    "fixedDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTerms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Catalog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "overallAdjustmentPercent" DECIMAL(5,2),
    "includeAllProducts" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogFixedPrice" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "accommodationId" TEXT,
    "productVariantId" TEXT,
    "fixedPriceCents" BIGINT NOT NULL,

    CONSTRAINT "CatalogFixedPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogInclusion" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "accommodationId" TEXT,
    "productVariantId" TEXT,
    "collectionId" TEXT,

    CONSTRAINT "CatalogInclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogQuantityRule" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "accommodationId" TEXT,
    "productVariantId" TEXT,
    "minQuantity" INTEGER,
    "maxQuantity" INTEGER,
    "increment" INTEGER,
    "volumePricing" JSONB,

    CONSTRAINT "CatalogQuantityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyLocationCatalog" (
    "id" TEXT NOT NULL,
    "companyLocationId" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyLocationCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultedCard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyLocationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCustomerId" TEXT NOT NULL,
    "providerPaymentMethodId" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "expMonth" INTEGER NOT NULL,
    "expYear" INTEGER NOT NULL,
    "createdByGuestAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultedCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreCreditTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyLocationId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "reason" "StoreCreditReason" NOT NULL,
    "orderId" TEXT,
    "note" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreCreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAccountRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "submittedData" JSONB NOT NULL,
    "status" "AccountRequestStatus" NOT NULL DEFAULT 'PENDING',
    "companyId" TEXT,
    "companyLocationId" TEXT,
    "guestAccountId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyAccountRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Company_tenantId_status_idx" ON "Company"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Company_tenantId_orderingApproved_idx" ON "Company"("tenantId", "orderingApproved");

-- CreateIndex
CREATE UNIQUE INDEX "Company_tenantId_externalId_key" ON "Company"("tenantId", "externalId");

-- CreateIndex
CREATE INDEX "CompanyLocation_tenantId_companyId_idx" ON "CompanyLocation"("tenantId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyLocation_tenantId_companyId_externalId_key" ON "CompanyLocation"("tenantId", "companyId", "externalId");

-- CreateIndex
CREATE INDEX "CompanyLocationContact_guestAccountId_idx" ON "CompanyLocationContact"("guestAccountId");

-- CreateIndex
CREATE INDEX "CompanyLocationContact_tenantId_idx" ON "CompanyLocationContact"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyLocationContact_companyLocationId_guestAccountId_key" ON "CompanyLocationContact"("companyLocationId", "guestAccountId");

-- CreateIndex
CREATE INDEX "PaymentTerms_tenantId_idx" ON "PaymentTerms"("tenantId");

-- CreateIndex
CREATE INDEX "Catalog_tenantId_status_idx" ON "Catalog"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogFixedPrice_catalogId_accommodationId_key" ON "CatalogFixedPrice"("catalogId", "accommodationId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogFixedPrice_catalogId_productVariantId_key" ON "CatalogFixedPrice"("catalogId", "productVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogInclusion_catalogId_accommodationId_key" ON "CatalogInclusion"("catalogId", "accommodationId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogInclusion_catalogId_productVariantId_key" ON "CatalogInclusion"("catalogId", "productVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogInclusion_catalogId_collectionId_key" ON "CatalogInclusion"("catalogId", "collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyLocationCatalog_companyLocationId_catalogId_key" ON "CompanyLocationCatalog"("companyLocationId", "catalogId");

-- CreateIndex
CREATE INDEX "VaultedCard_companyLocationId_idx" ON "VaultedCard"("companyLocationId");

-- CreateIndex
CREATE INDEX "VaultedCard_tenantId_idx" ON "VaultedCard"("tenantId");

-- CreateIndex
CREATE INDEX "StoreCreditTransaction_companyLocationId_createdAt_idx" ON "StoreCreditTransaction"("companyLocationId", "createdAt");

-- CreateIndex
CREATE INDEX "StoreCreditTransaction_tenantId_idx" ON "StoreCreditTransaction"("tenantId");

-- CreateIndex
CREATE INDEX "CompanyAccountRequest_tenantId_status_idx" ON "CompanyAccountRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Order_companyLocationId_paymentDueAt_idx" ON "Order"("companyLocationId", "paymentDueAt");

-- CreateIndex
CREATE INDEX "Order_companyId_idx" ON "Order"("companyId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyLocation" ADD CONSTRAINT "CompanyLocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyLocation" ADD CONSTRAINT "CompanyLocation_paymentTermsId_fkey" FOREIGN KEY ("paymentTermsId") REFERENCES "PaymentTerms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyLocationContact" ADD CONSTRAINT "CompanyLocationContact_companyLocationId_fkey" FOREIGN KEY ("companyLocationId") REFERENCES "CompanyLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyLocationContact" ADD CONSTRAINT "CompanyLocationContact_guestAccountId_fkey" FOREIGN KEY ("guestAccountId") REFERENCES "GuestAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogFixedPrice" ADD CONSTRAINT "CatalogFixedPrice_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogInclusion" ADD CONSTRAINT "CatalogInclusion_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogQuantityRule" ADD CONSTRAINT "CatalogQuantityRule_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyLocationCatalog" ADD CONSTRAINT "CompanyLocationCatalog_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial unique indexes (not expressible in Prisma DSL)
-- Enforce uniqueness of (name) among system-default PaymentTerms rows (tenantId IS NULL).
-- Tenant-custom rows are intentionally unconstrained here; tenant-scoped uniqueness is an
-- application-layer concern (will be added in FAS 2 when PaymentTerms CRUD ships).
CREATE UNIQUE INDEX "PaymentTerms_name_system_default_key"
  ON "PaymentTerms" ("name")
  WHERE "tenantId" IS NULL;
