export const dynamic = "force-dynamic";

/**
 * Cron: Expire DraftOrders (FAS 6.5E)
 * ═══════════════════════════════════════════════════════════
 *
 * Sweeps DraftOrder rows past `expiresAt` whose status is still in a
 * cancellable working state (OPEN / PENDING_APPROVAL / APPROVED) and
 * routes each through `cancelDraft` with `actorSource: "cron"`.
 *
 * Mirrors release-expired-draft-holds (FAS 6.5C) shape: bounded batch,
 * concurrency pool, wall-budget. Idempotency, hold release, Stripe PI
 * cancellation are all owned by `cancelDraft` — this route is a thin
 * orchestrator around `sweepExpiredDrafts`.
 *
 * Schedule: every 10 min (vercel.json).
 * Auth: Bearer CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { env } from "@/app/_lib/env";
import { log } from "@/app/_lib/logger";
import { sweepExpiredDrafts } from "@/app/_lib/draft-orders/expire";

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
    const result = await sweepExpiredDrafts({ deadline });
    log("info", "draft.expire_cron.completed", {
      durationMs: result.durationMs,
      examined: result.examined,
      cancelled: result.cancelled,
      skipped: result.skipped,
      failed: result.failed,
      holdReleaseErrors: result.holdReleaseErrors,
      partial: result.partial,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // sweepExpiredDrafts is contractually non-throwing. This branch is
    // a defense against future regressions / unexpected runtime errors
    // (e.g. Prisma connection failure on the initial findMany).
    const message = err instanceof Error ? err.message : String(err);
    log("error", "draft.expire_cron.fatal", { error: message });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
