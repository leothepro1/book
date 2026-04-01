/**
 * Campaign Sender
 * ═══════════════
 *
 * Sends a marketing email campaign to all recipients.
 * Idempotent — a SENDING campaign can be resumed after a crash.
 *
 * Flow:
 *   1. Claim campaign (SCHEDULED/SENDING → SENDING)
 *   2. Expand segment → CampaignRecipient rows
 *   3. Render template once
 *   4. Send in batches of 100
 *   5. Mark campaign SENT
 *
 * Never throws — returns { sent, failed, suppressed }.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { sendMarketingEmail } from "./sendMarketingEmail";
import { renderEmailBlocks, renderVariables } from "./renderEmailBlocks";
import { log } from "@/app/_lib/logger";

// ── Types ──────────────────────────────────────────────────────

interface SendCampaignResult {
  sent: number;
  failed: number;
  suppressed: number;
}

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 500;

// ── Main function ──────────────────────────────────────────────

export async function sendCampaign(
  campaignId: string,
): Promise<SendCampaignResult> {
  const empty: SendCampaignResult = { sent: 0, failed: 0, suppressed: 0 };

  try {
    // ── Step 1: Validate and claim ─────────────────────────

    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      include: {
        template: true,
        segment: true,
      },
    });

    if (!campaign) {
      log("warn", "campaign_send.not_found", { campaignId });
      return empty;
    }

    if (campaign.status !== "SCHEDULED" && campaign.status !== "SENDING") {
      log("warn", "campaign_send.invalid_status", {
        campaignId,
        status: campaign.status,
      });
      return empty;
    }

    // Atomic claim — only one process can move to SENDING
    const claimed = await prisma.emailCampaign.updateMany({
      where: {
        id: campaignId,
        status: { in: ["SCHEDULED", "SENDING"] },
      },
      data: { status: "SENDING" },
    });

    if (claimed.count === 0) {
      log("info", "campaign_send.already_claimed", { campaignId });
      return empty;
    }

    const { tenantId } = campaign;

    // ── Step 2: Expand segment to recipients ───────────────

    const existingCount = await prisma.campaignRecipient.count({
      where: { campaignId },
    });

    if (existingCount === 0) {
      await expandRecipients(campaignId, tenantId, campaign.segmentId);
    }

    // ── Step 3: Render template once ───────────────────────

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    const vars: Record<string, string> = {
      "tenant.name": tenant?.name ?? "",
    };

    const renderedSubject = renderVariables(campaign.template.subject, vars);
    const htmlBody = renderEmailBlocks(campaign.template.blocks, vars);

    // ── Step 4: Send in batches ────────────────────────────

    // Count total pending for progress logging
    const totalPending = await prisma.campaignRecipient.count({
      where: { campaignId, status: "PENDING" },
    });
    const totalBatches = Math.ceil(totalPending / BATCH_SIZE) || 1;

    let sent = 0;
    let failed = 0;
    let suppressed = 0;
    let batchNumber = 0;
    let hasMore = true;

    while (hasMore) {
      const recipients = await prisma.campaignRecipient.findMany({
        where: { campaignId, status: "PENDING" },
        include: {
          guest: {
            select: { email: true, firstName: true, lastName: true },
          },
        },
        take: BATCH_SIZE,
        orderBy: { createdAt: "asc" },
      });

      if (recipients.length === 0) {
        hasMore = false;
        break;
      }

      batchNumber++;

      log("info", "campaign_send.batch_start", {
        campaignId,
        tenantId,
        batch: batchNumber,
        totalBatches,
        sent,
        failed,
        suppressed,
      });

      for (const recipient of recipients) {
        // Re-check suppression (may have been added since expand)
        const isSuppressed = await prisma.emailSuppression.findUnique({
          where: {
            tenantId_email: {
              tenantId,
              email: recipient.email.toLowerCase(),
            },
          },
          select: { id: true },
        });

        if (isSuppressed) {
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: { status: "SUPPRESSED" },
          });
          suppressed++;
          continue;
        }

        const result = await sendMarketingEmail({
          tenantId,
          recipientEmail: recipient.email,
          recipientName: recipient.guest.firstName,
          subject: renderedSubject,
          htmlBody,
          campaignRecipientId: recipient.id,
        });

        if (result.success) {
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: {
              status: "SENT",
              resendMessageId: result.resendMessageId ?? null,
            },
          });
          sent++;
        } else {
          // Suppressed by sendMarketingEmail (double-check)
          if (result.error === "SUPPRESSED") {
            await prisma.campaignRecipient.update({
              where: { id: recipient.id },
              data: { status: "SUPPRESSED" },
            });
            suppressed++;
          } else {
            await prisma.campaignRecipient.update({
              where: { id: recipient.id },
              data: { status: "FAILED" },
            });
            failed++;
          }
        }
      }

      if (recipients.length < BATCH_SIZE) {
        hasMore = false;
      }

      // Delay between batches to respect Resend rate limits (skip after last batch)
      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    // ── Step 5: Finalize ───────────────────────────────────

    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        recipientCount: sent + failed + suppressed,
      },
    });

    await prisma.emailCampaignAnalytics.upsert({
      where: { campaignId },
      update: { sent },
      create: { campaignId, sent },
    });

    log("info", "campaign_send.completed", {
      campaignId,
      tenantId,
      sent,
      failed,
      suppressed,
    });

    return { sent, failed, suppressed };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log("error", "campaign_send.failed", {
      campaignId,
      error: message,
    });
    return empty;
  }
}

// ── Expand segment to CampaignRecipient rows ───────────────────

async function expandRecipients(
  campaignId: string,
  tenantId: string,
  segmentId: string | null,
): Promise<void> {
  // Fetch eligible guest IDs + emails
  let guests: Array<{ id: string; email: string }>;

  if (segmentId) {
    // Segment-targeted: guests with active membership
    const memberships = await prisma.guestSegmentMembership.findMany({
      where: {
        segmentId,
        tenantId,
        leftAt: null, // active members only
      },
      select: {
        guestAccount: {
          select: { id: true, email: true, emailMarketingState: true },
        },
      },
    });

    guests = memberships
      .filter((m) => m.guestAccount.emailMarketingState === "SUBSCRIBED")
      .map((m) => ({ id: m.guestAccount.id, email: m.guestAccount.email }));
  } else {
    // All subscribers for tenant
    guests = await prisma.guestAccount.findMany({
      where: {
        tenantId,
        emailMarketingState: "SUBSCRIBED",
      },
      select: { id: true, email: true },
    });
  }

  if (guests.length === 0) return;

  // Bulk suppression check
  const emails = guests.map((g) => g.email.toLowerCase());
  const suppressions = await prisma.emailSuppression.findMany({
    where: {
      tenantId,
      email: { in: emails },
    },
    select: { email: true },
  });
  const suppressedSet = new Set(suppressions.map((s) => s.email));

  // Filter out suppressed
  const eligible = guests.filter(
    (g) => !suppressedSet.has(g.email.toLowerCase()),
  );

  if (eligible.length === 0) return;

  // Create recipient rows
  await prisma.campaignRecipient.createMany({
    data: eligible.map((g) => ({
      campaignId,
      guestId: g.id,
      email: g.email.toLowerCase(),
      status: "PENDING" as const,
    })),
    skipDuplicates: true,
  });

  // Update recipient count on campaign
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { recipientCount: eligible.length },
  });

  log("info", "campaign_send.recipients_expanded", {
    campaignId,
    tenantId,
    total: guests.length,
    suppressed: suppressedSet.size,
    eligible: eligible.length,
  });
}
