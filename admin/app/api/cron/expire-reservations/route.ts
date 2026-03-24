export const dynamic = "force-dynamic";

/**
 * Cron: Expire Stale Inventory Reservations
 * ──────────────────────────────────────────
 *
 * Safety net for reservations that were never consumed or released
 * (e.g. Stripe webhook never fired due to network issue).
 *
 * Run every 5 minutes via Vercel cron or external scheduler.
 * Uses CRON_SECRET for auth (same pattern as existing backfill endpoints).
 */

import { env } from "@/app/_lib/env";
import { releaseExpiredReservations } from "@/app/_lib/products/inventory";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await releaseExpiredReservations();

  return Response.json({ ok: true, released: result.released });
}
