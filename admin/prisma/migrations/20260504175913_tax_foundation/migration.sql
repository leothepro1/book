-- CreateEnum
CREATE TYPE "TaxRegistrationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TaxCollectMode" AS ENUM ('COLLECT', 'DO_NOT_COLLECT', 'COLLECT_UNLESS_EXEMPT');

-- CreateTable
CREATE TABLE "TaxLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderLineItemId" TEXT,
    "draftLineItemId" TEXT,
    "title" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "rate" DECIMAL(7,6) NOT NULL,
    "taxableAmountCents" BIGINT NOT NULL,
    "taxAmountCents" BIGINT NOT NULL,
    "presentmentTaxAmountCents" BIGINT NOT NULL,
    "presentmentCurrency" TEXT NOT NULL DEFAULT 'SEK',
    "source" TEXT NOT NULL,
    "channelLiable" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRegistration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "region" TEXT,
    "registrationNumber" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "status" "TaxRegistrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "TaxRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyLocationTaxSettings" (
    "companyLocationId" TEXT NOT NULL,
    "taxRegistrationId" TEXT,
    "collectMode" "TaxCollectMode" NOT NULL DEFAULT 'COLLECT',
    "taxExemptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vatNumber" TEXT,
    "vatNumberValidatedAt" TIMESTAMP(3),
    "vatNumberValid" BOOLEAN,

    CONSTRAINT "CompanyLocationTaxSettings_pkey" PRIMARY KEY ("companyLocationId")
);

-- CreateTable
CREATE TABLE "TenantTaxConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "regionScope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "providerKey" TEXT NOT NULL DEFAULT 'builtin',
    "credentials" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TenantTaxConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxLine_tenantId_jurisdiction_idx" ON "TaxLine"("tenantId", "jurisdiction");

-- CreateIndex
CREATE INDEX "TaxLine_orderLineItemId_idx" ON "TaxLine"("orderLineItemId");

-- CreateIndex
CREATE INDEX "TaxLine_draftLineItemId_idx" ON "TaxLine"("draftLineItemId");

-- CreateIndex
CREATE INDEX "TaxRegistration_tenantId_idx" ON "TaxRegistration"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRegistration_tenantId_countryCode_region_key" ON "TaxRegistration"("tenantId", "countryCode", "region");

-- CreateIndex
CREATE INDEX "TenantTaxConfig_tenantId_idx" ON "TenantTaxConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantTaxConfig_tenantId_regionScope_key" ON "TenantTaxConfig"("tenantId", "regionScope");

