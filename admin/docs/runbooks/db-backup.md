# Database backup — how it works, where files live, manual trigger

This runbook describes the automated backup pipeline that stores
PostgreSQL dumps of our Neon production database in Cloudflare R2.

For rolling back the _app_ from Neon back to Render, see
`db-rollback-to-render.md`. For restoring _data_ from a backup into
Neon (or a fresh Postgres), see `db-restore.md`.

## What runs when

Two GitHub Actions workflows live in `.github/workflows/`:

| Workflow | Trigger | Purpose |
|---|---|---|
| `db-backup.yml` | Daily 03:00 UTC + manual dispatch | Nightly `pg_dump` → R2 |
| `db-restore-drill.yml` | Manual dispatch only | Quarterly DR drill |

GitHub's default email notification fires if the scheduled workflow
fails (sent to the repo owner — `leo@lrstudio.se`).

## Backup storage layout

Bucket: `booking` (Cloudflare R2, EU jurisdiction,
`https://09ab42c3610c3ec377e09db1c2e27c1f.eu.r2.cloudflarestorage.com`)

Object key pattern:
```
nightly/YYYY-MM-DD/backup-YYYY-MM-DDTHH-MM-SSZ.dump
```

Example:
```
nightly/2026-04-22/backup-2026-04-22T03-00-15Z.dump
```

## Retention

R2 bucket lifecycle rule `delete-after-90-days` automatically deletes
objects under the `nightly/` prefix 90 days after creation. No
application-level cleanup runs — the bucket itself enforces it.

To change retention: Cloudflare dashboard → R2 → bucket `booking` →
Settings → Object lifecycle rules → edit `delete-after-90-days` →
change "days after creation" value. Effect is immediate on next
lifecycle sweep (runs ~daily).

## What the backup contains

`pg_dump --format=custom --no-owner --no-acl` against `DIRECT_URL`
(unpooled Neon endpoint — pg_dump doesn't work over a pooler).

Includes: all tables, all data, all indexes, all foreign keys, all
enums, all sequences, the `_prisma_migrations` table.

Excludes: ownership metadata (matches our restore strategy of
`--no-owner --no-acl`), role/grant information (recreated by the
target DB's role setup).

Integrity is verified before upload:
- TOC entries (via `pg_restore --list`) must be >100
- At least one `TABLE DATA` entry must exist
- File size must be >500KB

If any check fails, the workflow aborts and R2 is never written to.

## Manual backup — ad-hoc dump

**Use when:** you're about to do something risky (major migration,
data cleanup) and want a fresh dump beyond the last nightly.

1. Go to **https://github.com/leothepro1/book/actions/workflows/db-backup.yml**
2. Click **Run workflow** (top right)
3. Branch: `main` (default)
4. Click the green **Run workflow** button
5. Watch the run — typically completes in 2–3 minutes for our current
   ~16 MB database
6. Verify the object appeared in R2:
   Cloudflare dashboard → R2 → `booking` → `nightly/YYYY-MM-DD/`

The manually-triggered dump uses the exact same code path as the
scheduled one. The `nightly/` prefix is used regardless of trigger —
manual dumps are indistinguishable from scheduled ones in R2.

## Verifying a backup is healthy without restoring

To just confirm a dump is readable without actually restoring:

```bash
# Download locally
aws s3 cp s3://booking/nightly/2026-04-22/backup-2026-04-22T03-00-15Z.dump \
  /tmp/backup.dump \
  --endpoint-url https://09ab42c3610c3ec377e09db1c2e27c1f.eu.r2.cloudflarestorage.com

# List TOC
pg_restore --list /tmp/backup.dump | head -20

# Count table-data entries
pg_restore --list /tmp/backup.dump | grep -c "TABLE DATA"
```

Expected: >100 TOC entries, ≥100 TABLE DATA entries (our schema has
110 tables, most will have `TABLE DATA` entries in the dump).

## Monitoring

- **Workflow runs:** https://github.com/leothepro1/book/actions/workflows/db-backup.yml
- **R2 usage:** Cloudflare dashboard → R2 → `booking` → Metrics
- **Failures:** GitHub sends email to repo owner on any failed
  scheduled run. No additional alerting.

## Quarterly DR drill

Every quarter, run the restore drill workflow manually:

1. https://github.com/leothepro1/book/actions/workflows/db-restore-drill.yml
2. **Run workflow** → leave `backup_key` blank (uses latest nightly)
3. Verify the job summary shows:
   - Tables restored = main tables (parity)
   - `_prisma_migrations` = 1 row (baseline present)
   - No `::error::` annotations

If the drill fails, the backup pipeline is considered broken.
Treat as a production incident — figure out why before the next
nightly runs. Do not rely on backups that haven't passed a drill
in >3 months.

## Cost

At current scale (~16 MB per dump, 90 dumps retained = ~1.5 GB in
R2): **$0/month** (well inside R2 free tier of 10 GB storage +
1M Class A ops + 10M Class B ops + zero egress).

At 10 GB per dump (after ~100 tenants or heavy telemetry): ~$0.23
in R2 storage, still no egress. GitHub Actions stays inside the
2,000 free minutes/month (a backup run is ~3 min).

Egress from Neon is billed separately by Neon. Current pricing
changes often — see https://neon.com/pricing for current rates and
plan-included allowances. Rule of thumb: each nightly dump sends
one full DB-sized transfer out of Neon, so monthly egress ≈
`dump_size × 30`. Once that product exceeds the included allowance
on our plan, either drop to weekly backups or negotiate higher
allowance with Neon.

## Secrets reference

All required secrets live in GitHub:
https://github.com/leothepro1/book/settings/secrets/actions

| Secret | Scope |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 S3-API access key (scoped to `booking` bucket only) |
| `R2_SECRET_ACCESS_KEY` | R2 S3-API secret |
| `R2_BUCKET_NAME` | Bucket name (`booking`) |
| `R2_ENDPOINT` | EU-jurisdiction endpoint URL |
| `NEON_DIRECT_URL` | Neon non-pooled URL (required for pg_dump) |
| `NEON_API_KEY` | Used only by restore-drill workflow |
| `NEON_PROJECT_ID` | Used only by restore-drill workflow |

Rotate R2 credentials by generating a new token in Cloudflare R2
UI, updating `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` secrets
in GitHub, then revoking the old token.
