/**
 * replay-dlq — manual recovery tool for analytics-pipeline DLQ rows.
 *
 * Resets DLQ-marked outbox rows so the drainer picks them up again.
 * Use AFTER the underlying bug has been fixed (schema bump shipped,
 * registry entry added, etc.) — re-running a row whose root cause is
 * still broken just sends it back to DLQ.
 *
 * Usage:
 *
 *   tsx scripts/replay-dlq.ts --tenant <tenantId>
 *   tsx scripts/replay-dlq.ts --tenant <tenantId> --event-name <name>
 *   tsx scripts/replay-dlq.ts --event-id <eventId>
 *   tsx scripts/replay-dlq.ts --tenant <tenantId> --dry-run
 *
 * What it does:
 *   1. Find DLQ rows (last_error LIKE '[DLQ]%').
 *   2. For each: failed_count = 0, last_error = NULL, published_at = NULL.
 *   3. signalAnalyticsFlush per affected tenant (best-effort — cron
 *      fallback covers losses).
 *
 * Print summary: how many rows reset, by event_name, oldest age. Always
 * runs against the un-guarded analytics-pipeline client (the dev guard
 * fires on the regular `prisma` export for these models — by design).
 */

interface Args {
  tenant?: string;
  eventName?: string;
  eventId?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--tenant" && argv[i + 1]) args.tenant = argv[++i];
    else if (a === "--event-name" && argv[i + 1]) args.eventName = argv[++i];
    else if (a === "--event-id" && argv[i + 1]) args.eventId = argv[++i];
  }
  return args;
}

function usage(): never {
  // eslint-disable-next-line no-console
  console.error(
    "usage: tsx scripts/replay-dlq.ts (--tenant <id> [--event-name <name>] | --event-id <id>) [--dry-run]",
  );
  process.exit(2);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tenant && !args.eventId) usage();

  const { _unguardedAnalyticsPipelineClient } = await import(
    "@/app/_lib/db/prisma"
  );
  const { signalAnalyticsFlush } = await import(
    "@/app/_lib/analytics/pipeline/emitter"
  );

  // Find DLQ rows matching the filter.
  const filters: string[] = ["last_error LIKE '[DLQ]%'"];
  // Use parameterised values built into a parametric raw query.
  const whereParams: unknown[] = [];
  if (args.eventId) {
    filters.push(`event_id = $${whereParams.length + 1}`);
    whereParams.push(args.eventId);
  }
  if (args.tenant) {
    filters.push(`tenant_id = $${whereParams.length + 1}`);
    whereParams.push(args.tenant);
  }
  if (args.eventName) {
    filters.push(`event_name = $${whereParams.length + 1}`);
    whereParams.push(args.eventName);
  }
  const whereSql = filters.join(" AND ");

  type Row = {
    id: string;
    tenant_id: string;
    event_id: string;
    event_name: string;
    failed_count: number;
    created_at: Date;
  };

  const rows = await _unguardedAnalyticsPipelineClient.$queryRawUnsafe<Row[]>(
    `SELECT id, tenant_id, event_id, event_name, failed_count, created_at
     FROM analytics.outbox
     WHERE ${whereSql}
     ORDER BY created_at`,
    ...whereParams,
  );

  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log("replay-dlq: no DLQ rows match the filter");
    process.exit(0);
  }

  // Summarize before any mutation.
  const byEvent = new Map<string, number>();
  for (const r of rows) {
    byEvent.set(r.event_name, (byEvent.get(r.event_name) ?? 0) + 1);
  }
  const oldest = rows[0];
  const ageMs = Date.now() - oldest.created_at.getTime();
  const ageMin = Math.floor(ageMs / 60_000);

  // eslint-disable-next-line no-console
  console.log(`replay-dlq: ${rows.length} DLQ row(s) match`);
  for (const [name, n] of byEvent.entries()) {
    // eslint-disable-next-line no-console
    console.log(`  ${name}: ${n}`);
  }
  // eslint-disable-next-line no-console
  console.log(
    `  oldest: ${oldest.created_at.toISOString()} (${ageMin} min ago)`,
  );

  if (args.dryRun) {
    // eslint-disable-next-line no-console
    console.log("--dry-run set — no rows reset");
    process.exit(0);
  }

  // Reset. Single UPDATE for atomicity; trying to reset 1000 rows
  // one-at-a-time would be slow and fragile.
  const idList = rows.map((r) => r.id);
  await _unguardedAnalyticsPipelineClient.$executeRawUnsafe(
    `UPDATE analytics.outbox
     SET failed_count = 0, last_error = NULL, published_at = NULL
     WHERE id = ANY($1::text[])`,
    idList,
  );

  // eslint-disable-next-line no-console
  console.log(`replay-dlq: reset ${rows.length} row(s)`);

  // Signal each affected tenant once. Drainer's per-tenant concurrency
  // ensures fan-out doesn't over-parallelize.
  const tenants = Array.from(new Set(rows.map((r) => r.tenant_id)));
  for (const tenant of tenants) {
    try {
      await signalAnalyticsFlush(tenant, rows.filter((r) => r.tenant_id === tenant).length);
      // eslint-disable-next-line no-console
      console.log(`  signaled flush for tenant ${tenant}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `  signal failed for tenant ${tenant}: ${err instanceof Error ? err.message : String(err)} — cron fallback will catch within ~60s`,
      );
    }
  }

  await _unguardedAnalyticsPipelineClient.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("replay-dlq crashed:", err);
  process.exit(1);
});
