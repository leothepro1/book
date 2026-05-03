# Analytics loader hardening — runbook

This is the operator-facing runbook for the three-phase loader hardening
work that locks down `user_agent_hash` salting and the SSR-injected
`window.__bedfront_analytics_salt`. The phases ship as separate PRs so
each can soak in production before the next tightens the contract.

> **Tier 1 — storefront read path.** Any change in this area is governed
> by the `docs/analytics/tiers.md` Tier 1 budget: zero downtime, zero
> 5xx regressions on the storefront.

## Phase summary

| Phase | What changes | Status before | Status after |
|-------|--------------|---------------|--------------|
| 1 | `analyticsSalt` becomes optional on `Tenant.settings`. New tenant rows mint a salt at create time (Clerk webhook + dev-seed scripts). SSR injects the salt into `window`. The loader reads it and salts `user_agent_hash`. | Field absent everywhere; `user_agent_hash` unsalted across tenants. | New tenants salted. Pre-existing tenants log `analytics.tenant_missing_salt` on every read. |
| 2 | Backfill migration writes a fresh 32-hex salt onto every Tenant row that is missing one. New `assertAnalyticsSaltPresent` helper added (Phase 3 entry point) but not yet wired into callers. | Pre-existing tenants log every storefront read. | Every Tenant row has a valid salt. Type stays `string \| undefined` for one more soak. |
| 3 | Type tightens to `analyticsSalt: string` (required). Default callers switch from `getAnalyticsSalt` to `assertAnalyticsSaltPresent`; missing salt becomes a 500 instead of a silent unsalted emit. | Type optional, soft fallback. | Type required. Data-integrity bug surfaces as a 500 on the affected tenant. |

The phase boundary is deliberate: between Phase 2 and Phase 3 we want a
soak period with `analytics.tenant_missing_salt` at zero in production
telemetry. Skipping the soak means the Phase 3 throw can fire on a tenant
nobody knew about.

## Phase 2 — what just shipped

- Migration: `prisma/migrations/20260503134853_analytics_backfill_tenant_salt`.
  Idempotent. Single transaction. Per-row salt via `gen_random_bytes(16)`.
  Ends with a `DO`-block that aborts the transaction if any row remains
  without a valid salt.
- Helper: `assertAnalyticsSaltPresent(tenant)` in
  `app/_lib/analytics/pipeline/tenant-settings.ts`. Throws
  `analytics salt missing post-backfill — Phase 3 invariant violated; tenantId=X`
  on absence. Currently unwired — Phase 3 swaps default callers.
- Audit script: `npm run analytics:audit-salt`. Emits a structured
  `analytics.salt_backfill_complete` (or `_incomplete`) log with tenant
  counts. Wire to alerting on `_incomplete`.
- Verifier: `npm run verify:loader-phase2`. Static checks confirming the
  migration and helper landed as specified. Phase 1 verifier
  (`npm run verify:loader-phase1`) must still pass.

## Operational procedures

### Run the verifiers locally

```bash
cd admin
npm run verify:loader-phase1   # 29 checks — must stay green
npm run verify:loader-phase2   # 11 checks — gate for Phase 2 PRs
```

Both run static checks plus the relevant vitest suites. Neither talks to
the DB; they work offline.

### Audit the live DB

```bash
cd admin
npm run analytics:audit-salt
```

Reads `DATABASE_URL` from `.env`. Connects via the application's Prisma
singleton (no new pool). Exit codes: `0` — all rows valid; `1` — at
least one row missing a valid salt; `2` — query failed. The structured
log is the source of truth — pipe to your log shipper for alerts.

### Re-run the migration after a verify-DO-block raise

The DO-block at the end of the migration aborts the transaction if
backfill is incomplete. Prisma rolls back the UPDATE — the DB is left
in the pre-migration state. Re-running is safe:

```bash
cd admin
npx prisma migrate resolve --rolled-back 20260503134853_analytics_backfill_tenant_salt
npx prisma migrate dev
```

The migration is idempotent: the WHERE clause skips rows that already
have a valid salt, so a second apply only touches rows that the first
attempt failed on (e.g. a row inserted concurrently with malformed
settings).

### Manual rollback (Phase 2 only)

We do **not** ship a reverse migration — Phase 3 depends on Phase 2's
side-effect. If you need to roll back for a forensic reason (e.g. a
Phase 1 test tenant was dirtied by the backfill and needs its old
state), the SQL is:

```sql
-- WARNING: Strip analyticsSalt from every Tenant row. Only run in dev or
-- after a snapshot. Do not run in production unless you also intend to
-- revert the Phase 1 type changes — without a salt the storefront emits
-- unsalted user_agent_hash values across tenants.
UPDATE "Tenant"
SET "settings" = "settings" - 'analyticsSalt'
WHERE "settings" ? 'analyticsSalt';
```

If you only need to reset a single tenant, scope the WHERE:

```sql
UPDATE "Tenant"
SET "settings" = "settings" - 'analyticsSalt'
WHERE id = 'tenant_xxx';
```

Re-running `npx prisma migrate dev` after a manual strip rebackfills the
affected rows. The audit script confirms the post-state.

### What if a Tenant row is created during the migration?

Prisma migrations run in a single transaction, so concurrent writes
either commit before the UPDATE (and are ignored — the new row already
has its mint-time salt from the application's create path) or after
(and are unaffected because the UPDATE has already committed). The
DO-block re-checks under transactional snapshot, so a row inserted
between the UPDATE and the DO-block is invisible to the assertion.
That's fine — the application path already ensures new rows have a
salt, and the next migration replay would catch any drift.

## Invariants — never violate

1. The migration's DO-block must run last and must `RAISE EXCEPTION` on
   any remaining null/short salt. Removing it removes the only
   transactional safety net for partial backfill.
2. The migration must not touch any `Tenant.settings` key other than
   `analyticsSalt`. The UPDATE expression uses `jsonb_set` precisely so
   sibling keys are preserved.
3. `assertAnalyticsSaltPresent` must throw the exact message
   `analytics salt missing post-backfill — Phase 3 invariant violated;
   tenantId=${tenantId}`. Phase 3 callers and ops dashboards grep on
   the prefix.
4. `getAnalyticsSalt` must remain soft (no throw) until Phase 3. The
   Phase 1 verifier asserts this; do not "unify" the two helpers
   prematurely.
5. The audit script must emit via the platform `log()` helper, not
   `console.log`. The structured event is what alerts hook on.
