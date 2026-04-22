/*
  FAS 5.5 — Refactor from 2-layer to 3-layer B2B contact model.
    Before: Company → CompanyLocation ← CompanyLocationContact
    After:  Company ← CompanyContact ← CompanyLocationAccess → CompanyLocation

  Order of operations:
    1. Create new tables (CompanyContact, CompanyLocationAccess) + indexes + FKs.
    2. Backfill data from CompanyLocationContact.
    3. Drop old table (CompanyLocationContact) and enum (ContactRole).
    4. Add partial unique index enforcing one main-contact per company.
*/

-- ── 1. Create new tables ──────────────────────────────────────

CREATE TABLE "CompanyContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "guestAccountId" TEXT NOT NULL,
    "isMainContact" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyLocationAccess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyContactId" TEXT NOT NULL,
    "companyLocationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyLocationAccess_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompanyContact_tenantId_companyId_idx" ON "CompanyContact"("tenantId", "companyId");
CREATE INDEX "CompanyContact_guestAccountId_idx" ON "CompanyContact"("guestAccountId");
CREATE UNIQUE INDEX "CompanyContact_companyId_guestAccountId_key" ON "CompanyContact"("companyId", "guestAccountId");

CREATE INDEX "CompanyLocationAccess_companyLocationId_idx" ON "CompanyLocationAccess"("companyLocationId");
CREATE INDEX "CompanyLocationAccess_tenantId_idx" ON "CompanyLocationAccess"("tenantId");
CREATE UNIQUE INDEX "CompanyLocationAccess_companyContactId_companyLocationId_key" ON "CompanyLocationAccess"("companyContactId", "companyLocationId");

ALTER TABLE "CompanyContact" ADD CONSTRAINT "CompanyContact_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyContact" ADD CONSTRAINT "CompanyContact_guestAccountId_fkey"
    FOREIGN KEY ("guestAccountId") REFERENCES "GuestAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyLocationAccess" ADD CONSTRAINT "CompanyLocationAccess_companyContactId_fkey"
    FOREIGN KEY ("companyContactId") REFERENCES "CompanyContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyLocationAccess" ADD CONSTRAINT "CompanyLocationAccess_companyLocationId_fkey"
    FOREIGN KEY ("companyLocationId") REFERENCES "CompanyLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 2. Data migration ─────────────────────────────────────────
-- For each existing CompanyLocationContact row, create a CompanyContact
-- (dedup per (companyId, guestAccountId)) and a CompanyLocationAccess row
-- linking that contact to the original location.
--
-- Uses deterministic cuid-shaped IDs via gen_random_bytes (pgcrypto). Safe
-- to run against empty tables — no-ops out gracefully.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2a. Insert dedup'd CompanyContact rows, promoting isMainContact if ANY
--     source row for this (company, guest) was main.
INSERT INTO "CompanyContact" (
  "id", "tenantId", "companyId", "guestAccountId",
  "isMainContact", "createdAt", "updatedAt"
)
SELECT
  'clm' || encode(gen_random_bytes(12), 'hex'),
  agg.tenant_id,
  agg.company_id,
  agg.guest_account_id,
  agg.is_main,
  agg.created_at,
  agg.created_at
FROM (
  SELECT
    cl."companyId"       AS company_id,
    clc."guestAccountId" AS guest_account_id,
    clc."tenantId"       AS tenant_id,
    BOOL_OR(clc."isMainContact") AS is_main,
    MIN(clc."createdAt")         AS created_at
  FROM "CompanyLocationContact" clc
  JOIN "CompanyLocation" cl ON cl."id" = clc."companyLocationId"
  GROUP BY cl."companyId", clc."guestAccountId", clc."tenantId"
) agg;

-- 2b. Create one CompanyLocationAccess row per original
--     CompanyLocationContact, linking the new CompanyContact.
INSERT INTO "CompanyLocationAccess" (
  "id", "tenantId", "companyContactId", "companyLocationId", "createdAt"
)
SELECT
  'cla' || encode(gen_random_bytes(12), 'hex'),
  clc."tenantId",
  cc."id",
  clc."companyLocationId",
  clc."createdAt"
FROM "CompanyLocationContact" clc
JOIN "CompanyLocation" cl ON cl."id" = clc."companyLocationId"
JOIN "CompanyContact" cc
  ON cc."companyId"      = cl."companyId"
 AND cc."guestAccountId" = clc."guestAccountId";

-- 2c. Rewire Company.mainContactId — it used to point at a
--     CompanyLocationContact.id; now it must point at the
--     CompanyContact.id for the (company, guest) pair whose corresponding
--     CLC row had isMainContact=true. Loose FK — no constraint to update,
--     just a value rewrite.
UPDATE "Company" co
SET "mainContactId" = cc."id"
FROM "CompanyContact" cc
WHERE cc."companyId" = co."id"
  AND cc."isMainContact" = TRUE;

-- Any Company whose old mainContactId did not resolve via the CLC rows gets
-- mainContactId = NULL (defensive — unreachable if data was consistent).
UPDATE "Company"
SET "mainContactId" = NULL
WHERE "mainContactId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "CompanyContact" cc WHERE cc."id" = "Company"."mainContactId"
  );

-- ── 3. Drop the old model + enum ──────────────────────────────

ALTER TABLE "CompanyLocationContact" DROP CONSTRAINT "CompanyLocationContact_companyLocationId_fkey";
ALTER TABLE "CompanyLocationContact" DROP CONSTRAINT "CompanyLocationContact_guestAccountId_fkey";
DROP TABLE "CompanyLocationContact";
DROP TYPE "ContactRole";

-- ── 4. Partial unique index: one main contact per company ─────
-- Expresses the invariant "at most one CompanyContact per company may have
-- isMainContact = TRUE". Not expressible in Prisma DSL; enforced here.

CREATE UNIQUE INDEX "CompanyContact_companyId_mainContact_partial_key"
  ON "CompanyContact" ("companyId")
  WHERE "isMainContact" = TRUE;
