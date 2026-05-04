export const dynamic = "force-dynamic";

/**
 * Cron: Mark INVOICED draft orders OVERDUE (FAS 7.5 / Path B "lite")
 * ═══════════════════════════════════════════════════════════════════
 *
 * Sweeps DraftOrder rows whose status is INVOICED and whose
 * `shareLinkExpiresAt` has been past for at least the configured
 * grace window (default 3 days), and routes each through the
 * existing `transitionDraftStatusInTx` helper to flip them to
 * OVERDUE. Mirrors expire-draft-orders/route.ts 1:1; only the
 * service binding and log key prefix change.
 *
 * Schedule: daily at 06:15 UTC (vercel.json).
 * Auth: Bearer CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { env } from "@/app/_lib/env";
import { log } from "@/app/_lib/logger";
import { markOverdueDrafts } from "@/app/_lib/draft-orders/overdue";

const ROUTE_WALL_BUDGET_MS = 55_000;

export async function GET(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const start = Date.now();
  const deadline = start + ROUTE_WALL_BUDGET_MS;

  try {
    const result = await markOverdueDrafts({ deadline });
    log("info", "draft.overdue_cron.completed", {
      durationMs: result.durationMs,
      examined: result.examined,
      marked: result.marked,
      skipped: result.skipped,
      failed: result.failed,
      partial: result.partial,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // markOverdueDrafts is contractually non-throwing for per-row work,
    // but the initial findMany can still propagate (e.g. Prisma connection
    // failure). This branch exists to ensure the cron route never returns
    // an unhandled stack trace.
    const message = err instanceof Error ? err.message : String(err);
    log("error", "draft.overdue_cron.fatal", { error: message });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
