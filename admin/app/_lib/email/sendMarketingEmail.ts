/**
 * Marketing Email Sender
 * ══════════════════════
 *
 * Sends marketing emails (campaigns, automations) via Resend.
 * SEPARATE from sendEmailEvent() which handles transactional mail.
 * They share sender infrastructure (Resend, from-address resolution)
 * but are different flows with different suppression models.
 *
 * - sendEmailEvent()       → transactional (order confirmations etc)
 * - sendMarketingEmail()   → marketing (campaigns, automations)
 */

import { prisma } from "@/app/_lib/db/prisma";
import { resendClient } from "./client";
import { generateUnsubscribeToken } from "./unsubscribe-token";
import { tenantFromAddress } from "@/app/_lib/tenant/portal-slug";
import { log } from "@/app/_lib/logger";

// ── Types ──────────────────────────────────────────────────────

export interface SendMarketingEmailParams {
  tenantId: string;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  htmlBody: string;
  campaignRecipientId?: string;
  enrollmentId?: string;
}

interface SendMarketingEmailResult {
  success: boolean;
  resendMessageId?: string;
  error?: string;
}

// ── Main function ──────────────────────────────────────────────

export async function sendMarketingEmail(
  params: SendMarketingEmailParams,
): Promise<SendMarketingEmailResult> {
  const {
    tenantId,
    recipientEmail,
    recipientName,
    subject,
    htmlBody,
    campaignRecipientId,
    enrollmentId,
  } = params;

  const normalizedEmail = recipientEmail.toLowerCase();

  // 1. Resolve sender address
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true,
      portalSlug: true,
      emailFrom: true,
      emailFromName: true,
    },
  });

  if (!tenant) {
    log("error", "marketing_email.tenant_not_found", { tenantId });
    return { success: false, error: "Tenant not found" };
  }

  if (!tenant.portalSlug && !tenant.emailFrom) {
    log("warn", "marketing_email.no_sender", { tenantId });
    return { success: false, error: "No sender configured" };
  }

  const from = tenantFromAddress(
    tenant.name,
    tenant.portalSlug,
    tenant.emailFrom,
    tenant.emailFromName,
  );

  // 2. Check suppression list
  const suppression = await prisma.emailSuppression.findUnique({
    where: { tenantId_email: { tenantId, email: normalizedEmail } },
    select: { id: true },
  });

  if (suppression) {
    log("info", "marketing_email.suppressed", {
      tenantId,
      email: normalizedEmail,
      campaignRecipientId: campaignRecipientId ?? null,
      enrollmentId: enrollmentId ?? null,
    });
    return { success: false, error: "SUPPRESSED" };
  }

  // 3. Build unsubscribe URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const unsubscribeToken = generateUnsubscribeToken(tenantId, normalizedEmail);
  const unsubscribeUrl =
    `${appUrl}/email-unsubscribe?` +
    `tenant=${tenantId}&email=${encodeURIComponent(normalizedEmail)}&` +
    `token=${unsubscribeToken}`;

  // 4. Send via Resend
  try {
    const toAddress = recipientName
      ? `${recipientName} <${normalizedEmail}>`
      : normalizedEmail;

    const { data, error } = await resendClient.emails.send({
      from,
      to: toAddress,
      subject,
      html: htmlBody,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (error) {
      log("error", "marketing_email.resend_error", {
        tenantId,
        email: normalizedEmail,
        error: error.message,
        campaignRecipientId: campaignRecipientId ?? null,
        enrollmentId: enrollmentId ?? null,
      });
      return { success: false, error: error.message };
    }

    const resendMessageId = data?.id ?? undefined;

    log("info", "marketing_email.sent", {
      tenantId,
      email: normalizedEmail,
      resendMessageId: resendMessageId ?? null,
      campaignRecipientId: campaignRecipientId ?? null,
      enrollmentId: enrollmentId ?? null,
    });

    return { success: true, resendMessageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log("error", "marketing_email.send_failed", {
      tenantId,
      email: normalizedEmail,
      error: message,
      campaignRecipientId: campaignRecipientId ?? null,
      enrollmentId: enrollmentId ?? null,
    });
    return { success: false, error: message };
  }
}
