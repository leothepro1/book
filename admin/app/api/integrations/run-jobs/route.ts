export const dynamic = "force-dynamic";

/**
 * Sync Job Runner — DEPRECATED
 *
 * The booking engine uses real-time PMS queries instead of background sync.
 * This endpoint is kept to prevent cron infrastructure from 404-ing.
 * Returns immediately with zero jobs processed.
 */

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/app/_lib/env";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ processed: 0, durationMs: 0, note: "Sync jobs deprecated — booking engine uses real-time PMS queries" });
}
