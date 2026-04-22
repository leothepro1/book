-- CreateTable
CREATE TABLE "PmsOutboundJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "compensationAttempts" INTEGER NOT NULL DEFAULT 0,
    "compensationLastError" TEXT,
    "compensationLastAt" TIMESTAMP(3),
    "compensationNextRetryAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "deadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmsOutboundJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PmsOutboundJob_orderId_key" ON "PmsOutboundJob"("orderId");

-- CreateIndex
CREATE INDEX "PmsOutboundJob_status_nextRetryAt_idx" ON "PmsOutboundJob"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "PmsOutboundJob_status_compensationNextRetryAt_idx" ON "PmsOutboundJob"("status", "compensationNextRetryAt");

-- CreateIndex
CREATE INDEX "PmsOutboundJob_tenantId_status_idx" ON "PmsOutboundJob"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PmsOutboundJob_status_lastAttemptAt_idx" ON "PmsOutboundJob"("status", "lastAttemptAt");

-- CreateIndex
CREATE INDEX "PmsOutboundJob_status_compensationLastAt_idx" ON "PmsOutboundJob"("status", "compensationLastAt");

-- AddForeignKey
ALTER TABLE "PmsOutboundJob" ADD CONSTRAINT "PmsOutboundJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmsOutboundJob" ADD CONSTRAINT "PmsOutboundJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
