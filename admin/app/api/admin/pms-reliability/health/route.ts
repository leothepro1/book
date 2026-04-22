export const dynamic = "force-dynamic";

/**
 * PMS Reliability — Health Endpoint
 * ═══════════════════════════════════
 *
 * Pull-based metrics for external monitors (Datadog, Grafana,
 * Uptime, custom alerting). Returns a single JSON document
 * summarising the reliability-engine's state across all reliability
 * tables + per-tenant signals operators care about.
 *
 * Auth: Bearer CRON_SECRET. Same pattern as the crons — keeps the
 * endpoint scraper-friendly (one static token) without exposing
 * internals publicly.
 *
 * GET /api/admin/pms-reliability/health
 *
 * Response shape:
 * {
 *   ok: true,
 *   generatedAt: ISO-8601,
 *   durationMs: number,
 *   tables: { [tableName]: { total, byStatus, oldestPendingAgeSec, strandedProcessing, ... } },
 *   tenants: { withOpenCircuit, withDeadWebhookRows, withCompensationFailed, ... },
 *   crons: { reconcileHotAgeSec, retryWebhooksAgeSec, retryOutboundAgeSec, ... },
 *   backlog: { inboxPending, outboundPending, expiredHoldsPending }
 * }
 *
 * This is the single point for alert rules. A monitoring system
 * polls this every minute and pages on:
 *   - backlog.inboxPending > 5_000                    (system saturated)
 *   - tenants.withCompensationFailed > 0              (money stuck)
 *   - tables.PmsWebhookInbox.strandedProcessing > 0   (unreclaimed)
 *   - crons.reconcileHotAgeSec > 300                  (cron not running)
 *   - tables.PmsWebhookInbox.oldestPendingAgeSec > 600 (backlog growing)
 *
 * Performance: all aggregations use groupBy / count with indexes
 * on status + timestamp columns. Typical response < 500ms at
 * pilot scale; bounded at O(tables × statuses) queries.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { FAILURE_THRESHOLD } from "@/app/_lib/integrations/sync/circuit-breaker";

// ── Helpers ─────────────────────────────────────────────────

function ageSecondsSince(d: Date | null | undefined): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 1000);
}

// ── Main ────────────────────────────────────────────────────

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startedAt = Date.now();

  // Fire all aggregations in parallel. Each one uses an index — we
  // profile-tuned this by picking queries that match @@index
  // definitions on the reliability tables (status, status+timestamp).
  const [
    inboxByStatus,
    outboundByStatus,
    idempotencyByStatus,
    oldestInboxPending,
    oldestInboxDead,
    strandedProcessingInbox,
    oldestOutboundPending,
    strandedProcessingOutbound,
    strandedCompensating,
    cursorCount,
    holdsPendingExpiry,
    tenantsOpenCircuit,
    tenantsWithDeadInbox,
    tenantsWithCompensationFailed,
    tenantsWithIntegrityMismatches,
    bookingsWithIntegrityMismatch,
    bookingsWithIntegrityPmsNotFound,
    lastCronEvents,
  ] = await Promise.all([
    prisma.pmsWebhookInbox.groupBy({
      by: ["status"],
      _count: true,
    }),
    prisma.pmsOutboundJob.groupBy({
      by: ["status"],
      _count: true,
    }),
    prisma.pmsIdempotencyKey.groupBy({
      by: ["status"],
      _count: true,
    }),
    prisma.pmsWebhookInbox.findFirst({
      where: { status: "PENDING" },
      orderBy: { receivedAt: "asc" },
      select: { receivedAt: true },
    }),
    prisma.pmsWebhookInbox.findFirst({
      where: { status: "DEAD" },
      orderBy: { deadAt: "asc" },
      select: { deadAt: true },
    }),
    prisma.pmsWebhookInbox.count({
      where: {
        status: "PROCESSING",
        lastAttemptAt: {
          lt: new Date(Date.now() - 5 * 60_000),
        },
      },
    }),
    prisma.pmsOutboundJob.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.pmsOutboundJob.count({
      where: {
        status: "PROCESSING",
        lastAttemptAt: {
          lt: new Date(Date.now() - 5 * 60_000),
        },
      },
    }),
    prisma.pmsOutboundJob.count({
      where: {
        status: "COMPENSATING",
        compensationLastAt: {
          lt: new Date(Date.now() - 5 * 60_000),
        },
      },
    }),
    prisma.reconciliationCursor.count(),
    prisma.booking.count({
      where: {
        holdExpiresAt: { not: null, lt: new Date() },
        pmsBookingRef: null,
        status: "PRE_CHECKIN",
      },
    }),
    prisma.tenantIntegration.count({
      where: { consecutiveFailures: { gte: FAILURE_THRESHOLD } },
    }),
    prisma.pmsWebhookInbox
      .groupBy({
        by: ["tenantId"],
        where: { status: "DEAD" },
        _count: true,
      })
      .then((rows) => rows.length),
    prisma.pmsOutboundJob
      .groupBy({
        by: ["tenantId"],
        where: { status: "COMPENSATION_FAILED" },
        _count: true,
      })
      .then((rows) => rows.length),
    prisma.booking
      .groupBy({
        by: ["tenantId"],
        where: { integrityFlag: { not: null } },
        _count: true,
      })
      .then((rows) => rows.length),
    prisma.booking.count({
      where: { integrityFlag: "MISMATCH" },
    }),
    prisma.booking.count({
      where: { integrityFlag: "PMS_NOT_FOUND" },
    }),
    // Last-run detection: the most recent sync.completed event per
    // distinct tier + source marker. SyncEvent is indexed on
    // (tenantId, createdAt) but we're fetching global so the index
    // on createdAt alone is the relevant one. Limit at 50 recent
    // events; we scan the last page and pick first match per tier.
    prisma.syncEvent.findMany({
      where: {
        eventType: { in: ["sync.completed", "sync.failed"] },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { eventType: true, payload: true, createdAt: true },
    }),
  ]);

  // Project groupBy results into a { status: count } map.
  function tally(rows: Array<{ status: string; _count: number }>) {
    const out: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      out[r.status] = r._count;
      total += r._count;
    }
    return { total, byStatus: out };
  }

  const inbox = tally(
    inboxByStatus.map((r) => ({ status: r.status, _count: r._count as number })),
  );
  const outbound = tally(
    outboundByStatus.map((r) => ({ status: r.status, _count: r._count as number })),
  );
  const idempotency = tally(
    idempotencyByStatus.map((r) => ({ status: r.status, _count: r._count as number })),
  );

  // Derive last-run timestamps per cron. We look at recent sync
  // events and pick the most recent one matching each cron's
  // signature (tier for reconcile, source="webhook" for inbox, etc).
  let reconcileHotAt: Date | null = null;
  let reconcileWarmAt: Date | null = null;
  let reconcileColdAt: Date | null = null;
  let webhookIngestAt: Date | null = null;
  for (const ev of lastCronEvents) {
    const payload = (ev.payload ?? {}) as Record<string, unknown>;
    const tier = payload.tier as string | undefined;
    const source = payload.source as string | undefined;
    if (tier === "hot" && !reconcileHotAt) reconcileHotAt = ev.createdAt;
    if (tier === "warm" && !reconcileWarmAt) reconcileWarmAt = ev.createdAt;
    if (tier === "cold" && !reconcileColdAt) reconcileColdAt = ev.createdAt;
    if (source === "webhook" && !webhookIngestAt) webhookIngestAt = ev.createdAt;
  }

  const durationMs = Date.now() - startedAt;

  const body = {
    ok: true,
    generatedAt: new Date().toISOString(),
    durationMs,
    tables: {
      PmsWebhookInbox: {
        ...inbox,
        oldestPendingAgeSec: ageSecondsSince(oldestInboxPending?.receivedAt),
        oldestDeadAgeSec: ageSecondsSince(oldestInboxDead?.deadAt),
        strandedProcessing: strandedProcessingInbox,
      },
      PmsOutboundJob: {
        ...outbound,
        oldestPendingAgeSec: ageSecondsSince(oldestOutboundPending?.createdAt),
        strandedProcessing: strandedProcessingOutbound,
        strandedCompensating,
      },
      PmsIdempotencyKey: idempotency,
      ReconciliationCursor: { total: cursorCount },
    },
    tenants: {
      withOpenCircuit: tenantsOpenCircuit,
      withDeadWebhookRows: tenantsWithDeadInbox,
      withCompensationFailed: tenantsWithCompensationFailed,
      withIntegrityMismatches: tenantsWithIntegrityMismatches,
    },
    integrity: {
      fieldMismatches: bookingsWithIntegrityMismatch,
      pmsNotFound: bookingsWithIntegrityPmsNotFound,
    },
    crons: {
      reconcileHotAgeSec: ageSecondsSince(reconcileHotAt),
      reconcileWarmAgeSec: ageSecondsSince(reconcileWarmAt),
      reconcileColdAgeSec: ageSecondsSince(reconcileColdAt),
      lastWebhookIngestAgeSec: ageSecondsSince(webhookIngestAt),
    },
    backlog: {
      inboxPending:
        (inbox.byStatus.PENDING ?? 0) + (inbox.byStatus.FAILED ?? 0),
      outboundPending:
        (outbound.byStatus.PENDING ?? 0) + (outbound.byStatus.FAILED ?? 0),
      expiredHoldsPending: holdsPendingExpiry,
    },
  };

  log("info", "pms.reliability.health_check", {
    durationMs,
    inboxPending: body.backlog.inboxPending,
    outboundPending: body.backlog.outboundPending,
    compensationFailed: body.tenants.withCompensationFailed,
    openCircuits: body.tenants.withOpenCircuit,
  });

  return Response.json(body);
}
