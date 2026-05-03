/*
  Loader hardening Phase 2 — backfill `Tenant.settings -> 'analyticsSalt'`.

  Phase 1 (PR #28) made `analyticsSalt` optional on the type and added it
  on the create-paths (Clerk webhook, dev-seed scripts). Pre-Phase-1 tenant
  rows still lack the field; `getAnalyticsSalt` returns `undefined` for
  them and structured-logs `analytics.tenant_missing_salt`.

  This migration writes a fresh 32-hex-char salt to every Tenant row that
  is currently missing one (or has an invalid one), so Phase 3 can tighten
  the type to required and switch `getAnalyticsSalt` to throw on absence.

  Properties:
    - Idempotent. Re-running this migration on a backfilled DB is a no-op
      (WHERE clause finds no rows). Safe to replay if the verify-DO-block
      ever raises.
    - Schema-additive only. Tenant.settings remains `Json?`. No column
      added or dropped, no other key under `settings` is touched.
    - Per-row salt. `gen_random_bytes(16)` is VOLATILE — Postgres evaluates
      it once per row, so each tenant gets a unique salt.
    - Single transaction. Prisma wraps the migration file in a transaction
      automatically, so an exception in the verify-DO-block rolls back the
      UPDATE. No partial backfill state is ever committed.
    - Single-statement UPDATE. At Bedfront's current scale (Tenant table is
      O(10s) of rows) this is correct. If Tenant ever grows past ~10k rows,
      replace the UPDATE with a cursor-based batch loop (lock thrash and
      WAL volume become real concerns above that).

  Counterpart helper: `assertAnalyticsSaltPresent` in
  app/_lib/analytics/pipeline/tenant-settings.ts (Phase 3 will call it).
*/

-- 1. pgcrypto guard. The earlier B2B 3-layer migration already creates
--    this extension (20260422205624_b2b_3_layer_contacts/migration.sql:65);
--    `IF NOT EXISTS` makes the statement idempotent so this migration is
--    safe to apply against a fresh DB before that one runs in some
--    out-of-order replay scenario.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Backfill. Match every row where settings is NULL, or where
--    settings -> 'analyticsSalt' is absent / not a JSON string / shorter
--    than the 16-char minimum tolerance enforced by getAnalyticsSalt.
--    `jsonb_set` on COALESCE(settings, '{}') handles the NULL case in
--    one expression.
UPDATE "Tenant"
SET "settings" = jsonb_set(
  COALESCE("settings", '{}'::jsonb),
  '{analyticsSalt}',
  to_jsonb(encode(gen_random_bytes(16), 'hex'))
)
WHERE "settings" IS NULL
   OR "settings" -> 'analyticsSalt' IS NULL
   OR jsonb_typeof("settings" -> 'analyticsSalt') <> 'string'
   OR length("settings" ->> 'analyticsSalt') < 16;

-- 3. Verify. Raise if any Tenant row still lacks a valid salt — this
--    aborts the migration transaction (Prisma rolls back the UPDATE) so
--    the next attempt can re-run cleanly. The exception is the contract
--    Phase 3 relies on: post-backfill, every Tenant has a string salt of
--    length ≥ 16.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Tenant"
    WHERE "settings" ->> 'analyticsSalt' IS NULL
       OR length("settings" ->> 'analyticsSalt') < 16
  ) THEN
    RAISE EXCEPTION 'analytics salt backfill incomplete: Tenant row(s) still missing a valid analyticsSalt';
  END IF;
END $$;
