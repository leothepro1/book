-- CreateEnum
CREATE TYPE "SeoPageType" AS ENUM ('HOMEPAGE', 'ACCOMMODATION', 'ACCOMMODATION_CATEGORY', 'ACCOMMODATION_INDEX', 'PRODUCT', 'PRODUCT_COLLECTION', 'PRODUCT_INDEX', 'PAGE', 'ARTICLE', 'BLOG', 'SEARCH', 'NOT_FOUND');

-- AlterTable
ALTER TABLE "Accommodation" ADD COLUMN     "seo" JSONB;

-- AlterTable
ALTER TABLE "AccommodationCategory" ADD COLUMN     "seo" JSONB;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "seo" JSONB;

-- AlterTable
ALTER TABLE "ProductCollection" ADD COLUMN     "seo" JSONB;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "seoDefaults" JSONB;

-- CreateTable
CREATE TABLE "PageTypeSeoDefault" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pageType" "SeoPageType" NOT NULL,
    "titlePattern" TEXT,
    "descriptionPattern" TEXT,
    "ogImagePattern" TEXT,
    "structuredDataEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PageTypeSeoDefault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoRedirect" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromPath" TEXT NOT NULL,
    "toPath" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 301,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoRedirect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PageTypeSeoDefault_tenantId_pageType_key" ON "PageTypeSeoDefault"("tenantId", "pageType");

-- CreateIndex
CREATE UNIQUE INDEX "SeoRedirect_tenantId_fromPath_key" ON "SeoRedirect"("tenantId", "fromPath");

-- AddForeignKey
ALTER TABLE "PageTypeSeoDefault" ADD CONSTRAINT "PageTypeSeoDefault_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoRedirect" ADD CONSTRAINT "SeoRedirect_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
