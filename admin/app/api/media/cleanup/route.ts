export const dynamic = "force-dynamic";

/**
 * Media API — Cleanup
 *
 * POST /api/media/cleanup
 * Permanently deletes soft-deleted assets past the grace period.
 * Intended for cron jobs — protected by a secret header.
 */

import { NextRequest, NextResponse } from "next/server";
import { cleanupDeletedMedia } from "@/app/_lib/media";
import { env } from "@/app/_lib/env";

const CLEANUP_SECRET = env.MEDIA_CLEANUP_SECRET;

export async function POST(req: NextRequest) {
  // Protect with a shared secret (for cron job auth)
  if (CLEANUP_SECRET) {
    const authHeader = req.headers.get("x-cleanup-secret");
    if (authHeader !== CLEANUP_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const gracePeriodMs = (body as any).gracePeriodMs ?? undefined;

    const result = await cleanupDeletedMedia(gracePeriodMs);

    console.log(`[Media Cleanup] Processed: ${result.processed}, Errors: ${result.errors}`);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Media Cleanup] Error:", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
