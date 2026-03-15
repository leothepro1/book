/**
 * Integration Data Cleanup
 *
 * GET /api/integrations/cleanup
 *
 * Runs daily (03:00 UTC via cron). Independent of the poller.
 * Cleans up stale data that grows unbounded:
 * - WebhookDedup records > 7 days
 * - SyncEvent records > 90 days
 * - Completed/dead SyncJob records > 30 days
 * - Resolved BookingSyncError records > 30 days
 *
 * Secured with CRON_SECRET header.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";

const WEBHOOK_DEDUP_TTL_DAYS = 7;
const SYNC_EVENT_TTL_DAYS = 90;
const SYNC_JOB_TTL_DAYS = 30;
const BOOKING_ERROR_TTL_DAYS = 30;

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();

  const webhookDedup = await prisma.webhookDedup.deleteMany({
    where: {
      createdAt: { lt: new Date(now - WEBHOOK_DEDUP_TTL_DAYS * 86_400_000) },
    },
  });

  const syncEvents = await prisma.syncEvent.deleteMany({
    where: {
      createdAt: { lt: new Date(now - SYNC_EVENT_TTL_DAYS * 86_400_000) },
    },
  });

  const syncJobs = await prisma.syncJob.deleteMany({
    where: {
      status: { in: ["completed", "dead"] },
      createdAt: { lt: new Date(now - SYNC_JOB_TTL_DAYS * 86_400_000) },
    },
  });

  const bookingErrors = await prisma.bookingSyncError.deleteMany({
    where: {
      resolvedAt: { not: null },
      createdAt: { lt: new Date(now - BOOKING_ERROR_TTL_DAYS * 86_400_000) },
    },
  });

  return NextResponse.json({
    deleted: {
      webhookDedup: webhookDedup.count,
      syncEvents: syncEvents.count,
      syncJobs: syncJobs.count,
      bookingErrors: bookingErrors.count,
    },
  });
}
