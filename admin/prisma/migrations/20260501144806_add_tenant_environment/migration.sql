-- Phase 3.5 — Tenant.environment field for staging-vs-production
-- isolation. Phase 5+ aggregations filter on this. Fully additive
-- migration: no DROP, no NULL→NOT NULL without default, no data
-- migration needed (default value 'production' covers all existing
-- rows).
--
-- Generated via:
--   npx prisma migrate diff --from-migrations prisma/migrations \
--     --to-schema-datamodel prisma/schema.prisma --script \
--     --shadow-database-url "$DIRECT_URL"
--
-- See app/_lib/analytics/pipeline/environment.ts for the helper this
-- enables, and docs/analytics/phase3-5-staging-setup.md for the
-- staging-tenant provisioning procedure.

-- CreateEnum
CREATE TYPE "TenantEnvironment" AS ENUM ('production', 'staging');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "environment" "TenantEnvironment" NOT NULL DEFAULT 'production';

-- CreateIndex
CREATE INDEX "Tenant_environment_idx" ON "Tenant"("environment");
