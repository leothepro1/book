/**
 * Sync Job Runner
 *
 * POST /api/integrations/run-jobs
 *
 * Atomically claims and processes one pending sync job per invocation.
 * Called by a cron job every minute.
 * Secured with CRON_SECRET header.
 *
 * One job per invocation keeps execution time bounded
 * (Vercel serverless functions have a 60s limit).
 */

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/app/_lib/env";
import { claimNextPendingJob } from "@/app/_lib/integrations/sync/scheduler";
import { runSyncJob } from "@/app/_lib/integrations/sync/engine";
import { isCircuitOpen, markJobCircuitOpen } from "@/app/_lib/integrations/sync/circuit-breaker";
import type { PmsProvider } from "@/app/_lib/integrations/types";

export async function POST(request: NextRequest) {
  // Validate CRON_SECRET
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Atomically claim next pending job — race-safe
  const job = await claimNextPendingJob();
  if (!job) {
    return NextResponse.json({ processed: 0 });
  }

  // 2. Check circuit breaker
  const circuitOpen = await isCircuitOpen(
    job.tenantId,
    job.provider as PmsProvider,
  );

  if (circuitOpen) {
    await markJobCircuitOpen(job.id, job.tenantId, job.provider);
    return NextResponse.json({ processed: 0, circuitOpen: true, jobId: job.id });
  }

  // 3. Run the already-claimed job (status is already "running")
  await runSyncJob(job.id);

  return NextResponse.json({ processed: 1, jobId: job.id });
}
