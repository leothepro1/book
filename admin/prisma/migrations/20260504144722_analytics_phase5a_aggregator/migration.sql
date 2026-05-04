-- ============================================================================
-- Phase 5A — analytics aggregator (write side)
-- ============================================================================
--
-- Adds `analytics.daily_metric` — pre-aggregated metric rows produced by the
-- new aggregator (`app/_lib/analytics/aggregation/aggregate-day*.ts`). Runs in
-- parallel with legacy `public.AnalyticsDailyMetric` during the Phase 5B
-- parity-validation window (~30 days). Phase 5C drops the legacy table after
-- production parity confirmed.
--
-- Pure additive migration: no DROP, no ALTER on legacy columns. Safe to roll
-- back by dropping the new table — nothing else references it yet.
--
-- Composite uniqueness `(tenant_id, date, metric, dimension, dimension_value)`
-- is the idempotency contract: aggregator upserts the same key when re-run for
-- the same (tenant, date) and produces deterministic output.

CREATE TABLE "analytics"."daily_metric" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "metric" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "dimension_value" TEXT NOT NULL,
    "value" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_metric_pkey" PRIMARY KEY ("id")
);

-- Idempotency: upsert key. (tenant_id, date, metric, dimension, dimension_value)
-- maps 1:1 to a single aggregated value. Re-running aggregateDay for the same
-- (tenant, date) collides on this constraint and applies an upsert, never a
-- duplicate insert.
CREATE UNIQUE INDEX "daily_metric_tenant_id_date_metric_dimension_dimension_valu_key"
    ON "analytics"."daily_metric"
    ("tenant_id", "date", "metric", "dimension", "dimension_value");

-- Dashboard read patterns (mirrors legacy AnalyticsDailyMetric indexes):
CREATE INDEX "daily_metric_tenant_id_date_idx"
    ON "analytics"."daily_metric" ("tenant_id", "date");

CREATE INDEX "daily_metric_tenant_id_metric_date_idx"
    ON "analytics"."daily_metric" ("tenant_id", "metric", "date");

CREATE INDEX "daily_metric_tenant_id_dimension_date_idx"
    ON "analytics"."daily_metric" ("tenant_id", "dimension", "date");

-- Phase 5A-specific covering index for the dashboard's (metric, dimension)
-- breakdown query in app/(admin)/analytics/dashboard/route.ts:63-64. Without
-- this, dropping legacy v1 in 5C would force a table-scan on those reads.
CREATE INDEX "daily_metric_tenant_id_date_metric_idx"
    ON "analytics"."daily_metric" ("tenant_id", "date", "metric");
