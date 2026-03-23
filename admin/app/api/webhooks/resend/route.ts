export const dynamic = "force-dynamic";

/**
 * Resend Webhook Receiver
 * ═══════════════════════
 *
 * Processes delivery events from Resend (sent, delivered, bounced,
 * complained). Updates EmailSendLog status and auto-unsubscribes
 * on bounce/complaint.
 *
 * Verification uses svix — same pattern as the Clerk webhook handler.
 */

import { Webhook } from "svix";
import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";

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
  };
};

const STATUS_MAP: Record<string, string> = {
  "email.sent": "SENT",
  "email.delivered": "DELIVERED",
  "email.bounced": "BOUNCED",
  "email.complained": "COMPLAINED",
};

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
  try {
    const wh = new Webhook(env.RESEND_WEBHOOK_SECRET);
    event = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ResendWebhookEvent;
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const resendId = event.data.email_id;

  // Map event type to status
  const mappedStatus = STATUS_MAP[event.type];

  if (mappedStatus) {
    // Update send log status
    await prisma.emailSendLog.updateMany({
      where: { resendId },
      data: { status: mappedStatus as "SENT" | "DELIVERED" | "BOUNCED" | "COMPLAINED" },
    });

    // Auto-unsubscribe on bounce or complaint
    if (event.type === "email.bounced" || event.type === "email.complained") {
      const log = await prisma.emailSendLog.findFirst({
        where: { resendId },
        select: { tenantId: true, toEmail: true },
      });

      if (log) {
        await prisma.emailUnsubscribe.upsert({
          where: {
            tenantId_email: { tenantId: log.tenantId, email: log.toEmail },
          },
          update: {},
          create: {
            tenantId: log.tenantId,
            email: log.toEmail,
          },
        });
      }
    }
  }

  // Always return 200 — Resend retries on non-2xx
  return new Response("OK", { status: 200 });
}
