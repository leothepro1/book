/**
 * PMS Sync Poller
 *
 * GET /api/integrations/poll
 *
 * Called by a cron job every 5 minutes.
 * Performs two tasks:
 *   1. Recovers stuck jobs (running > 10 minutes)
 *   2. Enqueues sync jobs for stale integrations
 *
 * Data cleanup (WebhookDedup, old SyncEvents/Jobs) is handled by
 * the dedicated /api/integrations/cleanup route (daily cron).
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

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // ── 1. Recover stuck jobs ───────────────────────────────────
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

  // ── 2. Enqueue sync jobs for stale integrations ─────────────
  const staleThreshold = new Date(now.getTime() - STALE_THRESHOLD_MS);

  const integrations = await prisma.tenantIntegration.findMany({
    where: { status: "active" },
  });

  let enqueued = 0;
  let skipped = 0;

  for (const integration of integrations) {
    if (integration.lastSyncAt && integration.lastSyncAt > staleThreshold) {
      skipped++;
      continue;
    }

    if (integration.provider === "manual") {
      skipped++;
      continue;
    }

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
  });
}
