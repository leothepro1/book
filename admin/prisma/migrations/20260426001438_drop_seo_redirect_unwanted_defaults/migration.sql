-- Corrective migration: drop unwanted defaults on SeoRedirect.
--
-- The squash baseline (20260421151049_squash_to_baseline) created SeoRedirect
-- with DEFAULT 'sv' on `locale` and DEFAULT CURRENT_TIMESTAMP on `updatedAt`.
-- schema.prisma does not declare these defaults:
--   - `locale`    is intentionally required without default; callers must
--     pass tenant.defaultLocale explicitly.
--   - `updatedAt` uses Prisma's @updatedAt, which is application-managed
--     by the Prisma client. A SQL-side DEFAULT is never correct for
--     @updatedAt and was committed in error.
--
-- This migration is purely structural: no rows are touched. It eliminates
-- the drift detected by `prisma migrate diff --from-migrations
-- --to-schema-datamodel` so CI's drift check stays green.

ALTER TABLE "SeoRedirect" ALTER COLUMN "locale" DROP DEFAULT;
ALTER TABLE "SeoRedirect" ALTER COLUMN "updatedAt" DROP DEFAULT;
