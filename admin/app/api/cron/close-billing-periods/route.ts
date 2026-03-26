export const dynamic = "force-dynamic";

/**
 * Cron: Close Billing Periods
 * ───────────────────────────
 *
 * Runs daily at 00:15 UTC. Finds OPEN periods whose periodEnd
 * is in the past and closes them. Generates invoices for PENDING
 * periods if billingEnabled is true.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { closePeriod, generateInvoice } from "@/app/_lib/apps/billing";
import { log } from "@/app/_lib/logger";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();

  // 1. Close OPEN periods that have ended
  const openPeriods = await prisma.tenantBillingPeriod.findMany({
    where: { status: "OPEN", periodEnd: { lt: now } },
    select: { id: true },
  });

  let closed = 0;
  for (const period of openPeriods) {
    try {
      await closePeriod(period.id);
      closed++;
    } catch (err) {
      log("error", "cron.close_billing_period_failed", {
        periodId: period.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 2. Generate invoices for PENDING periods
  const pendingPeriods = await prisma.tenantBillingPeriod.findMany({
    where: { status: "PENDING" },
    select: { id: true },
  });

  let invoiced = 0;
  for (const period of pendingPeriods) {
    try {
      await generateInvoice(period.id);
      invoiced++;
    } catch (err) {
      log("error", "cron.generate_invoice_failed", {
        periodId: period.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (closed > 0 || invoiced > 0) {
    log("info", "cron.close_billing_periods", { closed, invoiced });
  }

  return Response.json({ closed, invoiced });
}
