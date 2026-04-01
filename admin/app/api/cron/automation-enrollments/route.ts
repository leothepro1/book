export const dynamic = "force-dynamic";

/**
 * Cron: Process Automation Enrollments
 * ─────────────────────────────────────
 *
 * Claims and processes pending automation enrollments — sends the
 * next email step for each enrollment that is due.
 *
 * Runs every 2 minutes via Vercel cron.
 */

import { env } from "@/app/_lib/env";
import { processAutomationEnrollments } from "@/app/_lib/workers/automationEnrollmentWorker";
import { log } from "@/app/_lib/logger";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await processAutomationEnrollments();

  log("info", "cron.automation_enrollments.completed", {
    processed: result.processed,
    failed: result.failed,
  });

  return Response.json({
    ok: true,
    processed: result.processed,
    failed: result.failed,
  });
}
