-- CreateTable
CREATE TABLE "PmsIdempotencyKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_FLIGHT',
    "resultJson" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmsIdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PmsIdempotencyKey_key_key" ON "PmsIdempotencyKey"("key");

-- CreateIndex
CREATE INDEX "PmsIdempotencyKey_tenantId_firstSeenAt_idx" ON "PmsIdempotencyKey"("tenantId", "firstSeenAt");

-- CreateIndex
CREATE INDEX "PmsIdempotencyKey_status_firstSeenAt_idx" ON "PmsIdempotencyKey"("status", "firstSeenAt");

-- AddForeignKey
ALTER TABLE "PmsIdempotencyKey" ADD CONSTRAINT "PmsIdempotencyKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
