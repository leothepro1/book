-- CreateEnum
CREATE TYPE "AnalyticsEventType" AS ENUM ('SESSION_STARTED', 'PAGE_VIEWED', 'SESSION_ENDED', 'SEARCH_PERFORMED', 'ACCOMMODATION_VIEWED', 'RATE_PLAN_SELECTED', 'PRODUCT_VIEWED', 'ADDON_VIEWED', 'ADDON_ADDED', 'ADDON_REMOVED', 'CHECKOUT_STARTED', 'CHECKOUT_COMPLETED', 'CHECKOUT_ABANDONED', 'ORDER_CREATED', 'ORDER_PAID', 'ORDER_CANCELLED', 'ORDER_REFUNDED');

CREATE TYPE "AnalyticsMetric" AS ENUM ('REVENUE', 'SESSIONS', 'VISITORS', 'ORDERS', 'AVERAGE_ORDER_VALUE', 'RETURNING_CUSTOMER_RATE');

CREATE TYPE "AnalyticsDimension" AS ENUM ('TOTAL', 'CHANNEL', 'CITY', 'DEVICE', 'PRODUCT');

CREATE TYPE "DeviceType" AS ENUM ('DESKTOP', 'MOBILE', 'TABLET');

-- CreateTable
CREATE TABLE "AnalyticsLocation" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "AnalyticsLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "eventType" "AnalyticsEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "page" TEXT,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "deviceType" "DeviceType" NOT NULL DEFAULT 'DESKTOP',
    "locationId" TEXT,
    "payload" JSONB,
    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalyticsDailyMetric" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "metric" "AnalyticsMetric" NOT NULL,
    "dimension" "AnalyticsDimension" NOT NULL,
    "dimensionValue" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    CONSTRAINT "AnalyticsDailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsLocation_country_city_key" ON "AnalyticsLocation"("country", "city");
CREATE INDEX "AnalyticsLocation_country_idx" ON "AnalyticsLocation"("country");

CREATE INDEX "AnalyticsEvent_tenantId_idx" ON "AnalyticsEvent"("tenantId");
CREATE INDEX "AnalyticsEvent_tenantId_eventType_idx" ON "AnalyticsEvent"("tenantId", "eventType");
CREATE INDEX "AnalyticsEvent_tenantId_sessionId_idx" ON "AnalyticsEvent"("tenantId", "sessionId");
CREATE INDEX "AnalyticsEvent_tenantId_visitorId_idx" ON "AnalyticsEvent"("tenantId", "visitorId");
CREATE INDEX "AnalyticsEvent_tenantId_occurredAt_idx" ON "AnalyticsEvent"("tenantId", "occurredAt");
CREATE INDEX "AnalyticsEvent_tenantId_occurredAt_eventType_idx" ON "AnalyticsEvent"("tenantId", "occurredAt", "eventType");

CREATE UNIQUE INDEX "AnalyticsDailyMetric_tenantId_date_metric_dimension_dimensi_key" ON "AnalyticsDailyMetric"("tenantId", "date", "metric", "dimension", "dimensionValue");
CREATE INDEX "AnalyticsDailyMetric_tenantId_date_idx" ON "AnalyticsDailyMetric"("tenantId", "date");
CREATE INDEX "AnalyticsDailyMetric_tenantId_metric_date_idx" ON "AnalyticsDailyMetric"("tenantId", "metric", "date");
CREATE INDEX "AnalyticsDailyMetric_tenantId_dimension_date_idx" ON "AnalyticsDailyMetric"("tenantId", "dimension", "date");

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "AnalyticsLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalyticsDailyMetric" ADD CONSTRAINT "AnalyticsDailyMetric_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
