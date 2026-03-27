export const dynamic = "force-dynamic";

/**
 * Cron: Retry Failed Emails
 * ─────────────────────────
 *
 * Finds EmailSendLog entries with status=FAILED and nextRetryAt <= now,
 * and retries them via retrySendFromLog(). Max 50 per run.
 *
 * Runs every 5 minutes via Vercel cron.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";
import { retrySendFromLog } from "@/app/_lib/email/send";
import { log } from "@/app/_lib/logger";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const entries = await prisma.emailSendLog.findMany({
    where: {
      status: "FAILED",
      nextRetryAt: { lte: new Date() },
      attempts: { lt: 5 },
    },
    select: { id: true },
    take: 50,
    orderBy: { nextRetryAt: "asc" },
  });

  let succeeded = 0;
  let failed = 0;

  for (const entry of entries) {
    try {
      const result = await retrySendFromLog(entry.id);
      if (result.status === "sent") succeeded++;
      else failed++;
    } catch {
      failed++;
    }
  }

  log("info", "cron.retry_emails.completed", {
    processed: entries.length,
    succeeded,
    failed,
  });

  return Response.json({
    ok: true,
    processed: entries.length,
    succeeded,
    failed,
  });
}
