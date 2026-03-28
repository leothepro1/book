export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron: Screenshot Pending
 * ════════════════════════
 *
 * Runs every 5 minutes. Picks up tenants with screenshotPending: true
 * and generates their screenshots. Sequential — one browser at a time.
 * Max 10 per run to avoid timeout cascade.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { generateTenantScreenshots } from "@/app/_lib/screenshots/generate";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const pending = await prisma.tenant.findMany({
    where: { screenshotPending: true },
    select: { id: true },
    take: 10,
  });

  if (pending.length === 0) {
    return Response.json({ ok: true, processed: 0 });
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const { id } of pending) {
    try {
      await generateTenantScreenshots(id);
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
      log("error", "cron.screenshot_pending.failed", {
        tenantId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  log("info", "cron.screenshot_pending.completed", {
    processed: results.length,
    succeeded,
    failed,
  });

  return Response.json({
    ok: true,
    processed: results.length,
    succeeded,
    failed,
    results,
  });
}
