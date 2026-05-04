/**
 * Besökare just nu — DB query.
 *
 * Returns the count of distinct `payload->>'session_id'` values across
 * `analytics.event` rows for a single tenant in the last 5 minutes.
 *
 * Per recon §3.3 + §5.1:
 *   - "Any storefront event with session_id counts." Server-emitted events
 *     don't carry session_id in payload — they're filtered out by the
 *     `payload ? 'session_id'` predicate.
 *   - The 5-min window always sits within the current monthly partition,
 *     so Postgres prunes to that partition automatically.
 *   - The `event_tenant_id_occurred_at_idx` (per
 *     prisma/migrations/20260430145830_analytics_pipeline_foundation/migration.sql:113)
 *     covers the (tenant_id, occurred_at DESC) lookup. EXPLAIN ANALYZE
 *     in B.1 confirmed Index Scan, not Seq Scan.
 *
 * Singleton: must use `_unguardedAnalyticsPipelineClient` per
 * admin/CLAUDE.md "Enterprise infrastructure" rule (the dev guard on
 * `prisma` blocks direct access to analytics-pipeline models).
 *
 * Tenant-isolation invariant: `tenant_id = ${tenantId}` literal in
 * WHERE — Phase 5A verifier check #10 enforces. B.7 extends the
 * verifier to cover this file.
 */

import { _unguardedAnalyticsPipelineClient } from "@/app/_lib/db/prisma";

interface VisitorsNowRow {
  visitors_now: number;
}

/**
 * Count distinct active session_ids for the tenant in the last 5 min.
 *
 * Returns 0 when the tenant has no events in the window (including
 * brand-new tenants who haven't fired any events yet — per recon
 * §5.4 we render 0 literally, no "no data yet" distinction).
 */
export async function getVisitorsNow(tenantId: string): Promise<number> {
  const rows = await _unguardedAnalyticsPipelineClient.$queryRaw<
    VisitorsNowRow[]
  >`
    SELECT COUNT(DISTINCT payload->>'session_id')::int AS visitors_now
    FROM analytics.event
    WHERE tenant_id = ${tenantId}
      AND occurred_at > NOW() - INTERVAL '5 minutes'
      AND payload ? 'session_id'
  `;

  // COUNT always returns at least one row; the value is 0 when no
  // matching rows exist.
  return rows[0]?.visitors_now ?? 0;
}
