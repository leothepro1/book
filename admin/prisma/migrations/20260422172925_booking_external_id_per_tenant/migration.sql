-- Booking.externalId: global @unique → per-tenant @@unique([tenantId, externalId])
--
-- Why this migration exists:
--   Different tenants' PMS systems may legitimately reuse the same
--   externalId string in their own ID spaces. The global @unique
--   constraint was a latent tenant-isolation defect — it would have
--   caused cross-tenant collisions at scale (first insert wins, the
--   other tenant sees a unique-violation on a booking it rightfully
--   owns). The fix is to scope uniqueness to (tenantId, externalId).
--
-- Safety:
--   Dev DB audited before creating this migration — zero rows have
--   the same externalId across tenants, so the new composite index
--   creates cleanly. Production should run the same audit query
--   (SELECT externalId, COUNT(DISTINCT tenantId) FROM Booking WHERE
--   externalId IS NOT NULL GROUP BY externalId HAVING COUNT(DISTINCT
--   tenantId) > 1) before deploying.

-- DropIndex
DROP INDEX IF EXISTS "Booking_externalId_key";

-- Remove the old composite index — it becomes redundant with the
-- new unique constraint, which Postgres automatically indexes.
DROP INDEX IF EXISTS "Booking_tenantId_externalId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Booking_tenantId_externalId_key" ON "Booking"("tenantId", "externalId");
