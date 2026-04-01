export const dynamic = "force-dynamic";

/**
 * Resend Webhook Receiver
 * ═══════════════════════
 *
 * Processes delivery events from Resend (sent, delivered, bounced,
 * complained, opened, clicked). Updates:
 *
 * 1. EmailSendLog status (transactional emails)
 * 2. CampaignRecipient status + analytics (marketing campaigns)
 * 3. EmailSuppression on hard bounce / 3x soft bounce / complaint
 *
 * Verification uses svix — same pattern as the Clerk webhook handler.
 */

import { Webhook } from "svix";
import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";
import { log } from "@/app/_lib/logger";
import type { BounceType } from "@prisma/client";

// ── Types ───────────────────────────────────────────────────────

type ResendWebhookEvent = {
  type:
    | "email.sent"
    | "email.delivered"
    | "email.bounced"
    | "email.complained"
    | "email.opened"
    | "email.clicked";
  data: {
    email_id: string;
    to: string[];
    subject: string;
    bounce?: {
      type?: string;
      message?: string;
    };
  };
};

const STATUS_MAP: Record<string, string> = {
  "email.sent": "SENT",
  "email.delivered": "DELIVERED",
  "email.bounced": "BOUNCED",
  "email.complained": "COMPLAINED",
};

const SOFT_BOUNCE_THRESHOLD = 3;

// ── Handler ─────────────────────────────────────────────────────

export async function POST(req: Request) {
  // Verify signature
  const svixId = req.headers.get("svix-id") ?? "";
  const svixTimestamp = req.headers.get("svix-timestamp") ?? "";
  const svixSignature = req.headers.get("svix-signature") ?? "";

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const payload = await req.text();

  let event: ResendWebhookEvent;
  let rawPayload: unknown;
  try {
    const wh = new Webhook(env.RESEND_WEBHOOK_SECRET);
    const verified = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
    event = verified as ResendWebhookEvent;
    rawPayload = verified;
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const resendId = event.data.email_id;

  // ── 1. Update transactional EmailSendLog ──────────────────

  const mappedStatus = STATUS_MAP[event.type];

  if (mappedStatus) {
    try {
      await prisma.emailSendLog.updateMany({
        where: { resendId },
        data: { status: mappedStatus as "SENT" | "DELIVERED" | "BOUNCED" | "COMPLAINED" },
      });
    } catch (err) {
      log("error", "resend_webhook.send_log_update_failed", {
        resendId,
        eventType: event.type,
        error: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  // ── 2. Update marketing CampaignRecipient + analytics ─────

  try {
    await handleMarketingEvent(resendId, event);
  } catch (err) {
    log("error", "resend_webhook.marketing_handler_failed", {
      resendId,
      eventType: event.type,
      error: err instanceof Error ? err.message : "Unknown",
    });
  }

  // ── 3. Handle bounce / complaint suppression ──────────────

  if (event.type === "email.bounced") {
    try {
      await handleBounce(resendId, event, rawPayload);
    } catch (err) {
      log("error", "resend_webhook.bounce_handler_failed", {
        resendId,
        error: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  if (event.type === "email.complained") {
    try {
      await handleComplaint(resendId);
    } catch (err) {
      log("error", "resend_webhook.complaint_handler_failed", {
        resendId,
        error: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  // Always return 200 — Resend retries on non-2xx
  return new Response("OK", { status: 200 });
}

// ── Marketing event handler ─────────────────────────────────────

async function handleMarketingEvent(
  resendId: string,
  event: ResendWebhookEvent,
) {
  // Find CampaignRecipient by resendMessageId
  const recipient = await prisma.campaignRecipient.findFirst({
    where: { resendMessageId: resendId },
    select: {
      id: true,
      campaignId: true,
      openedAt: true,
      clickedAt: true,
      campaign: { select: { tenantId: true } },
    },
  });

  if (!recipient) return;

  const { campaignId } = recipient;
  const tenantId = recipient.campaign.tenantId;

  log("info", "resend_webhook.marketing_event", {
    tenantId,
    resendId,
    eventType: event.type,
    campaignId,
    recipientId: recipient.id,
  });

  switch (event.type) {
    case "email.delivered": {
      await prisma.emailCampaignAnalytics.upsert({
        where: { campaignId },
        update: { delivered: { increment: 1 } },
        create: { campaignId, delivered: 1 },
      });
      break;
    }

    case "email.opened": {
      // Only count unique opens (first time)
      if (!recipient.openedAt) {
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { openedAt: new Date() },
        });
        await prisma.emailCampaignAnalytics.upsert({
          where: { campaignId },
          update: { opened: { increment: 1 } },
          create: { campaignId, opened: 1 },
        });
      }
      break;
    }

    case "email.clicked": {
      // Only count unique clicks (first time)
      if (!recipient.clickedAt) {
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { clickedAt: new Date() },
        });
        await prisma.emailCampaignAnalytics.upsert({
          where: { campaignId },
          update: { clicked: { increment: 1 } },
          create: { campaignId, clicked: 1 },
        });
      }
      break;
    }

    case "email.bounced": {
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { bouncedAt: new Date() },
      });
      await prisma.emailCampaignAnalytics.upsert({
        where: { campaignId },
        update: { bounced: { increment: 1 } },
        create: { campaignId, bounced: 1 },
      });
      break;
    }

    case "email.complained": {
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { complainedAt: new Date() },
      });
      await prisma.emailCampaignAnalytics.upsert({
        where: { campaignId },
        update: { complained: { increment: 1 } },
        create: { campaignId, complained: 1 },
      });
      break;
    }
  }
}

// ── Bounce handler ──────────────────────────────────────────────

function resolveBounceType(event: ResendWebhookEvent): BounceType {
  const raw = event.data.bounce?.type?.toLowerCase();
  if (raw === "soft" || raw === "temporary") return "SOFT";
  // Hard, permanent, or unknown → treat as HARD (safe default)
  return "HARD";
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const prefix = local.slice(0, 3);
  return `${prefix}***@${domain}`;
}

async function handleBounce(
  resendId: string,
  event: ResendWebhookEvent,
  rawPayload: unknown,
) {
  // Resolve tenant + email from either source
  const { tenantId, email } = await resolveEmailContext(resendId);
  if (!tenantId || !email) return;

  const normalizedEmail = email.toLowerCase();
  const bounceType = resolveBounceType(event);

  // Always record the bounce event
  await prisma.emailBounceEvent.create({
    data: {
      tenantId,
      email: normalizedEmail,
      bounceType,
      resendMessageId: resendId,
      rawPayload: JSON.parse(JSON.stringify(rawPayload ?? {})),
    },
  });

  let suppressed = false;

  if (bounceType === "HARD") {
    // Hard bounce → suppress immediately
    await upsertSuppression(tenantId, normalizedEmail, "BOUNCE");
    await upsertTransactionalUnsubscribe(tenantId, normalizedEmail, resendId);
    suppressed = true;
  } else {
    // Soft bounce → suppress after threshold
    const softCount = await prisma.emailBounceEvent.count({
      where: {
        tenantId,
        email: normalizedEmail,
        bounceType: "SOFT",
      },
    });

    if (softCount >= SOFT_BOUNCE_THRESHOLD) {
      await upsertSuppression(tenantId, normalizedEmail, "BOUNCE");
      await upsertTransactionalUnsubscribe(tenantId, normalizedEmail, resendId);
      suppressed = true;
    }
  }

  log("info", "resend_webhook.bounce_processed", {
    tenantId,
    email: maskEmail(normalizedEmail),
    bounceType,
    suppressed,
    resendId,
  });
}

// ── Complaint handler ───────────────────────────────────────────

async function handleComplaint(resendId: string) {
  const { tenantId, email, marketingRecipientId } =
    await resolveEmailContext(resendId);
  if (!tenantId || !email) return;

  const normalizedEmail = email.toLowerCase();

  await upsertSuppression(tenantId, normalizedEmail, "COMPLAINT");
  await upsertTransactionalUnsubscribe(tenantId, normalizedEmail, resendId);

  // Mark CampaignRecipient as unsubscribed
  if (marketingRecipientId) {
    await prisma.campaignRecipient.update({
      where: { id: marketingRecipientId },
      data: { unsubscribedAt: new Date() },
    });

    const campaign = await prisma.campaignRecipient.findUnique({
      where: { id: marketingRecipientId },
      select: { campaignId: true },
    });
    if (campaign) {
      await prisma.emailCampaignAnalytics.upsert({
        where: { campaignId: campaign.campaignId },
        update: { unsubscribed: { increment: 1 } },
        create: { campaignId: campaign.campaignId, unsubscribed: 1 },
      });
    }
  }

  log("info", "resend_webhook.complaint_processed", {
    tenantId,
    email: maskEmail(normalizedEmail),
  });
}

// ── Shared helpers ──────────────────────────────────────────────

async function resolveEmailContext(resendId: string): Promise<{
  tenantId: string | null;
  email: string | null;
  marketingRecipientId: string | null;
}> {
  const sendLog = await prisma.emailSendLog.findFirst({
    where: { resendId },
    select: { tenantId: true, toEmail: true },
  });

  const marketingRecipient = await prisma.campaignRecipient.findFirst({
    where: { resendMessageId: resendId },
    select: {
      id: true,
      email: true,
      campaign: { select: { tenantId: true } },
    },
  });

  const tenantId =
    sendLog?.tenantId ?? marketingRecipient?.campaign.tenantId ?? null;
  const email =
    sendLog?.toEmail ?? marketingRecipient?.email ?? null;
  const marketingRecipientId = marketingRecipient?.id ?? null;

  return { tenantId, email, marketingRecipientId };
}

async function upsertSuppression(
  tenantId: string,
  email: string,
  reason: "BOUNCE" | "COMPLAINT",
): Promise<void> {
  await prisma.emailSuppression.upsert({
    where: { tenantId_email: { tenantId, email } },
    update: { bounceCount: { increment: 1 } },
    create: { tenantId, email, reason, bounceCount: 1 },
  });
}

async function upsertTransactionalUnsubscribe(
  tenantId: string,
  email: string,
  resendId: string,
): Promise<void> {
  // Only upsert if this was a transactional email
  const sendLog = await prisma.emailSendLog.findFirst({
    where: { resendId },
    select: { id: true },
  });

  if (sendLog) {
    await prisma.emailUnsubscribe.upsert({
      where: { tenantId_email: { tenantId, email } },
      update: {},
      create: { tenantId, email },
    });
  }
}
