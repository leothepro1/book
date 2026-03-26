export const dynamic = "force-dynamic";

/**
 * Cron: Email Marketing Full Sync
 *
 * Runs daily at 03:00 UTC. Syncs all contacts for all ACTIVE
 * email marketing apps. Handles lapsed segment recomputation.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { syncAllContacts } from "@/app/_lib/apps/email-marketing/sync";
import { getEmailAdapter } from "@/app/_lib/apps/email-marketing/adapters";
import { log } from "@/app/_lib/logger";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Find all ACTIVE email marketing apps
  const emailApps = await prisma.tenantApp.findMany({
    where: {
      status: "ACTIVE",
      appId: { in: ["mailchimp"] }, // Add "klaviyo", "mailerlite" when ready
    },
    select: { tenantId: true, appId: true, settings: true },
  });

  let synced = 0;
  let errors = 0;

  for (const app of emailApps) {
    try {
      const settings = (app.settings as Record<string, Record<string, unknown>>) ?? {};
      const apiKey = (settings["api-key"]?.apiKey as string) ?? "";
      const listId = (settings["list-select"]?.selectedValue as string) ?? "";

      if (!apiKey || !listId) continue;

      const adapter = getEmailAdapter(app.appId);
      const result = await syncAllContacts(app.tenantId, app.appId, adapter, apiKey, listId, settings["automations"] ?? {});
      synced += result.synced;
      errors += result.failed;
    } catch (err) {
      errors++;
      log("error", "cron.email_marketing_sync_failed", {
        tenantId: app.tenantId,
        appId: app.appId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (synced > 0 || errors > 0) {
    log("info", "cron.email_marketing_sync", { synced, errors, apps: emailApps.length });
  }

  return Response.json({ synced, errors, apps: emailApps.length });
}
