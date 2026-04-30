-- ============================================================================
-- Analytics pipeline foundation (Phase 0, commit B of B)
-- ============================================================================
--
-- Creates the `analytics` schema and three tables:
--   analytics.event          — partitioned by RANGE (occurred_at), monthly
--   analytics.outbox         — transactional outbox (drainer is Phase 1)
--   analytics.tenant_config  — per-tenant pipeline gating + retention policy
--
-- The legacy `public.AnalyticsEvent` table is untouched. Cutover is Phase ≥ 5.
--
-- DSL escape hatches handled below in raw SQL because Prisma cannot express:
--   1. PARTITION BY RANGE (...) on CREATE TABLE
--   2. Composite PRIMARY KEY required by Postgres on partitioned tables
--      (forced because the partition key must be part of every unique index)
--   3. CHECK constraints
--   4. Partial indexes (WHERE clauses)
--
-- Out of scope — Phase 9 (Reliability):
--   * A scheduled job that creates future monthly partitions ahead of time.
--     For now we ship 7 months of partitions plus a `event_default` DEFAULT
--     partition as the safety net. The default partition should never carry
--     rows in steady state — Phase 5+ alerting will page on rowcount > 0.
--   * Partition pruning / retention drop based on tenant_config.data_retention_days.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "analytics";

-- ----------------------------------------------------------------------------
-- analytics.event — partitioned table
-- ----------------------------------------------------------------------------

CREATE TABLE "analytics"."event" (
    "event_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlation_id" TEXT,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "payload" JSONB NOT NULL,
    "context" JSONB,

    CONSTRAINT "event_pkey" PRIMARY KEY ("event_id", "occurred_at")
) PARTITION BY RANGE ("occurred_at");

-- Monthly partitions: current month + 6 future months (7 total).
-- Phase 0 baseline as of 2026-04-30. Phase 9 cron will create future months.
CREATE TABLE "analytics"."event_2026_04" PARTITION OF "analytics"."event"
    FOR VALUES FROM ('2026-04-01 00:00:00') TO ('2026-05-01 00:00:00');
CREATE TABLE "analytics"."event_2026_05" PARTITION OF "analytics"."event"
    FOR VALUES FROM ('2026-05-01 00:00:00') TO ('2026-06-01 00:00:00');
CREATE TABLE "analytics"."event_2026_06" PARTITION OF "analytics"."event"
    FOR VALUES FROM ('2026-06-01 00:00:00') TO ('2026-07-01 00:00:00');
CREATE TABLE "analytics"."event_2026_07" PARTITION OF "analytics"."event"
    FOR VALUES FROM ('2026-07-01 00:00:00') TO ('2026-08-01 00:00:00');
CREATE TABLE "analytics"."event_2026_08" PARTITION OF "analytics"."event"
    FOR VALUES FROM ('2026-08-01 00:00:00') TO ('2026-09-01 00:00:00');
CREATE TABLE "analytics"."event_2026_09" PARTITION OF "analytics"."event"
    FOR VALUES FROM ('2026-09-01 00:00:00') TO ('2026-10-01 00:00:00');
CREATE TABLE "analytics"."event_2026_10" PARTITION OF "analytics"."event"
    FOR VALUES FROM ('2026-10-01 00:00:00') TO ('2026-11-01 00:00:00');

-- Safety-net DEFAULT partition. Catches rows whose occurred_at falls outside
-- every named range — should never happen in steady state. TODO(phase 5):
-- alert when this partition's rowcount > 0.
CREATE TABLE "analytics"."event_default" PARTITION OF "analytics"."event" DEFAULT;

-- ----------------------------------------------------------------------------
-- analytics.outbox — transactional outbox (small, drained continuously)
-- ----------------------------------------------------------------------------

CREATE TABLE "analytics"."outbox" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- ----------------------------------------------------------------------------
-- analytics.tenant_config — pipeline gating + retention
-- ----------------------------------------------------------------------------

CREATE TABLE "analytics"."tenant_config" (
    "tenant_id" TEXT NOT NULL,
    "pipeline_enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabled_at" TIMESTAMP(3),
    "data_retention_days" INTEGER NOT NULL DEFAULT 730,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_config_pkey" PRIMARY KEY ("tenant_id")
);

-- ----------------------------------------------------------------------------
-- Indexes (Prisma-generated; non-unique indexes propagate to partitions
--          automatically in Postgres 11+ via partitioned-index attachment)
-- ----------------------------------------------------------------------------

CREATE INDEX "event_tenant_id_occurred_at_idx"
    ON "analytics"."event" ("tenant_id", "occurred_at" DESC);

CREATE INDEX "event_tenant_id_event_name_occurred_at_idx"
    ON "analytics"."event" ("tenant_id", "event_name", "occurred_at" DESC);

CREATE UNIQUE INDEX "outbox_tenant_id_event_id_key"
    ON "analytics"."outbox" ("tenant_id", "event_id");

-- ----------------------------------------------------------------------------
-- Partial indexes (not expressible in Prisma DSL)
-- ----------------------------------------------------------------------------
--
-- Drainer hot-path index. Skips published rows entirely so the index stays
-- small as steady-state outbox volume grows. Phase 1's drainer queries:
--   SELECT ... FROM analytics.outbox
--    WHERE published_at IS NULL
--    ORDER BY created_at ASC
--    LIMIT N
-- This index covers that scan exactly.

CREATE INDEX "outbox_pending_idx"
    ON "analytics"."outbox" ("published_at", "created_at")
    WHERE "published_at" IS NULL;

-- ----------------------------------------------------------------------------
-- CHECK constraints (not expressible in Prisma DSL)
-- ----------------------------------------------------------------------------
--
-- Defense-in-depth: the Zod BaseEventSchema enforces these at the application
-- boundary. The DB enforces them at the row level so a buggy emitter or a
-- direct-SQL admin patch can't slip a malformed event past the contract.

-- analytics.event ------------------------------------------------------------

ALTER TABLE "analytics"."event"
    ADD CONSTRAINT "event_tenant_id_nonempty" CHECK ("tenant_id" <> '');
ALTER TABLE "analytics"."event"
    ADD CONSTRAINT "event_event_name_nonempty" CHECK ("event_name" <> '');
ALTER TABLE "analytics"."event"
    ADD CONSTRAINT "event_actor_type_enum"
    CHECK ("actor_type" IN ('guest', 'merchant', 'system', 'anonymous'));
ALTER TABLE "analytics"."event"
    ADD CONSTRAINT "event_actor_consistency" CHECK (
        ("actor_type" IN ('system', 'anonymous') AND "actor_id" IS NULL)
        OR
        ("actor_type" IN ('guest', 'merchant') AND "actor_id" IS NOT NULL AND "actor_id" <> '')
    );
ALTER TABLE "analytics"."event"
    ADD CONSTRAINT "event_schema_version_semver"
    CHECK ("schema_version" ~ '^[0-9]+\.[0-9]+\.[0-9]+$');

-- 60-second clock-skew tolerance, intentionally tight.
--
-- Rationale: occurred_at is set by the source domain (often the same Node
-- process that hits the DB), so legitimate skew should be sub-second. A 5-min
-- window would mask real bugs (clock-skew between server pods, race conditions
-- where a caller reuses a stale `new Date()`, replay attacks dating events
-- forward to bypass retention). 60s absorbs NTP drift and event-loop scheduling
-- jitter without becoming a free pass for forged timestamps.
--
-- Phase ≥ 5 will surface rejections via Sentry; pipeline backpressure should
-- never silently swallow them.
ALTER TABLE "analytics"."event"
    ADD CONSTRAINT "event_received_after_occurred"
    CHECK ("received_at" >= "occurred_at" - interval '60 seconds');

-- analytics.outbox -----------------------------------------------------------

ALTER TABLE "analytics"."outbox"
    ADD CONSTRAINT "outbox_tenant_id_nonempty" CHECK ("tenant_id" <> '');
ALTER TABLE "analytics"."outbox"
    ADD CONSTRAINT "outbox_event_name_nonempty" CHECK ("event_name" <> '');
ALTER TABLE "analytics"."outbox"
    ADD CONSTRAINT "outbox_actor_type_enum"
    CHECK ("actor_type" IN ('guest', 'merchant', 'system', 'anonymous'));
ALTER TABLE "analytics"."outbox"
    ADD CONSTRAINT "outbox_actor_consistency" CHECK (
        ("actor_type" IN ('system', 'anonymous') AND "actor_id" IS NULL)
        OR
        ("actor_type" IN ('guest', 'merchant') AND "actor_id" IS NOT NULL AND "actor_id" <> '')
    );
ALTER TABLE "analytics"."outbox"
    ADD CONSTRAINT "outbox_failed_count_nonnegative" CHECK ("failed_count" >= 0);

-- analytics.tenant_config ----------------------------------------------------

ALTER TABLE "analytics"."tenant_config"
    ADD CONSTRAINT "tenant_config_tenant_id_nonempty" CHECK ("tenant_id" <> '');
ALTER TABLE "analytics"."tenant_config"
    ADD CONSTRAINT "tenant_config_data_retention_positive"
    CHECK ("data_retention_days" > 0);
ALTER TABLE "analytics"."tenant_config"
    ADD CONSTRAINT "tenant_config_enabled_at_consistency" CHECK (
        ("pipeline_enabled" = true AND "enabled_at" IS NOT NULL)
        OR
        ("pipeline_enabled" = false)
    );
