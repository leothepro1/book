/**
 * Sync Job Runner
 *
 * POST /api/integrations/run-jobs
 *
 * Processes multiple pending sync jobs per invocation with a time budget.
 * Called by a cron job every minute.
 * Secured with CRON_SECRET header.
 *
 * Processes up to 10 jobs or 45 seconds — whichever comes first.
 * The 45-second budget keeps execution safely under Vercel's 60s limit.
 */

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/app/_lib/env";
import { claimNextPendingJob } from "@/app/_lib/integrations/sync/scheduler";
import { runSyncJob } from "@/app/_lib/integrations/sync/engine";
import { isCircuitOpen, markJobCircuitOpen } from "@/app/_lib/integrations/sync/circuit-breaker";
import type { PmsProvider } from "@/app/_lib/integrations/types";

const TIME_BUDGET_MS = 45_000;
const MAX_JOBS_PER_INVOCATION = 10;

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let processed = 0;
  const startTime = Date.now();

  while (
    processed < MAX_JOBS_PER_INVOCATION &&
    Date.now() - startTime < TIME_BUDGET_MS
  ) {
    const job = await claimNextPendingJob();
    if (!job) break; // Queue empty

    const circuitOpen = await isCircuitOpen(
      job.tenantId,
      job.provider as PmsProvider,
    );

    if (circuitOpen) {
      await markJobCircuitOpen(job.id, job.tenantId, job.provider);
      processed++;
      continue;
    }

    await runSyncJob(job.id);
    processed++;
  }

  return NextResponse.json({
    processed,
    durationMs: Date.now() - startTime,
  });
}
