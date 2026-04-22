-- CreateEnum
CREATE TYPE "CompanyEventType" AS ENUM ('COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_ARCHIVED', 'COMPANY_UNARCHIVED', 'COMMENT_ADDED', 'MAIN_CONTACT_SET', 'LOCATION_CREATED', 'LOCATION_UPDATED', 'LOCATION_DELETED', 'CONTACT_ADDED', 'CONTACT_REMOVED', 'CONTACT_ROLE_CHANGED', 'CATALOG_ASSIGNED', 'CATALOG_UNASSIGNED', 'STORE_CREDIT_ISSUED');

-- CreateTable
CREATE TABLE "CompanyEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "CompanyEventType" NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyEvent_tenantId_companyId_idx" ON "CompanyEvent"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "CompanyEvent_tenantId_type_idx" ON "CompanyEvent"("tenantId", "type");

-- CreateIndex
CREATE INDEX "CompanyEvent_companyId_createdAt_idx" ON "CompanyEvent"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "CompanyEvent" ADD CONSTRAINT "CompanyEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEvent" ADD CONSTRAINT "CompanyEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
