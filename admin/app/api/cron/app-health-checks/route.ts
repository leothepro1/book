export const dynamic = "force-dynamic";

/**
 * Cron: App Health Checks
 * ───────────────────────
 *
 * Runs every 5 minutes. Finds all ACTIVE apps with healthCheck config
 * whose nextCheckAt has passed, and runs checkAppHealth() for each.
 *
 * Failure for one app never aborts others — try/catch per app.
 * PAUSED apps are never checked.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { checkAppHealth } from "@/app/_lib/apps/health";
import { getApp } from "@/app/_lib/apps/registry";
import { log } from "@/app/_lib/logger";

// Force registration
import "@/app/_lib/apps/definitions/google-ads";
import "@/app/_lib/apps/definitions/meta-ads";
import "@/app/_lib/apps/definitions/email-marketing";
import "@/app/_lib/apps/definitions/channel-manager";
import "@/app/_lib/apps/definitions/revenue-analytics";
import "@/app/_lib/apps/definitions/guest-crm";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();

  // Find all ACTIVE apps that are due for a health check
  const activeApps = await prisma.tenantApp.findMany({
    where: { status: "ACTIVE" },
    select: { tenantId: true, appId: true },
  });

  // Filter to those with healthCheck config and nextCheckAt <= now
  const toCheck: Array<{ tenantId: string; appId: string }> = [];

  for (const app of activeApps) {
    const def = getApp(app.appId);
    if (!def?.healthCheck) continue;

    // Check if due
    const health = await prisma.tenantAppHealth.findUnique({
      where: { tenantId_appId: { tenantId: app.tenantId, appId: app.appId } },
      select: { nextCheckAt: true },
    });

    // If no health record or nextCheckAt has passed, check now
    if (!health || !health.nextCheckAt || health.nextCheckAt <= now) {
      toCheck.push(app);
    }
  }

  let checked = 0;
  let errors = 0;

  let internalSecret: string;
  try {
    internalSecret = env.INTERNAL_API_SECRET;
  } catch {
    log("error", "cron.app_health_checks", { error: "INTERNAL_API_SECRET not configured" });
    return Response.json({ error: "INTERNAL_API_SECRET not configured" }, { status: 500 });
  }

  for (const app of toCheck) {
    try {
      await checkAppHealth(app.tenantId, app.appId, internalSecret);
      checked++;
    } catch (err) {
      errors++;
      log("error", "cron.app_health_check_failed", {
        tenantId: app.tenantId,
        appId: app.appId,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (checked > 0 || errors > 0) {
    log("info", "cron.app_health_checks", { checked, errors, total: toCheck.length });
  }

  return Response.json({ checked, errors, total: toCheck.length });
}
