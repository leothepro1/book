export const dynamic = "force-dynamic";

/**
 * Screenshot Backfill — one-time admin endpoint.
 * Marks all tenants without screenshots as pending.
 * Cron screenshot-pending handles the actual generation.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { Prisma } from "@prisma/client";
import { computeSettingsHash } from "@/app/_lib/screenshots/hash";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const tenants = await prisma.tenant.findMany({
    where: { screenshotDesktopUrl: null, settings: { not: Prisma.AnyNull } },
    select: { id: true, settings: true },
  });

  for (const tenant of tenants) {
    const hash = tenant.settings ? computeSettingsHash(tenant.settings) : "backfill";
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { screenshotPending: true, screenshotHash: hash },
    });
  }

  return Response.json({
    queued: tenants.length,
    message: "Cron screenshot-pending kommer ta hand om dessa",
  });
}
