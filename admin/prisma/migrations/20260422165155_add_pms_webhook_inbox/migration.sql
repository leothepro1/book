-- CreateTable
CREATE TABLE "PmsWebhookInbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "externalBookingId" TEXT,
    "eventType" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "deadAt" TIMESTAMP(3),

    CONSTRAINT "PmsWebhookInbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PmsWebhookInbox_tenantId_status_idx" ON "PmsWebhookInbox"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PmsWebhookInbox_status_nextRetryAt_idx" ON "PmsWebhookInbox"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "PmsWebhookInbox_receivedAt_idx" ON "PmsWebhookInbox"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PmsWebhookInbox_provider_externalEventId_key" ON "PmsWebhookInbox"("provider", "externalEventId");

-- AddForeignKey
ALTER TABLE "PmsWebhookInbox" ADD CONSTRAINT "PmsWebhookInbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
