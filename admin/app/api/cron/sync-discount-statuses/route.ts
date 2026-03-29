export const dynamic = "force-dynamic";

/**
 * Cron: Sync Discount Statuses
 * ────────────────────────────
 *
 * Transitions SCHEDULED → ACTIVE and ACTIVE → EXPIRED based on
 * startsAt / endsAt timestamps. Creates audit events for each
 * transition.
 *
 * Runs every 15 minutes via Vercel cron.
 */

import { env } from "@/app/_lib/env";
import { syncDiscountStatuses } from "@/app/_lib/discounts/status";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await syncDiscountStatuses();

  return Response.json({
    ok: true,
    ...result,
  });
}
