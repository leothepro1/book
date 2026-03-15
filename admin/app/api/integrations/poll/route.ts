/**
 * PMS Sync Poller
 *
 * GET /api/integrations/poll
 *
 * Called by a cron job every 5 minutes.
 * Performs three maintenance tasks:
 *   1. Recovers stuck jobs (running > 10 minutes)
 *   2. Cleans up old webhook dedup records (> 7 days)
 *   3. Enqueues sync jobs for stale integrations
 *
 * Secured with CRON_SECRET header.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";
import { enqueueSyncJob } from "@/app/_lib/integrations/sync/scheduler";
import type { PmsProvider } from "@/app/_lib/integrations/types";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const STUCK_JOB_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const WEBHOOK_DEDUP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function GET(request: NextRequest) {
  // Validate CRON_SECRET
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // ── 1. Recover stuck jobs ───────────────────────────────────
  // A job running for > 10 minutes is considered stuck (server crash, OOM, timeout).
  // Reset to "pending" so it will be retried on the next run-jobs cycle.
  const stuckRecovery = await prisma.syncJob.updateMany({
    where: {
      status: "running",
      startedAt: { lte: new Date(now.getTime() - STUCK_JOB_TIMEOUT_MS) },
    },
    data: {
      status: "pending",
      startedAt: null,
      lastError: "Recovered from stuck state — server likely crashed or timed out",
    },
  });

  // ── 2. Cleanup old webhook dedup records ────────────────────
  const dedupCleanup = await prisma.webhookDedup.deleteMany({
    where: {
      createdAt: { lte: new Date(now.getTime() - WEBHOOK_DEDUP_TTL_MS) },
    },
  });

  // ── 3. Enqueue sync jobs for stale integrations ─────────────
  const staleThreshold = new Date(now.getTime() - STALE_THRESHOLD_MS);

  const integrations = await prisma.tenantIntegration.findMany({
    where: { status: "active" },
  });

  let enqueued = 0;
  let skipped = 0;

  for (const integration of integrations) {
    // Skip if recently synced
    if (integration.lastSyncAt && integration.lastSyncAt > staleThreshold) {
      skipped++;
      continue;
    }

    // Skip manual provider — no sync needed
    if (integration.provider === "manual") {
      skipped++;
      continue;
    }

    // enqueueSyncJob has built-in dedup — returns null if job already exists
    const job = await enqueueSyncJob(
      integration.tenantId,
      integration.provider as PmsProvider,
      { since: integration.lastSyncAt ?? undefined },
    );

    if (job) {
      enqueued++;
    } else {
      skipped++;
    }
  }

  return NextResponse.json({
    enqueued,
    skipped,
    total: integrations.length,
    stuckRecovered: stuckRecovery.count,
    dedupCleaned: dedupCleanup.count,
  });
}
