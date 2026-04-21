-- Drop old tables (v1)
DROP TABLE IF EXISTS "RumEvent";
DROP TABLE IF EXISTS "RumDailyAggregate";

-- RumEvent v2
CREATE TABLE "RumEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lcp" DOUBLE PRECISION,
    "inp" DOUBLE PRECISION,
    "cls" DOUBLE PRECISION,
    "sessionId" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "isHardReload" BOOLEAN NOT NULL,
    "connection" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RumEvent_pkey" PRIMARY KEY ("id")
);

-- RumRateLimit
CREATE TABLE "RumRateLimit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RumRateLimit_pkey" PRIMARY KEY ("id")
);

-- RumDailyAggregate v2 (same schema, recreated)
CREATE TABLE "RumDailyAggregate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "sessionsDesktop" INTEGER NOT NULL DEFAULT 0,
    "sessionsMobile" INTEGER NOT NULL DEFAULT 0,
    "sessionsTablet" INTEGER NOT NULL DEFAULT 0,
    "sessionsOther" INTEGER NOT NULL DEFAULT 0,
    "lcpP75" DOUBLE PRECISION,
    "lcpGoodCount" INTEGER NOT NULL DEFAULT 0,
    "lcpNeedsWork" INTEGER NOT NULL DEFAULT 0,
    "lcpPoor" INTEGER NOT NULL DEFAULT 0,
    "lcpCount" INTEGER NOT NULL DEFAULT 0,
    "inpP75" DOUBLE PRECISION,
    "inpGoodCount" INTEGER NOT NULL DEFAULT 0,
    "inpNeedsWork" INTEGER NOT NULL DEFAULT 0,
    "inpPoor" INTEGER NOT NULL DEFAULT 0,
    "inpCount" INTEGER NOT NULL DEFAULT 0,
    "clsP75" DOUBLE PRECISION,
    "clsGoodCount" INTEGER NOT NULL DEFAULT 0,
    "clsNeedsWork" INTEGER NOT NULL DEFAULT 0,
    "clsPoor" INTEGER NOT NULL DEFAULT 0,
    "clsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RumDailyAggregate_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "RumEvent_tenantId_createdAt_idx" ON "RumEvent"("tenantId", "createdAt");
CREATE INDEX "RumEvent_tenantId_sessionId_idx" ON "RumEvent"("tenantId", "sessionId");
CREATE INDEX "RumEvent_tenantId_deviceType_createdAt_idx" ON "RumEvent"("tenantId", "deviceType", "createdAt");
CREATE UNIQUE INDEX "RumRateLimit_tenantId_key" ON "RumRateLimit"("tenantId");
CREATE INDEX "RumRateLimit_tenantId_idx" ON "RumRateLimit"("tenantId");
CREATE UNIQUE INDEX "RumDailyAggregate_tenantId_date_key" ON "RumDailyAggregate"("tenantId", "date");
CREATE INDEX "RumDailyAggregate_tenantId_date_idx" ON "RumDailyAggregate"("tenantId", "date");

-- Foreign keys
ALTER TABLE "RumEvent" ADD CONSTRAINT "RumEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RumDailyAggregate" ADD CONSTRAINT "RumDailyAggregate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
