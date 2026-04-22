# PMS Reliability Engine — Disaster Recovery Runbook

Operational procedures for recovering the reliability-engine state
(webhook inbox, outbound jobs, reconciliation cursors, idempotency
keys, sync events) when something goes wrong.

This runbook is intentionally prescriptive. When a page fires at
03:00, you want **commands to copy-paste**, not architecture to
reason about.

---

## What this runbook covers

The five PMS reliability tables:

- `PmsWebhookInbox` — incoming webhook events
- `PmsOutboundJob` — outgoing PMS booking pipeline
- `ReconciliationCursor` — per-tenant sweep state
- `PmsIdempotencyKey` — call-level dedup keys (48h TTL)
- `SyncEvent` — append-only audit log

Plus related state on `Booking` (`holdExternalId`, `holdExpiresAt`,
`pmsBookingRef`, `externalId`, `providerUpdatedAt`).

Full-DB recovery (i.e. all of Neon is gone) is outside this
runbook — see `db-restore.md` for that. This runbook handles
targeted recovery of the reliability engine.

---

## Quick reference

| Scenario | Command |
|---|---|
| Export snapshot (all tenants) | `npx tsx scripts/pms-reliability/export.ts > snap.jsonl` |
| Export single tenant | `npx tsx scripts/pms-reliability/export.ts --tenantId=<id> > t.jsonl` |
| Import (additive, safe) | `npx tsx scripts/pms-reliability/import.ts --input=snap.jsonl` |
| Import (overwrite existing) | `npx tsx scripts/pms-reliability/import.ts --input=snap.jsonl --overwrite --yes` |
| Dry-run import | `npx tsx scripts/pms-reliability/import.ts --input=snap.jsonl --dry-run` |

All commands assume `cd admin` and `DATABASE_URL` set in environment.

---

## Scenario A: Single reliability table is corrupted

**Symptoms**
- Retry cron logs `Cannot read properties of undefined` or Prisma
  constraint errors on a specific table
- Alerts firing on `pms.webhook.retry_cron.row_uncaught` spike
- Manual `SELECT` returns NULL/unexpected values for recent rows

**Response**

1. Identify the affected table:
   ```bash
   # Spot-check each table's row count + most recent row
   npx tsx scripts/pms-reliability/export.ts --tables=PmsWebhookInbox \
     --since=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \
     | head
   ```

2. Snapshot BEFORE mutating anything:
   ```bash
   npx tsx scripts/pms-reliability/export.ts > /tmp/pre-recovery-$(date +%s).jsonl
   ```

3. Stop affected crons to prevent further writes on corrupt data:
   ```bash
   # Toggle the cron's tenant kill-switch or return 503 from the
   # route temporarily. There's no runtime pause mechanism — if the
   # bug is severe, deploy a version that returns 503 from the cron.
   ```

4. If Neon point-in-time recovery is required, follow
   `db-rollback-to-render.md`'s PITR section, restoring ONLY the
   affected table via branching:
   - Create a Neon branch at the known-good timestamp
   - Export the reliability tables from that branch
   - Import into main with `--overwrite --yes`

5. Re-enable the affected cron. Monitor
   `pms.webhook.retry_cron.completed` logs for 5–10 min.

---

## Scenario B: Accidental `DROP TABLE` or bad migration

**Symptoms**
- Prisma error: relation "PmsWebhookInbox" does not exist
- Migration left schema in unexpected state
- `npx prisma migrate status` reports drift

**Response**

1. Do NOT create new migrations yet — investigate state first:
   ```bash
   npx prisma migrate status
   npx prisma db pull --print   # dump current schema from DB
   ```

2. If the schema drift is recoverable via migration:
   ```bash
   # Create a recovery migration that matches current Prisma schema
   npx prisma migrate resolve --rolled-back <broken-migration-name>
   npx prisma migrate dev --name recover_<table>
   ```

3. If a table was dropped, you need the schema back AND the data.
   Re-apply the original migration (from `prisma/migrations/`) and
   then import last-known-good data:
   ```bash
   # Re-apply the table's creation SQL directly
   npx prisma db execute --schema prisma/schema.prisma \
     --file prisma/migrations/<creation-migration>/migration.sql
   # Mark it applied
   npx prisma migrate resolve --applied <creation-migration-name>
   # Import data from last export
   npx tsx scripts/pms-reliability/import.ts --input=/path/to/backup.jsonl
   ```

---

## Scenario C: Need to roll back a specific tenant's reliability state

**Symptoms**
- Tenant reports corrupted PMS sync history
- Circuit breaker stuck open for a tenant with no underlying outage
- DEAD rows accumulating for a tenant due to a one-off data issue

**Response**

1. Export that tenant's state:
   ```bash
   npx tsx scripts/pms-reliability/export.ts \
     --tenantId=<tenantId> > tenant-snapshot.jsonl
   ```

2. Review the snapshot. Identify the rows causing the issue (DEAD,
   COMPENSATION_FAILED, stranded PROCESSING).

3. Targeted cleanup:
   ```sql
   -- Remove DEAD rows for this tenant so retries can be fresh
   UPDATE "PmsWebhookInbox"
     SET status='PENDING', nextRetryAt=NOW(), attempts=0,
         deadAt=NULL, lastError=NULL
     WHERE tenantId=$1 AND status='DEAD';
   ```

4. Reset circuit breaker:
   ```sql
   UPDATE "TenantIntegration"
     SET consecutiveFailures=0, lastError=NULL, lastErrorAt=NULL,
         status='active'
     WHERE tenantId=$1;
   ```

5. Monitor the next cron run for that tenant.

---

## Scenario D: Neon point-in-time recovery (whole DB)

**When to use**: `DELETE FROM` ran without a WHERE, or a bad deploy
corrupted data platform-wide. Use Neon's native PITR — do not
attempt logical restore from snapshots if the whole DB is lost.

**Response**

1. Open Neon console → select project → Branches.
2. Create a branch from the target timestamp:
   - Use the "Point in time" option
   - Default retention: 7 days (hobby) / 30 days (pro)
3. Update `DATABASE_URL` in Vercel environment variables to point
   at the new branch's connection string.
4. Trigger a deploy (Vercel auto-redeploys on env-var change).
5. Verify:
   ```bash
   npx prisma migrate status       # should be up-to-date
   curl -H "Authorization: Bearer $CRON_SECRET" \
     "https://rutgr.com/api/cron/reconcile-pms?tier=hot"
   # Should return 200 with reasonable counters
   ```
6. Once verified, promote the recovered branch to be the primary in
   Neon console, OR keep both around until confidence is high.

**Retention**: Neon PITR is not forever. Take a JSONL snapshot on a
**weekly** cadence to S3 (see below) as secondary insurance.

---

## Scenario E: Replay events from a snapshot into a fresh environment

**Use case**: new staging environment, tenant migration, forensic
replay of a production incident.

**Response**

1. Ensure target DB is up-to-date on migrations:
   ```bash
   npx prisma migrate deploy
   ```

2. Import the snapshot (additive is safe):
   ```bash
   npx tsx scripts/pms-reliability/import.ts --input=snap.jsonl
   ```

3. The retry crons will pick up any `PENDING` / `FAILED` rows on
   their next cycle — no manual trigger needed.

---

## What's recoverable vs. what's lost

### Recoverable

- **All reliability-engine state up to the last export / PITR
  point**. Webhook inbox, outbound jobs, cursors, audit trail.
- **Booking hold state** (via `Booking` rows, backed up by PITR).
- **Credentials** (TenantIntegration encrypted blobs, PITR).

### Not recoverable by this tooling

- **In-flight Redis locks** — ephemeral, but harmless. New runs
  just re-acquire.
- **Idempotency-key `IN_FLIGHT` rows** whose wrapping worker crashed
  during the restore window. These surface as orphans in the
  cleanup cron log. Manually DELETE them if you're certain the
  original operation didn't reach the PMS.
- **Adapter module-level caches** (Mews service IDs, age categories).
  Harmless — re-populated on next call.
- **PMS-side state**. If a reservation was created in Mews but our
  corresponding Booking was lost, we'd know about it only via the
  reconciliation cron (which will backfill it). Pure data-platform
  restore doesn't recreate Mews reservations.

---

## Proactive backup schedule (recommended)

- **Weekly JSONL snapshot to S3**:
  ```bash
  npx tsx scripts/pms-reliability/export.ts | \
    aws s3 cp - s3://bedfront-backups/pms-reliability/$(date +%Y-%m-%d).jsonl
  ```
  Set retention: 12 months. Cost: ~1 MB / tenant / month.

- **Neon PITR**: already on (7-day default, verify pro tier setting
  for longer retention).

- **Restore drill**: quarterly. Create a temp Neon branch, import a
  snapshot, verify a sample tenant's counters match. Document the
  run time.

---

## Observability during recovery

Tail these log events during any recovery:

- `pms.webhook.retry_cron.completed` — confirms inbox is draining
- `pms.outbound.retry_cron.completed` — confirms outbound is draining
- `pms.reconcile.run_completed` — confirms reconcile is running
- `pms.circuit.auto_closed` — confirms circuits are healing

Alert if any of these go silent for > 30 min during recovery.
