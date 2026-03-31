/**
 * Email Send Layer
 * ════════════════
 *
 * Core send logic for the email notification system.
 * sendEmailEvent() is the only public function — all other
 * helpers are internal to this file.
 *
 * No logging of email addresses, content, or API keys.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { resendClient } from "./client";
import { getEventDefinition } from "./registry";
import { renderTemplate, injectPreviewText } from "./template-utils";
import { renderDefaultTemplate } from "./templates";
import { generateUnsubscribeToken } from "./unsubscribe-token";
import { checkEmailRateLimit, recordEmailSend } from "./rate-limit";
import { tenantFromAddress } from "@/app/_lib/tenant/portal-slug";
import { resolveBranding } from "./branding";
import { resolveTemplateHtml } from "./template-overrides";
import type { EmailEventType } from "./registry";
import type { ResolvedEmailTemplate } from "./types";

const IS_DEV = process.env.NODE_ENV === "development";
const MAX_ATTEMPTS = 5;

// ── Backoff ─────────────────────────────────────────────────────

/**
 * Exponential backoff with cap: 5min → 15min → 1h → 4h → 24h
 */
function getNextRetryAt(attempts: number): Date {
  const delays = [5, 15, 60, 240, 1440]; // minutes
  const delayMinutes = delays[Math.min(attempts, delays.length - 1)];
  return new Date(Date.now() + delayMinutes * 60 * 1000);
}

// ── Result type ─────────────────────────────────────────────────

export type EmailSendResult =
  | { status: "sent" }
  | { status: "rate_limited" }
  | { status: "skipped_unsubscribed" }
  | { status: "event_disabled" }
  | { status: "failed"; error: unknown };

// ── getResolvedTemplate ─────────────────────────────────────────

/**
 * Fetch tenant + override from DB, merge with registry defaults,
 * and return a fully resolved template ready for variable substitution.
 */
async function getResolvedTemplate(
  tenantId: string,
  eventType: EmailEventType,
  variables: Record<string, string>,
): Promise<ResolvedEmailTemplate> {
  const [tenant, override] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        id: true, name: true, emailFrom: true, emailFromName: true,
        portalSlug: true, emailLogoUrl: true, emailLogoWidth: true, emailAccentColor: true,
      },
    }),
    prisma.emailTemplate.findUnique({
      where: { tenantId_eventType: { tenantId, eventType } },
    }),
  ]);

  const def = getEventDefinition(eventType);

  // Resolve branding — only applied to platform default templates
  const branding = resolveBranding(tenant);

  // Render platform default (with branding) as fallback
  const defaultHtml = await renderDefaultTemplate(eventType, variables, branding);

  // resolveTemplateHtml is the single source of truth for default vs override
  const { html } = resolveTemplateHtml(eventType, override?.html, defaultHtml);

  const subject = override?.subject ?? def.defaultSubject;
  const previewText = override?.previewText ?? def.defaultPreviewText;

  // Resolve from address — priority:
  // 1. Custom emailFrom (tenant verified their own domain)
  // 2. portalSlug-based: noreply@{slug}.rutgr.com
  // 3. Fallback: noreply@rutgr.com (no portalSlug)
  const from = tenantFromAddress(
    tenant.name,
    tenant.portalSlug,
    tenant.emailFrom,
    tenant.emailFromName,
  );

  return { subject, previewText, html, from };
}

// ── sendEmailEvent (public) ─────────────────────────────────────

/**
 * Send an email notification for a specific event type.
 *
 * This is the only public function in the email module's send layer.
 * All triggers (booking confirmed, magic link, etc.) call this function.
 * Nothing else in the codebase calls resendClient directly.
 *
 * Flow:
 *   1. Check unsubscribe — skip silently if opted out
 *   2. Check rate limit — skip silently if exceeded
 *   3. Create send log entry (QUEUED)
 *   4. Resolve template + render
 *   5. Send via Resend with List-Unsubscribe headers
 *   6. Update log entry (SENT or FAILED with retry)
 *   7. Record send for rate limiting
 *
 * Returns an EmailSendResult indicating what happened.
 */
export async function sendEmailEvent(
  tenantId: string,
  eventType: EmailEventType,
  to: string,
  variables: Record<string, string>,
  options?: { testMode?: boolean; giftCardId?: string },
): Promise<EmailSendResult> {
  // 1. Check unsubscribe — must be first, before any template work
  const unsubscribed = await prisma.emailUnsubscribe.findUnique({
    where: { tenantId_email: { tenantId, email: to } },
    select: { id: true },
  });
  if (unsubscribed) return { status: "skipped_unsubscribed" };

  // 1b. Check if event is disabled for this tenant (only for canDisable events)
  const registryEntry = getEventDefinition(eventType);
  if (registryEntry.canDisable) {
    const setting = await prisma.emailTemplate.findUnique({
      where: { tenantId_eventType: { tenantId, eventType } },
      select: { enabled: true },
    });
    if (setting && !setting.enabled) return { status: "event_disabled" };
  }

  // 2. Check rate limit — skip silently if exceeded
  // GIFT_CARD_SENT uses giftCardId as key so the same recipient can
  // receive multiple different gift cards without being rate-limited.
  const rateLimitKey = eventType === "GIFT_CARD_SENT" && options?.giftCardId
    ? `gc:${options.giftCardId}`
    : to;
  const allowed = await checkEmailRateLimit(tenantId, rateLimitKey, eventType);
  if (!allowed) {
    console.warn(
      `[email] Rate limit reached: ${eventType} to ${to} for tenant ${tenantId}`,
    );
    return { status: "rate_limited" };
  }

  // 3. Create send log entry — store variables for retry replay
  const logEntry = await prisma.emailSendLog.create({
    data: {
      tenantId,
      eventType,
      toEmail: to,
      status: "QUEUED",
      variables: variables as unknown as import("@prisma/client").Prisma.InputJsonValue,
    },
  });

  return attemptSend(logEntry.id, tenantId, eventType, to, variables, rateLimitKey, options);
}

// ── retrySendFromLog (used by cron) ─────────────────────────────

/**
 * Retry a previously failed email using data stored on the log entry.
 * Called exclusively by the retry-emails cron job.
 */
export async function retrySendFromLog(logId: string): Promise<EmailSendResult> {
  const entry = await prisma.emailSendLog.findUniqueOrThrow({
    where: { id: logId },
    select: { id: true, tenantId: true, eventType: true, toEmail: true, variables: true, attempts: true },
  });

  const variables = (entry.variables as Record<string, string>) ?? {};

  return attemptSend(entry.id, entry.tenantId, entry.eventType, entry.toEmail, variables, entry.toEmail);
}

// ── attemptSend (internal) ──────────────────────────────────────

async function attemptSend(
  logId: string,
  tenantId: string,
  eventType: EmailEventType,
  to: string,
  variables: Record<string, string>,
  rateLimitKey: string,
  options?: { testMode?: boolean; giftCardId?: string },
): Promise<EmailSendResult> {
  // Resolve template + render
  const resolved = await getResolvedTemplate(tenantId, eventType, variables);

  const renderedSubject = options?.testMode
    ? `[TEST] ${renderTemplate(resolved.subject, variables)}`
    : renderTemplate(resolved.subject, variables);
  const renderedPreviewText = renderTemplate(resolved.previewText, variables);
  const renderedHtml = renderTemplate(resolved.html, variables);
  const finalHtml = injectPreviewText(renderedHtml, renderedPreviewText);

  // Build unsubscribe URL + headers
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const unsubscribeToken = generateUnsubscribeToken(tenantId, to);
  const unsubscribeUrl =
    `${appUrl}/unsubscribe?` +
    `tenant=${tenantId}&email=${encodeURIComponent(to)}&` +
    `token=${unsubscribeToken}`;

  // Send via Resend (or log in dev mode)
  try {
    if (IS_DEV) {
      console.log(
        `\n[email-dev] ════════════════════════════════════════`,
        `\n  Event:   ${eventType}`,
        `\n  To:      ${to}`,
        `\n  From:    ${resolved.from}`,
        `\n  Subject: ${renderedSubject}`,
        `\n  Preview: ${renderedPreviewText}`,
        `\n  HTML:    ${finalHtml.length} chars`,
        `\n════════════════════════════════════════════════════\n`,
      );

      await prisma.emailSendLog.update({
        where: { id: logId },
        data: {
          status: "SENT",
          resendId: `dev_${Date.now()}`,
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          nextRetryAt: null,
          failureReason: null,
        },
      });

      await recordEmailSend(tenantId, rateLimitKey, eventType);
      return { status: "sent" };
    }

    const { data, error } = await resendClient.emails.send({
      from: resolved.from,
      to,
      subject: renderedSubject,
      html: finalHtml,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    // Success — update log
    await prisma.emailSendLog.update({
      where: { id: logId },
      data: {
        status: "SENT",
        resendId: data?.id ?? null,
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        nextRetryAt: null,
        failureReason: null,
      },
    });

    await recordEmailSend(tenantId, to, eventType);
    return { status: "sent" };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);

    // Read current attempts to decide status
    const current = await prisma.emailSendLog.findUnique({
      where: { id: logId },
      select: { attempts: true },
    });
    const newAttempts = (current?.attempts ?? 0) + 1;

    if (newAttempts >= MAX_ATTEMPTS) {
      await prisma.emailSendLog.update({
        where: { id: logId },
        data: {
          status: "PERMANENTLY_FAILED",
          attempts: newAttempts,
          lastAttemptAt: new Date(),
          nextRetryAt: null,
          failureReason: reason,
        },
      });
      log("error", "email.permanently_failed", {
        emailLogId: logId,
        tenantId,
        eventType,
        attempts: newAttempts,
        failureReason: reason,
      });
    } else {
      const nextRetryAt = getNextRetryAt(newAttempts);
      await prisma.emailSendLog.update({
        where: { id: logId },
        data: {
          status: "FAILED",
          attempts: newAttempts,
          lastAttemptAt: new Date(),
          nextRetryAt,
          failureReason: reason,
        },
      });
      log("error", "email.send.failed", {
        emailLogId: logId,
        tenantId,
        eventType,
        attempts: newAttempts,
        failureReason: reason,
        nextRetryAt: nextRetryAt.toISOString(),
      });
    }

    return { status: "failed", error: err };
  }
}
