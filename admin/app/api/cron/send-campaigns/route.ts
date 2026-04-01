export const dynamic = "force-dynamic";

/**
 * Cron: Send Scheduled Campaigns
 * ───────────────────────────────
 *
 * Picks up SCHEDULED campaigns whose scheduledAt has passed,
 * plus SENDING campaigns (resuming after crash).
 * Only processes campaigns for tenants with an active EmailAppInstallation.
 *
 * Runs every 5 minutes via Vercel cron.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";
import { sendCampaign } from "@/app/_lib/email/sendCampaign";
import { log } from "@/app/_lib/logger";

interface CampaignResult {
  campaignId: string;
  sent: number;
  failed: number;
  suppressed: number;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const campaigns = await prisma.emailCampaign.findMany({
    where: {
      OR: [
        { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
        { status: "SENDING" },
      ],
      tenant: {
        emailAppInstallation: { status: "ACTIVE" },
      },
    },
    select: { id: true },
    orderBy: { scheduledAt: "asc" },
  });

  const results: CampaignResult[] = [];

  // Sequential — avoid hammering Resend and database
  for (const campaign of campaigns) {
    const result = await sendCampaign(campaign.id);
    results.push({
      campaignId: campaign.id,
      ...result,
    });
  }

  log("info", "cron.send_campaigns.completed", {
    campaignCount: campaigns.length,
  });

  return Response.json({
    ok: true,
    campaigns: results,
  });
}
