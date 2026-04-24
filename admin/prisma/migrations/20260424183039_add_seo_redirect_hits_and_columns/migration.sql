-- ============================================================================
-- M11.1a — SEO redirect infrastructure: schema changes
-- ============================================================================
-- Extends SeoRedirect with locale, hitCount, lastHitAt, updatedAt columns +
-- new indexes. Swaps the (tenantId, fromPath) unique for (tenantId, fromPath,
-- locale) so locale-prefixed redirects can coexist once M8 ships.
--
-- Adds SeoRedirectHit model: append-only per-redirect hit log for the cron
-- aggregator.
--
-- The baseline SeoRedirect table exists but has zero consumers in code
-- (confirmed via grep during M11 orientation). Backfilling `locale` with
-- the tenant's default locale is safe — every existing row (if any) would
-- correctly inherit the default-locale semantic.

-- ── SeoRedirect: add columns ────────────────────────────────────────────────

-- `locale` is NOT NULL — backfill from tenant default. Zero existing rows in
-- production means the backfill is a no-op but the DEFAULT clause guards any
-- dev/staging row that happens to exist.
ALTER TABLE "SeoRedirect"
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'sv',
  ADD COLUMN "hitCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastHitAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ── SeoRedirect: swap unique constraint ────────────────────────────────────

-- Old constraint: (tenantId, fromPath)
DROP INDEX "SeoRedirect_tenantId_fromPath_key";

-- New constraint: (tenantId, fromPath, locale) — carves the namespace so
-- /en/foo and /sv/foo can route independently once M8 lands.
CREATE UNIQUE INDEX "SeoRedirect_tenantId_fromPath_locale_key"
  ON "SeoRedirect"("tenantId", "fromPath", "locale");

-- ── SeoRedirect: new indexes ────────────────────────────────────────────────

-- Tenant-scoped scan for `cleanupRedirectsForDeletedEntity` +
-- admin UI "redirects pointing at this URL" lookups.
CREATE INDEX "SeoRedirect_tenantId_toPath_idx"
  ON "SeoRedirect"("tenantId", "toPath");

-- Tenant-scoped scan for admin list view (sort by recency).
CREATE INDEX "SeoRedirect_tenantId_createdAt_idx"
  ON "SeoRedirect"("tenantId", "createdAt");

-- ── SeoRedirectHit table ────────────────────────────────────────────────────

CREATE TABLE "SeoRedirectHit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "redirectId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoRedirectHit_pkey" PRIMARY KEY ("id")
);

-- Tenant + time scan for the aggregation cron's drain window.
CREATE INDEX "SeoRedirectHit_tenantId_occurredAt_idx"
  ON "SeoRedirectHit"("tenantId", "occurredAt");

-- redirectId scan for the roll-up group-by.
CREATE INDEX "SeoRedirectHit_redirectId_idx"
  ON "SeoRedirectHit"("redirectId");

-- FKs: cascade from Tenant (matches SeoRedirect convention) and from
-- SeoRedirect (redirect deleted → its hit log rows drop).
ALTER TABLE "SeoRedirectHit"
  ADD CONSTRAINT "SeoRedirectHit_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SeoRedirectHit"
  ADD CONSTRAINT "SeoRedirectHit_redirectId_fkey"
  FOREIGN KEY ("redirectId") REFERENCES "SeoRedirect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
