-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "providerUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TenantIntegration" ADD COLUMN     "reconciliationEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ReconciliationCursor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "cursor" TEXT,
    "completedAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReconciliationCursor_lastRunAt_idx" ON "ReconciliationCursor"("lastRunAt");

-- CreateIndex
CREATE INDEX "ReconciliationCursor_tier_lastRunAt_idx" ON "ReconciliationCursor"("tier", "lastRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationCursor_tenantId_provider_tier_key" ON "ReconciliationCursor"("tenantId", "provider", "tier");

-- CreateIndex
CREATE INDEX "Booking_tenantId_providerUpdatedAt_idx" ON "Booking"("tenantId", "providerUpdatedAt");

-- CreateIndex
CREATE INDEX "TenantIntegration_reconciliationEnabled_status_idx" ON "TenantIntegration"("reconciliationEnabled", "status");
