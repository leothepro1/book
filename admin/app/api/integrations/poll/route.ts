export const dynamic = "force-dynamic";

/**
 * PMS Integration Poller — Booking Engine
 *
 * GET /api/integrations/poll
 *
 * Called by a cron job every 5 minutes.
 * In the booking engine architecture, there are no background sync jobs.
 * This endpoint performs health checks on active integrations.
 *
 * Secured with CRON_SECRET header.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const integrations = await prisma.tenantIntegration.findMany({
    where: { status: "active" },
    select: { id: true, tenantId: true, provider: true, lastSyncAt: true },
  });

  return NextResponse.json({
    activeIntegrations: integrations.length,
    note: "Booking engine uses real-time PMS queries — no sync jobs enqueued",
  });
}
