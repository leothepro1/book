# Database restore — recovering data into Neon

This runbook covers restoring data into Neon after a corruption, bad
deploy, or customer-data-loss incident. Three scenarios, each with
a decision rule for when to use it.

For switching the _app_ back to Render (different concern — not a
data restore), see `db-rollback-to-render.md`. For how backups are
produced, see `db-backup.md`.

## Decision tree — which scenario?

We are on **Neon Scale plan → 30-day PITR window**.

```
Did you catch the issue within the last 30 days?
├── YES → Scenario A: PITR via Neon console (branch at past time)
│        Fastest, zero downtime, no data loss beyond the restore point
│
└── NO  → Does the issue affect just one table or one tenant's data?
         ├── YES → Scenario C: Single-table restore from R2 dump
         └── NO  → Scenario B: Full DB restore from R2 dump
```

Rule of thumb: **prefer Neon PITR** (Scenario A) when the time window
allows. It takes seconds, creates no side effects, and is fully
reversible.

> **Historical note:** Before upgrading to Scale we were on Launch
> (7-day PITR). Runbooks prior to 2026-04 may reference the shorter
> window; the current operational window is 30 days.

---

## Scenario A — PITR via Neon Console

### When to use

- Incident happened within our 30-day Scale-plan retention window
- You know the approximate timestamp of the "last known good" state
- The entire DB should return to that moment (for tenant-scoped
  issues use Scenario C instead)

### How it works

Neon's PITR creates a new branch from the WAL state at a target
timestamp, then swaps the compute endpoint over to that branch so
the connection string remains stable. The original branch is
preserved as a "safety net" — nothing is destroyed.

### Steps

1. **Freeze writes.** We don't have a dedicated maintenance mode
   today (TODO: implement a true maintenance mode endpoint/flag as
   a separate bug). Fastest interim options, in order of preference:

   1. Set Vercel env var `MAINTENANCE_MODE=1` via Vercel dashboard,
      trigger redeploy (~2 min). Requires that app code checks this
      flag — currently it does NOT, so this option only works
      after the maintenance-mode bug is shipped.
   2. In Vercel dashboard → Deployments → Production alias → disable.
      Traffic 404s immediately. No app changes required, works today.
   3. Worst case: push a commit to `main` that makes `middleware.ts`
      return 503 for all non-static requests. ~3 min from commit to
      live.

   Goal: no new writes to the DB during the restore window.

2. **Identify target timestamp.**
   - Sentry: when did errors start?
   - Git log: when was the offending deploy?
   - Support ticket: when did the customer report the issue?
   - Pick 5 minutes before the earliest "bad" signal.

3. **Trigger PITR via Neon Console:**
   - https://console.neon.tech → project `bedfront` → **Backup &
     Restore** (or **Branches** → main branch → kebab menu → Restore)
   - Choose **Point-in-time restore**
   - Enter the target timestamp (UTC)
   - Confirm

4. **Wait for swap.** ~1 second regardless of DB size. The connection
   string does not change — Vercel does not need a redeploy.

5. **Verify.** Run a few sanity queries:
   ```sql
   SELECT COUNT(*) FROM "Tenant";
   SELECT COUNT(*) FROM "Order";
   SELECT MAX("createdAt") FROM "Order";
   ```
   `MAX(createdAt)` should be ≤ target timestamp.

6. **Un-freeze writes.** Re-enable the production deployment in
   Vercel.

7. **Communicate.** Customer-facing: "We restored to <timestamp>,
   actions between <timestamp> and now may need to be re-done."
   Internal: Sentry/Slack post-mortem.

### Rollback of the PITR itself

If the PITR was wrong (went too far back, took data you wanted to
keep), restore again to a more recent timestamp. Neon preserves the
pre-restore branch as `<name>_old_<timestamp>` — you can inspect
it before deciding.

### Costs / side effects

- Free: no extra cost — PITR is included in plan pricing
- No impact on other Neon branches (dev, previews)
- Post-restore: the old main branch lingers as a safety-net branch.
  Delete it from Neon Console after 1–2 weeks once you're confident
  the restore was correct. Otherwise it keeps accruing WAL storage.

---

## Scenario B — Full DB restore from R2 dump

### When to use

- Incident is older than Neon's PITR window (>7 / 30 days)
- The entire DB needs to go back to a known-good dump
- Neon itself is unreachable (see also `db-rollback-to-render.md`)
- You are rebuilding on a fresh Postgres (different provider,
  disaster recovery)

### Prerequisites

- Local `psql` and `pg_restore` installed (PG 18 client recommended,
  see `db-backup.md` for install steps)
- `aws` CLI v2 installed
- R2 credentials available locally (copy from GitHub secrets or your
  1Password / secure store):
  ```bash
  export AWS_ACCESS_KEY_ID=...
  export AWS_SECRET_ACCESS_KEY=...
  export AWS_DEFAULT_REGION=auto
  export AWS_EC2_METADATA_DISABLED=true
  export R2_ENDPOINT="https://09ab42c3610c3ec377e09db1c2e27c1f.r2.cloudflarestorage.com"
  export R2_BUCKET=booking
  ```

### Steps

1. **Freeze writes** as in Scenario A.

2. **List available backups:**
   ```bash
   aws s3 ls "s3://${R2_BUCKET}/nightly/" \
     --endpoint-url "$R2_ENDPOINT" --recursive | tail -20
   ```

3. **Download the target backup:**
   ```bash
   aws s3 cp "s3://${R2_BUCKET}/nightly/2026-04-22/backup-...dump" \
     /tmp/restore.dump \
     --endpoint-url "$R2_ENDPOINT"
   ```

4. **Verify the dump before touching the target DB:**
   ```bash
   pg_restore --list /tmp/restore.dump | head -20
   pg_restore --list /tmp/restore.dump | grep -c "TABLE DATA"
   ```
   Expect >100 TOC entries, ~90+ TABLE DATA entries.

5. **Choose a restore target:**

   **Option 5a — Restore to a new Neon branch (recommended, non-destructive):**
   ```bash
   # Via Neon Console: Branches → Create branch → name "restore-<date>"
   # Get the branch's DIRECT connection string from Console
   export TARGET_URL="postgresql://neondb_owner:...@ep-<new-branch>.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"
   ```
   The new branch starts as a copy of main; we'll wipe it and load the dump.

   **Option 5b — Restore to a brand new DB (full disaster recovery):**
   Create a new Neon project or self-hosted Postgres, use its
   DIRECT connection string as `$TARGET_URL`.

6. **Wipe the target schema** (skip if target is a brand-new DB):
   ```bash
   psql "$TARGET_URL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
   ```

7. **Run the restore:**
   ```bash
   pg_restore \
     --clean --if-exists \
     --no-owner --no-acl \
     --dbname="$TARGET_URL" \
     /tmp/restore.dump
   ```
   `pg_restore` may print non-fatal warnings (e.g. about roles).
   These are fine with `--no-owner --no-acl`. Watch for
   `pg_restore: error:` lines — those are fatal.

8. **Sanity-check restored state:**
   ```bash
   psql "$TARGET_URL" -c 'SELECT COUNT(*) FROM "Tenant"'
   psql "$TARGET_URL" -c 'SELECT COUNT(*) FROM "Order"'
   psql "$TARGET_URL" -c 'SELECT COUNT(*) FROM _prisma_migrations'
   ```
   Expect: row counts matching the backup's moment in time,
   `_prisma_migrations` = 1 row (`squash_to_baseline`).

9. **Cut over.**
   - Option 5a (Neon branch): In Neon Console, make the restored
     branch the new primary — "Set as default" or swap the
     production compute endpoint. Alternatively, update
     `DATABASE_URL` + `DIRECT_URL` in Vercel to point at the branch.
   - Option 5b (new DB): Update Vercel env vars to the new
     connection strings, redeploy.

10. **Un-freeze writes** and monitor.

### Timing

- Download of 16 MB dump: <10 seconds
- Restore into an empty Neon branch: ~30 seconds
- Full cutover: 2–5 minutes including Vercel redeploy

At 1 GB dump size, expect 5–10 minutes total. At 25 GB, 30–60
minutes — consider splitting into parallel workers with
`pg_restore --jobs`.

---

## Scenario C — Single-table restore from R2 dump

> ⚠️ **WARNING — Scenario C is the riskiest restore.** It manipulates
> production data with potentially destructive SQL. For a solo
> founder:
> - **Never execute these steps during an active incident without
>   sleeping on the plan first.** Write out each SQL statement,
>   re-read in the morning, then run.
> - Always run in a `BEGIN ... COMMIT` transaction so you can
>   `ROLLBACK` if intermediate results look wrong.
> - Always include `tenantId` in every `WHERE` clause that touches a
>   multi-tenant table — restoring one tenant's row onto another
>   tenant's id is the single worst data-integrity bug we can ship.
> - If unsure: prefer Scenario B (full restore to a throwaway branch)
>   and migrate data manually with review rather than running these
>   queries against production.

### When to use

- Only one table's data is corrupt (not schema — data)
- You want to preserve all other tables' current state
- Most common: a bad bulk-update script that touched one table

### Steps

1. **Freeze writes to the affected table** if possible. Application
   code touching that table should be temporarily disabled.

2. **Download the target backup** (as in Scenario B steps 1–4).

3. **List what's in the dump:**
   ```bash
   pg_restore --list /tmp/restore.dump > /tmp/toc.txt
   grep -i "TABLE DATA public \"YourTable\"" /tmp/toc.txt
   ```

4. **Extract just the table's data into a staging schema:**

   Create a staging schema on the current live DB to avoid touching
   production tables:
   ```bash
   psql "$DIRECT_URL" -c 'CREATE SCHEMA IF NOT EXISTS restore_staging;'
   ```

   Restore the table definition and data into `restore_staging`:
   ```bash
   # Extract just the table TOC entry IDs we need
   pg_restore --list /tmp/restore.dump \
     | grep -E "(TABLE|TABLE DATA|INDEX|FK CONSTRAINT) .*\"YourTable\"" \
     > /tmp/toc-filter.txt

   # Restore only that subset into a temp DB or --use-list filter
   pg_restore \
     --use-list=/tmp/toc-filter.txt \
     --no-owner --no-acl \
     --dbname="$DIRECT_URL" \
     /tmp/restore.dump
   ```

   Alternative (simpler but heavier): restore the full dump to a
   throwaway Neon branch (Scenario B option 5a), then use `pg_dump`
   of just the one table from the branch, and pipe it into
   production:
   ```bash
   pg_dump "$BRANCH_URL" \
     --table='public."YourTable"' \
     --data-only \
     --format=custom \
     --file=/tmp/single-table.dump

   # Then selectively merge into production:
   pg_restore --data-only --dbname="$PROD_URL" /tmp/single-table.dump
   ```

5. **Reconcile.** Decide how to merge historical data with current
   state:
   - **Full replace:** `TRUNCATE "YourTable"; ` + restore data.
     Loses rows added after backup.
   - **INSERT ... ON CONFLICT DO NOTHING:** preserves current rows,
     re-adds missing historical rows. Requires a staging table
     pattern:
     ```sql
     INSERT INTO "YourTable" (...)
     SELECT ... FROM restore_staging."YourTable"
     ON CONFLICT (id) DO NOTHING;
     ```
   - **Targeted UPDATE:** for specific bad fields, copy just those
     columns from the staging rows into current rows by id.

   The right choice depends on the incident. Usually "targeted
   UPDATE" for bad-script cases; "full replace" for full
   corruption.

6. **Verify** row counts, row samples, and that dependent FKs still
   resolve.

7. **Drop staging schema:**
   ```sql
   DROP SCHEMA restore_staging CASCADE;
   ```

### Costs / caveats

- Single-table restore is manual and error-prone. **Always do this
  inside a transaction** where possible:
  ```sql
  BEGIN;
  -- your merge logic
  -- verify
  COMMIT; -- or ROLLBACK if anything looks wrong
  ```
- Multi-tenant data: ensure your merge filter is scoped by
  `tenantId` — never restore one tenant's row onto another tenant's
  id. Our schema has `tenantId` on every user-facing table.

---

## After any restore — mandatory steps

Regardless of scenario:

1. **Post-mortem.** What happened? Why didn't we catch it in
   staging? Add a regression test.
2. **Run a test-restore from the R2 backup.** The incident may have
   been caused by something the backup also captured. Trigger
   `db-restore-drill` workflow to confirm latest backup is healthy.
3. **Verify `_prisma_migrations` matches schema.prisma.**
   `prisma migrate status` should say "up to date".
4. **Refresh Sentry release markers** so post-incident errors don't
   mix with pre-incident noise.
5. **Document** the incident and resolution in a shared note (not
   Slack — Slack loses things). Include: timestamp detected,
   timestamp resolved, data loss (rows/tenants affected), lessons.

## Emergency contact order

If a restore is failing and production is down:
1. Check Neon status page: https://neonstatus.com
2. Try Scenario B option 5b (brand new DB, different provider)
3. `db-rollback-to-render.md` — as absolute last resort, fall back
   to Render (data is there as of migration cutover 2026-04-21,
   will be stale otherwise)

## Links

- Neon PITR docs: https://neon.com/docs/introduction/branch-restore
- Neon Console: https://console.neon.tech
- R2 backups: Cloudflare dashboard → R2 → `booking`
- Backup workflow: `.github/workflows/db-backup.yml`
- Restore drill workflow: `.github/workflows/db-restore-drill.yml`
